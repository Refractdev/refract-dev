import { githubRequest } from './github'

const TEXT_PATTERN = /\.(ts|tsx|js|jsx|json|css|html|md)$/i
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache'])
const MAX_FILES = 200

function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const normalized = repoUrl
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')

  const match = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/)
  if (!match) throw new Error('Invalid GitHub repository URL')

  return { owner: match[1], repo: match[2] }
}

/**
 * Clone a GitHub repository by fetching its file tree and content via the GitHub REST API.
 * Returns a map of relative file paths to UTF-8 text content.
 * Skips binary files and limits to MAX_FILES text files.
 */
export async function cloneRepo(
  repoUrl: string,
  token: string | null | undefined,
  branch?: string,
): Promise<Record<string, string>> {
  if (!token) {
    throw new Error('GitHub token required to clone repository')
  }

  const { owner, repo } = parseGitHubRepoUrl(repoUrl)
  const ref = branch || 'HEAD'

  const treeData = await githubRequest(token, `/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`)
  const tree = treeData.tree as Array<{ path: string; type: string; mode: string }>

  const textFiles = tree
    .filter((entry) => {
      if (entry.type !== 'blob') return false
      const parts = entry.path.split('/')
      if (parts.some((p) => IGNORE_DIRS.has(p))) return false
      return TEXT_PATTERN.test(entry.path)
    })
    .slice(0, MAX_FILES)

  const files: Record<string, string> = {}

  for (const file of textFiles) {
    try {
      const contentData = await githubRequest(
        token,
        `/repos/${owner}/${repo}/contents/${file.path}?ref=${ref}`,
      )
      if (contentData.content && contentData.encoding === 'base64') {
        files[file.path] = Buffer.from(contentData.content, 'base64').toString('utf-8')
      }
    } catch {
      // Skip files that fail to fetch (binary, too large, etc.)
    }
  }

  return files
}
