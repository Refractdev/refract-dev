import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import { Volume, createFsFromVolume } from 'memfs'
import path from 'path'

const TEXT_FILE_PATTERN = /\.(ts|tsx|js|jsx|json|css|html|md)$/i
const IGNORE = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage'])

export async function cloneRepo(repoUrl: string, token: string | null, branch?: string): Promise<Record<string, string>> {
  const vol = new Volume()
  const fs = createFsFromVolume(vol)

  const auth = token ? { username: token, password: 'x-oauth-basic' } : undefined

  await git.clone({
    fs,
    http,
    dir: '/repo',
    url: repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`,
    ref: branch,
    singleBranch: true,
    depth: 1,
    noTags: true,
    noCheckout: true,
    onAuth: () => auth,
  })

  const files: Record<string, string> = {}
  await git.walk({
    fs,
    dir: '/repo',
    trees: [git.TREE({ ref: 'HEAD' })],
    map: async (filepath, [entry]) => {
      if (!entry) return null
      const type = await entry.type()
      const filename = path.basename(filepath)
      if (IGNORE.has(filename)) return null
      const parts = filepath.split('/')
      if (parts.some((part) => IGNORE.has(part))) return null
      if (type === 'tree') return filepath
      if (type !== 'blob') return null
      if (!TEXT_FILE_PATTERN.test(filename)) return null
      const contentBuffer = await entry.content()
      if (!contentBuffer) return null
      files[filepath] = new TextDecoder().decode(contentBuffer)
      return filepath
    },
  })

  return files
}
