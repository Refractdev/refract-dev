import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabaseClient } from './_lib/supabase'
import { checkRateLimit, applyRateLimitHeaders } from './_lib/ratelimit'
import { canonicalizePath, normalizePath } from '../src/engine/path'

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
    const errorPayload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(errorPayload?.message ?? `GitHub request failed (${response.status})`)
  }

  return response.json()
}

async function getGitHubToken(userId: string): Promise<string> {
  const supabase = getAdminSupabaseClient()
  const { data: profile } = await supabase
    .from('users')
    .select('github_token')
    .eq('id', userId)
    .maybeSingle()

  const token = (profile as any)?.github_token as string | null
  if (!token) throw new Error('GitHub not connected - please reconnect your GitHub account')
  return token
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
        const normalizedPath = normalizePath(file.path)
        if (!normalizedPath) continue
        files[normalizedPath] = Buffer.from(contentData.content, 'base64').toString('utf-8')
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
  const canonicalChanges = input.changes.map(({ filePath, newContent }) => {
    const result = canonicalizePath(filePath)
    return { originalPath: filePath, canonicalPath: result.path, suspicious: result.suspicious, newContent }
  })
  const invalidChange = canonicalChanges.find((change) => !change.canonicalPath || change.suspicious)
  if (invalidChange) {
    throw new Error(`Invalid file path in PR payload: ${invalidChange.originalPath}`)
  }

  const changes = Array.from(
    new Map(
      canonicalChanges.map((change) => [
        change.canonicalPath,
        { filePath: change.canonicalPath, newContent: change.newContent },
      ]),
    ).values(),
  )

  if (changes.length === 0) {
    throw new Error('No changes to commit')
  }

  const baseRef = await githubRequest(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(input.baseBranch)}`)
  const baseCommitSha = baseRef.object.sha
  const baseCommit = await githubRequest(token, `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`)
  console.log(`[github/pr] ${owner}/${repo}: base ${input.baseBranch}@${baseCommitSha.slice(0, 7)}, ${changes.length} file(s)`)

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
  console.log(`[github/pr] created ${blobs.length} blob(s)`)

  const tree = await githubRequest(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
  })

  // If the resulting tree is identical to base, the commit would be empty.
  // Abort rather than opening a PR with zero file changes.
  if (tree.sha === baseCommit.tree.sha) {
    console.warn(`[github/pr] tree identical to base (${tree.sha.slice(0, 7)}) — no effective changes`)
    throw new Error('No effective changes — the proposed files match the base branch')
  }
  console.log(`[github/pr] tree ${tree.sha.slice(0, 7)}`)

  const commit = await githubRequest(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'refract: apply code quality fixes',
      tree: tree.sha,
      parents: [baseCommitSha],
    }),
  })
  console.log(`[github/pr] commit ${commit.sha.slice(0, 7)}`)

  await githubRequest(token, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${input.headBranch}`, sha: commit.sha }),
  })
  console.log(`[github/pr] pushed branch ${input.headBranch}`)

  const pr = await githubRequest(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.headBranch,
      base: input.baseBranch,
    }),
  })
  console.log(`[github/pr] opened PR ${pr.html_url}`)

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

    const token = await getGitHubToken(user.id)

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