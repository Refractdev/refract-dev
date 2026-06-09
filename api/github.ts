import type { VercelRequest, VercelResponse } from '@vercel/node'
import path from 'path'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import { Volume, createFsFromVolume } from 'memfs'
import { getAuthenticatedUser, getAuthenticatedUserWithOptionalGitHub } from './_lib/auth'
import { parseGitHubRepoUrl, githubRequest } from './_lib/github'
import { trackEvent } from '../src/lib/analytics'

const TEXT_FILE_PATTERN = /\.(ts|tsx|js|jsx|json|css|html|md)$/i
const IGNORE = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage'])

async function getFilesFromGit(fs: any): Promise<Record<string, string>> {
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

      if (type === 'tree') {
        return filepath // recurse
      }

      if (type !== 'blob') return null
      if (!TEXT_FILE_PATTERN.test(filename)) return null

      const contentBuffer = await entry.content()
      if (!contentBuffer) return null

      const content = new TextDecoder().decode(contentBuffer)
      files[filepath] = content
      return filepath
    },
  })

  return files
}

interface PullRequestChange {
  filePath: string
  newContent: string
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function handleBranches(req: VercelRequest, res: VercelResponse) {
  try {
    const { githubToken } = await getAuthenticatedUser(req.headers.authorization)

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

async function handleClone(req: VercelRequest, res: VercelResponse) {
  try {
    const { githubToken } = await getAuthenticatedUserWithOptionalGitHub(
      req.headers.authorization
    )

    const { repoUrl, branch } = req.body ?? {}
    if (!repoUrl) {
      return res.status(400).json({ error: 'Missing repoUrl' })
    }

    // Resolve the repository URL and details
    let normalizedRepoUrl = repoUrl.trim()
    let isGitHub = false
    let owner = ''
    let repo = ''

    try {
      const parsed = parseGitHubRepoUrl(repoUrl)
      owner = parsed.owner
      repo = parsed.repo
      normalizedRepoUrl = parsed.repoUrl
      isGitHub = true
    } catch {
      // Not a standard GitHub URL, keep as is
    }

    // Detect default branch if not specified
    let branchName = branch
    if (!branchName) {
      try {
        const remoteInfo = await git.getRemoteInfo({
          http,
          url: normalizedRepoUrl.endsWith('.git') ? normalizedRepoUrl : `${normalizedRepoUrl}.git`,
          onAuth: githubToken
            ? () => ({
                username: githubToken,
                password: 'x-oauth-basic',
              })
            : undefined,
        })
        branchName = remoteInfo.HEAD ? remoteInfo.HEAD.replace('refs/heads/', '') : 'main'
      } catch (err) {
        console.warn('Failed to get remote info, trying fallback options', err)
        if (isGitHub) {
          try {
            const repoMeta = await githubRequest<any>(githubToken, `/repos/${owner}/${repo}`)
            branchName = repoMeta.default_branch || 'main'
          } catch {
            branchName = 'main'
          }
        } else {
          branchName = 'main'
        }
      }
    }

    const vol = new Volume()
    const fs = createFsFromVolume(vol)

    await git.clone({
      fs,
      http,
      dir: '/repo',
      url: normalizedRepoUrl.endsWith('.git') ? normalizedRepoUrl : `${normalizedRepoUrl}.git`,
      ref: branchName,
      singleBranch: true,
      depth: 1,
      noTags: true,
      noCheckout: true,
      onAuth: githubToken
        ? () => ({
            username: githubToken,
            password: 'x-oauth-basic',
          })
        : undefined,
    })

    const files = await getFilesFromGit(fs)

    return res.status(200).json({
      files,
      branch: branchName,
    })
  } catch (error: any) {
    const status =
      error.message === 'Missing authorization header' || error.message === 'Invalid session'
        ? 401
        : 500
    return res.status(status).json({ error: error.message || 'Failed to clone repository' })
  }
}

async function handleCommits(req: VercelRequest, res: VercelResponse) {
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
      `/repos/${owner}/${repo}/commits?per_page=30`
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

async function handleRepos(req: VercelRequest, res: VercelResponse) {
  try {
    const { githubToken, installationId } = await getAuthenticatedUser(req.headers.authorization)

    console.log(`[github/repos] Fetching repos for installationId: ${installationId}`)

    // Installation token só acede aos repos onde a App foi instalada
    const repos = await githubRequest<any[]>(
      githubToken,
      '/installation/repositories?per_page=50'
    )

    // GitHub App endpoint retorna { repositories: [...] }
    const list = (repos as any).repositories ?? repos

    console.log(`[github/repos] Returned ${list.length} repositories`)
    return res.status(200).json(list)
  } catch (err: any) {
    const isNotInstalled = err.message === 'GitHub App not installed'
    console.error('[github/repos] Error:', err.message, err.stack)
    return res.status(isNotInstalled ? 403 : 500).json({
      error: err.message ?? 'Failed to fetch repos',
      detail: err.stack ?? null,
    })
  }
}

async function handlePr(req: VercelRequest, res: VercelResponse) {
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

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string

  switch (action) {
    case 'branches':
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      return handleBranches(req, res)
    case 'clone':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      return handleClone(req, res)
    case 'commits':
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      return handleCommits(req, res)
    case 'repos':
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      return handleRepos(req, res)
    case 'pr':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      return handlePr(req, res)
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` })
  }
}
