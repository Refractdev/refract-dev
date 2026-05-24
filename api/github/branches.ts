import { getAuthenticatedUser } from '../_lib/auth'
import { parseGitHubRepoUrl, githubRequest } from '../_lib/github'
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/ratelimit'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user, plan, githubToken } = await getAuthenticatedUser(req.headers.authorization)
    const limitResult = await checkRateLimit(user.id, plan)
    applyRateLimitHeaders(res, limitResult)

    if (!limitResult.success) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: plan === 'free'
          ? 'Limite do plano Free atingido (20/hora). Faz upgrade para Pro.'
          : `Limite atingido. Reset: ${new Date(limitResult.reset).toLocaleTimeString('pt-PT')}`,
        reset: limitResult.reset,
      })
    }

    if (!githubToken) {
      return res.status(400).json({ error: 'GitHub account not connected' })
    }

    const repoUrl = Array.isArray(req.query.repoUrl) ? req.query.repoUrl[0] : req.query.repoUrl
    if (!repoUrl) {
      return res.status(400).json({ error: 'Missing repoUrl' })
    }

    const { owner, repo } = parseGitHubRepoUrl(repoUrl)
    const repoMeta = await githubRequest<any>(githubToken, `/repos/${owner}/${repo}`)
    const branches = await githubRequest<any[]>(githubToken, `/repos/${owner}/${repo}/branches?per_page=100`)

    return res.status(200).json({
      branches: branches.map((branch) => ({
        name: branch.name,
        isDefault: branch.name === repoMeta.default_branch,
      })),
    })
  } catch (error: any) {
    const status =
      error.message === 'Missing authorization header' || error.message === 'Invalid session'
        ? 401
        : 500
    return res.status(status).json({ error: error.message || 'Failed to load GitHub branches' })
  }
}
