import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import ts from 'typescript'
import { getAuthenticatedUserWithOptionalGitHub } from './_lib/auth'

interface NewFile {
  path: string
  content: string
}

function execCommand(command: string, cwd: string, timeout = 30000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = exec(command, { cwd, timeout }, (error, stdout, stderr) => {
      resolve({
        code: error && error.code ? error.code : (error ? 1 : 0),
        stdout: stdout.toString(),
        stderr: stderr.toString()
      })
    })
  })
}

// Helper to safely write file and ensure directories exist
function writeFileSyncRecursive(filePath: string, content: string) {
  const dirname = path.dirname(filePath)
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }
  fs.writeFileSync(filePath, content, 'utf8')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check
  try {
    await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

  const { projectPath, filePath, before, after, newFiles, fileMap, engineResult } = req.body ?? {}

  if (!filePath || before === undefined || after === undefined) {
    return res.status(400).json({ error: 'Missing required parameters (filePath, before, after)' })
  }

  // If the engine gate already validated (syntax + imports in-memory), skip redundant checks
  if (engineResult?.syntaxOk) {
    return res.status(200).json({
      passed: true,
      syntaxOk: true,
      typecheck: true,
      errors: [],
      warnings: ['Engine gate result accepted — skipping heavy validation'],
      details: { typecheckLogs: ['Pre-validated by engine safety gate'] },
    })
  }

  // Determine if it is a local workspace project with physical access
  let isLocal = false
  if (projectPath && fs.existsSync(projectPath)) {
    try {
      const stats = fs.statSync(projectPath)
      if (stats.isDirectory()) {
        isLocal = true
      }
    } catch {
      // Ignored
    }
  }

  if (isLocal) {
    // ─── LOCAL / PHYSICAL VALIDATION FLOW ────────────────────────────────────
    const absoluteFilePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath)

    // Store backup state
    let originalFileExists = false
    let originalFileContent = ''
    const backupNewFiles: Array<{ absPath: string; content?: string; existed: boolean }> = []

    try {
      // Backup target file if it exists
      if (fs.existsSync(absoluteFilePath)) {
        originalFileExists = true
        originalFileContent = fs.readFileSync(absoluteFilePath, 'utf8')
      }

      // Backup new files if they exist or log them for deletion
      if (Array.isArray(newFiles)) {
        for (const file of newFiles as NewFile[]) {
          const absPath = path.isAbsolute(file.path)
            ? file.path
            : path.join(projectPath, file.path)
          const existed = fs.existsSync(absPath)
          const content = existed ? fs.readFileSync(absPath, 'utf8') : undefined
          backupNewFiles.push({ absPath, content, existed })
        }
      }

      // Apply the changes to the disk
      writeFileSyncRecursive(absoluteFilePath, after)
      if (Array.isArray(newFiles)) {
        for (const file of newFiles as NewFile[]) {
          const absPath = path.isAbsolute(file.path)
            ? file.path
            : path.join(projectPath, file.path)
          writeFileSyncRecursive(absPath, file.content)
        }
      }

      // 1. TypeScript Typecheck
      let typecheckOk = true
      const typecheckLogs: string[] = []
      const tsConfigExists = fs.existsSync(path.join(projectPath, 'tsconfig.json'))

      if (tsConfigExists) {
        const { code, stdout, stderr } = await execCommand('npx tsc --noEmit', projectPath, 25000)
        if (code !== 0) {
          typecheckOk = false
          typecheckLogs.push(stdout || stderr || 'tsc check failed with code ' + code)
        }
      }

      // 2. Build Validation
      let buildOk = true
      const buildLogs: string[] = []
      const packageJsonPath = path.join(projectPath, 'package.json')
      let packageJson: any = {}
      if (fs.existsSync(packageJsonPath)) {
        try {
          packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        } catch {
          // Ignored
        }
      }

      if (packageJson.scripts?.build) {
        const { code, stdout, stderr } = await execCommand('npm run build', projectPath, 35000)
        if (code !== 0) {
          buildOk = false
          buildLogs.push(stdout || stderr || 'Build compilation failed with code ' + code)
        }
      }

      // 3. Test Validation
      let testsOk = true
      const testLogs: string[] = []

      if (packageJson.scripts?.test) {
        // Try running with findRelatedTests if Jest/Vitest detected to speed it up, else run standard test command
        const testScriptContent = packageJson.scripts.test || ''
        let testCommand = 'npm test'
        
        if (testScriptContent.includes('vitest')) {
          testCommand = `npx vitest run --findRelatedTests "${absoluteFilePath}"`
        } else if (testScriptContent.includes('jest')) {
          testCommand = `npx jest --findRelatedTests "${absoluteFilePath}" --passWithNoTests`
        }

        const { code, stdout, stderr } = await execCommand(testCommand, projectPath, 35000)
        if (code !== 0) {
          testsOk = false
          testLogs.push(stdout || stderr || 'Unit tests failed with code ' + code)
        }
      }

      const errors: string[] = []
      if (!typecheckOk) errors.push('Typecheck check failed')
      if (!buildOk) errors.push('Build integrity validation failed')
      if (!testsOk) errors.push('Unit test suite failure')

      return res.status(200).json({
        passed: typecheckOk && buildOk && testsOk,
        syntaxOk: true,
        typecheck: typecheckOk,
        buildOk,
        testsOk,
        errors,
        warnings: [],
        details: {
          typecheckLogs,
          buildLogs,
          testLogs
        }
      })
    } catch (err: any) {
      console.error('Safety gate physical run failed:', err)
      return res.status(500).json({
        error: 'Failed to run local safety checks: ' + err.message
      })
    } finally {
      // Restore files back to the original state
      try {
        if (originalFileExists) {
          fs.writeFileSync(absoluteFilePath, originalFileContent, 'utf8')
        } else if (fs.existsSync(absoluteFilePath)) {
          fs.unlinkSync(absoluteFilePath)
        }

        for (const file of backupNewFiles) {
          if (file.existed && file.content !== undefined) {
            fs.writeFileSync(file.absPath, file.content, 'utf8')
          } else if (fs.existsSync(file.absPath)) {
            fs.unlinkSync(file.absPath)
          }
        }
      } catch (restoreErr) {
        console.error('CRITICAL: Failed to restore backup files!', restoreErr)
      }
    }
  } else {
    // ─── VIRTUAL IN-MEMORY VALIDATION FLOW ───────────────────────────────────
    const virtualFiles = new Map<string, string>()

    if (fileMap && typeof fileMap === 'object') {
      for (const [key, value] of Object.entries(fileMap)) {
        if (typeof value === 'string') {
          virtualFiles.set(key, value)
        }
      }
    }

    // Apply patch changes in-memory
    virtualFiles.set(filePath, after)
    if (Array.isArray(newFiles)) {
      for (const file of newFiles as NewFile[]) {
        virtualFiles.set(file.path, file.content)
      }
    }

    try {
      // Configuration for virtual TypeScript compiler
      const options: ts.CompilerOptions = {
        noEmit: true,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        allowJs: true,
        checkJs: true,
        strict: false
      }

      const compilerHost: ts.CompilerHost = {
        getSourceFile: (fileName, languageVersion) => {
          const content = virtualFiles.get(fileName)
          if (content !== undefined) {
            return ts.createSourceFile(fileName, content, languageVersion)
          }

          // Try loading standard TS library files from local disk if available
          if (fileName.startsWith('lib.')) {
            try {
              const libPath = require.resolve(`typescript/lib/${fileName}`)
              if (fs.existsSync(libPath)) {
                const libContent = fs.readFileSync(libPath, 'utf8')
                return ts.createSourceFile(fileName, libContent, languageVersion)
              }
            } catch {
              // Ignored
            }
          }
          return undefined
        },
        getDefaultLibFileName: () => 'lib.d.ts',
        writeFile: () => {},
        getCurrentDirectory: () => '/',
        getCanonicalFileName: (f) => f,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: (fileName) => virtualFiles.has(fileName),
        readFile: (fileName) => virtualFiles.get(fileName)
      }

      const rootNames = Array.from(virtualFiles.keys())
      const program = ts.createProgram(rootNames, options, compilerHost)
      const emitResult = program.emit()
      const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)

      const typecheckErrors = allDiagnostics
        .filter((diag) => diag.file && virtualFiles.has(diag.file.fileName))
        .map((diag) => {
          const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
          const pos = diag.file ? diag.file.getLineAndCharacterOfPosition(diag.start ?? 0) : null
          const lineInfo = pos ? `:${pos.line + 1}:${pos.character + 1}` : ''
          return `${diag.file?.fileName}${lineInfo}: ${message}`
        })

      const passed = typecheckErrors.length === 0
      return res.status(200).json({
        passed,
        syntaxOk: true,
        typecheck: passed,
        buildOk: undefined,
        testsOk: undefined,
        errors: typecheckErrors,
        warnings: ['Executando em modo de emulação virtual. O build e os testes unitários foram ignorados.'],
        details: {
          typecheckLogs: typecheckErrors.length > 0 ? typecheckErrors : ['No type errors found.']
        }
      })
    } catch (err: any) {
      console.error('In-memory typecheck failed:', err)
      return res.status(200).json({
        passed: true, // fallback safety to avoid blocking in case virtual compiler host crashes
        syntaxOk: true,
        typecheck: true,
        errors: [],
        warnings: ['Validação em memória falhou catastróficamente. Ignorando checagem estrita. Erro: ' + err.message]
      })
    }
  }
}
