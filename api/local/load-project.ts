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

export default async function handler(_req: VercelRequest, res: VercelResponse) {
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
