import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCAL_SMOKE_TEST_PATH = '/tmp/refract-test-project'
const TEXT_FILE_PATTERN = /\.(ts|tsx|js|jsx|json|css|html|md|yml|yaml|txt)$/i
const IGNORE_NAMES = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage'])

async function readDirectoryRecursive(root: string, dir: string, files: Record<string, string>) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) continue

    const absolutePath = path.join(dir, entry.name)
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      await readDirectoryRecursive(root, absolutePath, files)
      continue
    }

    if (!TEXT_FILE_PATTERN.test(entry.name)) continue

    const content = await fs.readFile(absolutePath, 'utf8')
    files[relativePath] = content
  }
}

async function handleHealth(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
  })
}

async function handleTestEnv(req: VercelRequest, res: VercelResponse) {
  try {
    let privateKey = process.env.GITHUB_APP_PRIVATE_KEY
    if (!privateKey) {
      return res.status(500).json({ error: 'GITHUB_APP_PRIVATE_KEY is not defined' })
    }

    const originalLength = privateKey.length
    const startsWithQuote = privateKey.startsWith('"')
    const endsWithQuote = privateKey.endsWith('"')

    let keyAfterReplace = privateKey.replace(/\\n/g, '\n')
    let keyAfterSlice = keyAfterReplace
    if (keyAfterSlice.startsWith('"')) {
      keyAfterSlice = keyAfterSlice.slice(1, -1)
    }

    const { createPrivateKey } = await import('node:crypto')
    let success = false
    let errMessage = ''
    let pkcs8pem = ''
    try {
      const keyObject = createPrivateKey({ key: keyAfterSlice, format: 'pem' })
      pkcs8pem = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string
      const { importPKCS8 } = await import('jose')
      await importPKCS8(pkcs8pem, 'RS256')
      success = true
    } catch (e: any) {
      errMessage = e.message
    }

    return res.status(200).json({
      originalLength,
      startsWithQuote,
      endsWithQuote,
      first50_orig: privateKey.substring(0, 50),
      last50_orig: privateKey.substring(privateKey.length - 50),
      first50_processed: keyAfterSlice.substring(0, 50),
      last50_processed: keyAfterSlice.substring(keyAfterSlice.length - 50),
      success,
      errMessage,
    })
  } catch (err: any) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    })
  }
}

async function handleLoadProject(_req: VercelRequest, res: VercelResponse) {
  try {
    const stats = await fs.stat(LOCAL_SMOKE_TEST_PATH)
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Smoke test path is not a directory' })
    }

    const files: Record<string, string> = {}
    await readDirectoryRecursive(LOCAL_SMOKE_TEST_PATH, LOCAL_SMOKE_TEST_PATH, files)

    return res.status(200).json({
      path: LOCAL_SMOKE_TEST_PATH,
      name: 'refract-test-project',
      files,
      fileCount: Object.keys(files).length,
    })
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to load local smoke test project',
    })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const action = req.query.action as string

  switch (action) {
    case 'health':
      return handleHealth(req, res)
    case 'test-env':
      return handleTestEnv(req, res)
    case 'load-project':
      return handleLoadProject(req, res)
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` })
  }
}
