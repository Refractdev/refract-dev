const GITHUB_API_BASE = 'https://api.github.com'

export interface ParsedGitHubRepo {
  owner: string
  repo: string
  repoUrl: string
}

export function parseGitHubRepoUrl(repoUrl: string): ParsedGitHubRepo {
  const normalized = repoUrl
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')

  const match = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/)
  if (!match) {
    throw new Error('Invalid GitHub repository URL')
  }

  const [, owner, repo] = match
  return {
    owner,
    repo,
    repoUrl: `https://github.com/${owner}/${repo}`,
  }
}

export async function githubRequest<T>(
  githubToken: string | null | undefined,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}))
    throw new Error(errorPayload.message ?? 'GitHub request failed')
  }

  return response.json() as Promise<T>
}
