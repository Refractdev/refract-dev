import type { VercelRequest, VercelResponse } from '@vercel/node'
import path from 'path';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { Volume, createFsFromVolume } from 'memfs';
import { getAuthenticatedUserWithOptionalGitHub } from '../_lib/auth';
import { githubRequest, parseGitHubRepoUrl } from '../_lib/github';
const TEXT_FILE_PATTERN = /\.(ts|tsx|js|jsx|json|css|html|md)$/i;
const IGNORE = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage']);

async function getFilesFromGit(fs: any): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  await git.walk({
    fs,
    dir: '/repo',
    trees: [git.TREE({ ref: 'HEAD' })],
    map: async (filepath, [entry]) => {
      if (!entry) return null;
      const type = await entry.type();

      const filename = path.basename(filepath);
      if (IGNORE.has(filename)) return null;

      const parts = filepath.split('/');
      if (parts.some((part) => IGNORE.has(part))) return null;

      if (type === 'tree') {
        return filepath; // recurse
      }

      if (type !== 'blob') return null;
      if (!TEXT_FILE_PATTERN.test(filename)) return null;

      const contentBuffer = await entry.content();
      if (!contentBuffer) return null;

      const content = new TextDecoder().decode(contentBuffer);
      files[filepath] = content;
      return filepath;
    },
  });

  return files;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { githubToken } = await getAuthenticatedUserWithOptionalGitHub(
      req.headers.authorization
    );

    const { repoUrl, branch } = req.body ?? {};
    if (!repoUrl) {
      return res.status(400).json({ error: 'Missing repoUrl' });
    }

    // Resolve the repository URL and details
    let normalizedRepoUrl = repoUrl.trim();
    let isGitHub = false;
    let owner = '';
    let repo = '';

    try {
      const parsed = parseGitHubRepoUrl(repoUrl);
      owner = parsed.owner;
      repo = parsed.repo;
      normalizedRepoUrl = parsed.repoUrl;
      isGitHub = true;
    } catch {
      // Not a standard GitHub URL, keep as is
    }

    // Detect default branch if not specified
    let branchName = branch;
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
        });
        branchName = remoteInfo.HEAD ? remoteInfo.HEAD.replace('refs/heads/', '') : 'main';
      } catch (err) {
        console.warn('Failed to get remote info, trying fallback options', err);
        if (isGitHub) {
          try {
            const repoMeta = await githubRequest<any>(githubToken, `/repos/${owner}/${repo}`);
            branchName = repoMeta.default_branch || 'main';
          } catch {
            branchName = 'main';
          }
        } else {
          branchName = 'main';
        }
      }
    }

    const vol = new Volume();
    const fs = createFsFromVolume(vol);

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
    });

    const files = await getFilesFromGit(fs);

    return res.status(200).json({
      files,
      branch: branchName,
    });
  } catch (error: any) {
    const status =
      error.message === 'Missing authorization header' || error.message === 'Invalid session'
        ? 401
        : 500;
    return res.status(status).json({ error: error.message || 'Failed to clone repository' });
  }
}
