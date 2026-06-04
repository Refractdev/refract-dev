import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthenticatedUser } from '../_lib/auth'
import { parseGitHubRepoUrl, githubRequest } from '../_lib/github'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { githubToken } = await getAuthenticatedUser(req.headers.authorization)

    if (!githubToken) {
      return res.status(200).json([])
    }

    const repoUrl = (Array.isArray(req.query.repoUrl) ? req.query.repoUrl[0] : req.query.repoUrl) as string
    if (!repoUrl) {
      return res.status(400).json({ error: 'Missing repoUrl' })
    }

    const { owner, repo } = parseGitHubRepoUrl(repoUrl)

    const data: any[] = await githubRequest<any[]>(
      githubToken,
      `/repos/${owner}/${repo}/commits?per_page=30`,
    )

    const commits = data.map((c: any) => ({
      sha: c.sha,
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }))

    return res.status(200).json(commits)
  } catch {
    return res.status(200).json([])
  }
}
