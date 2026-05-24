import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthenticatedUser } from '../_lib/auth'

async function githubRequest<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub API error: ${err}`)
  }

  return res.json()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { githubToken } = await getAuthenticatedUser(req.headers.authorization)

    // Installation token só acede aos repos onde a App foi instalada
    const repos = await githubRequest<any[]>(
      githubToken,
      '/installation/repositories?per_page=50'
    )

    // GitHub App endpoint retorna { repositories: [...] }
    const list = (repos as any).repositories ?? repos

    return res.status(200).json(list)
  } catch (err: any) {
    const isUnauthorized =
      err.message === 'Missing authorization header' || err.message === 'Invalid session'
    const isNotInstalled = err.message === 'GitHub App not installed'
    return res.status(isUnauthorized ? 401 : isNotInstalled ? 403 : 500).json({
      error: err.message ?? 'Failed to fetch repos',
      stack: err.stack ?? null,
    })
  }
}
