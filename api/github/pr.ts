import { getAuthenticatedUser } from '../_lib/auth'
import { githubRequest, parseGitHubRepoUrl } from '../_lib/github'
import { trackEvent } from '../../src/lib/analytics'
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface PullRequestChange {
  filePath: string
  newContent: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user, githubToken } = await getAuthenticatedUser(req.headers.authorization)

    if (!githubToken) {
      return res.status(400).json({ error: 'GitHub account not connected' })
    }

    const { repoUrl, baseBranch, headBranch, title, body, projectId, changes } = req.body as {
      repoUrl?: string
      baseBranch?: string
      headBranch?: string
      title?: string
      body?: string
      projectId?: string
      changes?: PullRequestChange[]
    }

    if (!repoUrl || !baseBranch || !headBranch || !title || !body || !changes?.length) {
      return res.status(400).json({ error: 'Missing pull request payload' })
    }

    const { owner, repo } = parseGitHubRepoUrl(repoUrl)
    const sanitizedChanges = Array.from(
      new Map(changes.map((change) => [change.filePath, change])).values()
    )

    const baseRef = await githubRequest<any>(
      githubToken,
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`
    )
    const baseCommitSha = baseRef.object.sha as string
    const baseCommit = await githubRequest<any>(
      githubToken,
      `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`
    )

    const blobs = await Promise.all(
      sanitizedChanges.map(async ({ filePath, newContent }) => {
        const blob = await githubRequest<any>(githubToken, `/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({
            content: Buffer.from(newContent, 'utf8').toString('base64'),
            encoding: 'base64',
          }),
        })

        return {
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        }
      })
    )

    const tree = await githubRequest<any>(githubToken, `/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: blobs,
      }),
    })

    const commit = await githubRequest<any>(githubToken, `/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: 'refract: apply code quality fixes',
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    })

    await githubRequest<any>(githubToken, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${headBranch}`,
        sha: commit.sha,
      }),
    })

    const pullRequest = await githubRequest<any>(githubToken, `/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        head: headBranch,
        base: baseBranch,
      }),
    })

    void trackEvent('pr_created', {
      project_id: projectId,
      user_id: user.id,
    })

    return res.status(200).json({ url: pullRequest.html_url })
  } catch (error: any) {
    const status =
      error.message === 'Missing authorization header' || error.message === 'Invalid session'
        ? 401
        : 500
    return res.status(status).json({ error: error.message || 'Failed to create pull request' })
  }
}
