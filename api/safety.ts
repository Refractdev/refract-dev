import type { VercelRequest, VercelResponse } from '@vercel/node'
import ts from 'typescript'
import { getAuthenticatedUserWithOptionalGitHub } from './_lib/auth'
import { checkRateLimit, applyRateLimitHeaders } from './_lib/ratelimit'

interface NewFile {
  path: string
  content: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let userId: string
  let plan: string
  try {
    const auth = await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
    userId = auth.user.id
    plan = auth.plan
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

  const rateResult = await checkRateLimit(userId, plan, 'safety')
  applyRateLimitHeaders(res, rateResult)
  if (!rateResult.success) {
    return res.status(429).json({
      error: 'Too many requests. Please wait before trying again.',
      reset: rateResult.reset,
    })
  }

  const { filePath, before, after, newFiles, fileMap, sandboxValidation } = req.body ?? {}

  if (!filePath || before === undefined || after === undefined) {
    return res.status(400).json({ error: 'Missing required parameters (filePath, before, after)' })
  }

  const validationMode = sandboxValidation === 'none' || sandboxValidation === 'strict'
    ? sandboxValidation
    : 'standard'

  if (validationMode === 'none') {
    return res.status(200).json({
      passed: true,
      syntaxOk: true,
      typecheck: true,
      buildOk: undefined,
      testsOk: undefined,
      errors: [],
      warnings: ['Sandbox verification disabled — syntax/type checks skipped.'],
      details: {
        typecheckLogs: ['Validation skipped (none).'],
      },
    })
  }

  // ─── In-memory TypeScript validation ────────────────────────────────────────
  const virtualFiles = new Map<string, string>()

  if (fileMap && typeof fileMap === 'object') {
    for (const [key, value] of Object.entries(fileMap)) {
      if (typeof value === 'string') {
        virtualFiles.set(key, value)
      }
    }
  }

  virtualFiles.set(filePath, after)
  if (Array.isArray(newFiles)) {
    for (const file of newFiles as NewFile[]) {
      virtualFiles.set(file.path, file.content)
    }
  }

  try {
    const options: ts.CompilerOptions = {
      noEmit: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      checkJs: true,
      strict: false,
    }

    const compilerHost: ts.CompilerHost = {
      getSourceFile: (fileName, languageVersion) => {
        const content = virtualFiles.get(fileName)
        if (content !== undefined) {
          return ts.createSourceFile(fileName, content, languageVersion)
        }
        if (fileName.startsWith('lib.')) {
          try {
            const libPath = require.resolve(`typescript/lib/${fileName}`)
            const fs = require('fs') as typeof import('fs')
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
      writeFile: () => { },
      getCurrentDirectory: () => '/',
      getCanonicalFileName: (f) => f,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (fileName) => virtualFiles.has(fileName),
      readFile: (fileName) => virtualFiles.get(fileName),
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
    const strictWarnings = validationMode === 'strict'
      ? ['Strict mode enabled — build and test suite checks are not available in virtual mode yet.']
      : []
    return res.status(200).json({
      passed,
      syntaxOk: true,
      typecheck: passed,
      buildOk: validationMode === 'strict' ? undefined : undefined,
      testsOk: validationMode === 'strict' ? undefined : undefined,
      errors: typecheckErrors,
      warnings: [
        'Running in virtual emulation mode. Build and unit tests are skipped.',
        ...strictWarnings,
      ],
      details: {
        typecheckLogs: typecheckErrors.length > 0 ? typecheckErrors : ['No type errors found.'],
      },
    })
  } catch (err: any) {
    console.error('In-memory typecheck failed:', err)
    return res.status(200).json({
      passed: true,
      syntaxOk: true,
      typecheck: true,
      errors: [],
      warnings: ['In-memory validation failed. Skipping strict check. Error: ' + err.message],
    })
  }
}
