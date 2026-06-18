import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabaseClient } from './_lib/supabase'
import { checkRateLimit, applyRateLimitHeaders } from './_lib/ratelimit'

const GITHUB_API_BASE = 'https://api.github.com'

async function githubRequest(
  token: string,
  path: string,
  init?: RequestInit
): Promise<any> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}))
    throw new Error(errorPayload.message ?? `GitHub request failed (${response.status})`)
  }

  return response.json()
}

async function getGitHubToken(authHeader: string | undefined): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization header')
  }
  const supabase = getAdminSupabaseClient()
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  if (error || !user) throw new Error('Invalid session')

  const { data: sessionData, error: sessionError } = await supabase.auth.admin.getUserById(user.id)
  if (sessionError || !sessionData?.user) throw new Error('Failed to get user session')

  // Get the provider_token from the user's identities
  const identities = sessionData.user.identities ?? []
  const githubIdentity = identities.find((id: any) => id.provider === 'github')
  const providerToken = (githubIdentity as any)?.identity_data?.provider_token ?? null

  if (!providerToken) {
    // Try getting from session
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token
    if (!token) throw new Error('GitHub not connected - please login with GitHub')
    return token
  }

  return providerToken
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function handleRepos(token: string) {
  const data = await githubRequest(token, '/user/repos?per_page=50&sort=updated&type=all')
  return data.map((r: any) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    description: r.description,
    private: r.private,
    language: r.language,
    default_branch: r.default_branch,
    updated_at: r.updated_at,
    html_url: r.html_url,
  }))
}

async function handleBranches(token: string, repoUrl: string) {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl)
  const repoMeta = await githubRequest(token, `/repos/${owner}/${repo}`)
  const branches = await githubRequest(token, `/repos/${owner}/${repo}/branches?per_page=100`)
  return branches.map((b: any) => ({
    name: b.name,
    isDefault: b.name === repoMeta.default_branch,
  }))
}

async function handleCommits(token: string, repoUrl: string) {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl)
  const data = await githubRequest(token, `/repos/${owner}/${repo}/commits?per_page=30`)
  return data.map((c: any) => ({
    sha: c.sha,
    message: c.commit.message.split('\n')[0],
    author: c.commit.author.name,
    date: c.commit.author.date,
    url: c.html_url,
  }))
}

async function handleClone(token: string, repoUrl: string, branch?: string) {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl)
  const ref = branch || 'HEAD'
  const treeData = await githubRequest(token, `/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`)
  const tree = treeData.tree as Array<{ path: string; type: string; mode: string }>

  const TEXT_PATTERN = /\.(ts|tsx|js|jsx|json|css|html|md)$/i
  const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache'])

  const textFiles = tree.filter((entry) => {
    if (entry.type !== 'blob') return false
    const parts = entry.path.split('/')
    if (parts.some((p) => IGNORE_DIRS.has(p))) return false
    return TEXT_PATTERN.test(entry.path)
  }).slice(0, 200)

  const files: Record<string, string> = {}
  for (const file of textFiles) {
    try {
      const contentData = await githubRequest(token, `/repos/${owner}/${repo}/contents/${file.path}?ref=${ref}`)
      if (contentData.content && contentData.encoding === 'base64') {
        files[file.path] = Buffer.from(contentData.content, 'base64').toString('utf-8')
      }
    } catch {
      // skip files that fail
    }
  }

  let branchName = branch || 'main'
  if (!branch) {
    try {
      const repoMeta = await githubRequest(token, `/repos/${owner}/${repo}`)
      branchName = repoMeta.default_branch || 'main'
    } catch {
      // keep default
    }
  }

  return { files, branch: branchName }
}

async function handlePr(token: string, input: {
  repoUrl: string
  baseBranch: string
  headBranch: string
  title: string
  body: string
  changes: Array<{ filePath: string; newContent: string }>
}) {
  const { owner, repo } = parseGitHubRepoUrl(input.repoUrl)
  const changes = Array.from(new Map(input.changes.map((c) => [c.filePath, c])).values())

  const baseRef = await githubRequest(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(input.baseBranch)}`)
  const baseCommitSha = baseRef.object.sha
  const baseCommit = await githubRequest(token, `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`)

  const blobs = await Promise.all(
    changes.map(async ({ filePath, newContent }) => {
      const blob = await githubRequest(token, `/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
          content: Buffer.from(newContent, 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      })
      return { path: filePath, mode: '100644', type: 'blob', sha: blob.sha }
    })
  )

  const tree = await githubRequest(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
  })

  const commit = await githubRequest(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'refract: apply code quality fixes',
      tree: tree.sha,
      parents: [baseCommitSha],
    }),
  })

  await githubRequest(token, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${input.headBranch}`, sha: commit.sha }),
  })

  const pr = await githubRequest(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.headBranch,
      base: input.baseBranch,
    }),
  })

  return { url: pr.html_url }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Router ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string

  try {
    const supabaseAdmin = getAdminSupabaseClient()
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' })
    }
    const accessToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken)
    if (userError || !user) return res.status(401).json({ error: 'Invalid session' })

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .maybeSingle()
    const plan: string = (profile as any)?.plan ?? 'free'

    const rateResult = await checkRateLimit(user.id, plan, 'github')
    applyRateLimitHeaders(res, rateResult)
    if (!rateResult.success) {
      return res.status(429).json({
        error: 'Too many requests. Please wait before trying again.',
        reset: rateResult.reset,
      })
    }

    const token = await getGitHubToken(req.headers.authorization)

    switch (action) {
      case 'repos': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
        const repos = await handleRepos(token)
        return res.status(200).json(repos)
      }
      case 'branches': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
        const repoUrl = req.query.repoUrl as string
        if (!repoUrl) return res.status(400).json({ error: 'Missing repoUrl' })
        const branches = await handleBranches(token, repoUrl)
        return res.status(200).json({ branches })
      }
      case 'commits': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
        const repoUrl = req.query.repoUrl as string
        if (!repoUrl) return res.status(400).json({ error: 'Missing repoUrl' })
        const commits = await handleCommits(token, repoUrl)
        return res.status(200).json(commits)
      }
      case 'clone': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
        const { repoUrl, branch } = req.body ?? {}
        if (!repoUrl) return res.status(400).json({ error: 'Missing repoUrl' })
        const result = await handleClone(token, repoUrl, branch)
        return res.status(200).json(result)
      }
      case 'pr': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
        const input = req.body
        if (!input?.repoUrl || !input?.baseBranch || !input?.headBranch || !input?.title || !input?.body || !input?.changes?.length) {
          return res.status(400).json({ error: 'Missing pull request payload' })
        }
        const result = await handlePr(token, input)
        return res.status(200).json(result)
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err: any) {
    console.error(`[github/${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message || 'GitHub request failed' })
  }
}