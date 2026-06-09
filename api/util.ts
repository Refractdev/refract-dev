import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCAL_SMOKE_TEST_PATH = '/tmp/refract-test-project'
const TEXT_FILE_PATTERN = /\.(ts|tsx|js|jsx|json|css|html|md|yml|yaml|txt)$/i
const IGNORE_NAMES = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage'])

async function readDirectoryRecursive(root: string, dir: string, files: Record<string, string>) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) continue

    const absolutePath = path.join(dir, entry.name)
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      await readDirectoryRecursive(root, absolutePath, files)
      continue
    }

    if (!TEXT_FILE_PATTERN.test(entry.name)) continue

    const content = await fs.readFile(absolutePath, 'utf8')
    files[relativePath] = content
  }
}

async function handleHealth(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
  })
}

async function handleTestEnv(_req: VercelRequest, res: VercelResponse) {
  const report: Record<string, any> = {}

  // ── 1. Variáveis de ambiente presentes ──────────────────────────────────
  const requiredEnvVars = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_WEBHOOK_SECRET',
  ]
  report.envVars = {}
  for (const key of requiredEnvVars) {
    const val = process.env[key]
    report.envVars[key] = val
      ? `SET (${val.length} chars, starts: "${val.substring(0, 20)}...")`
      : 'MISSING ❌'
  }

  // ── 2. Normalizar e parsear a chave privada ─────────────────────────────
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY ?? ''
  let privateKey = rawKey.trim()
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1).trim()
  }
  privateKey = privateKey.replace(/\\n/g, '\n')
  if (!privateKey.includes('\n')) {
    privateKey = privateKey
      .replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n')
      .replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----')
    const headerEnd = privateKey.indexOf('\n') + 1
    const footerStart = privateKey.lastIndexOf('\n-----END')
    if (headerEnd > 0 && footerStart > headerEnd) {
      const header = privateKey.substring(0, headerEnd)
      const body = privateKey.substring(headerEnd, footerStart)
      const footer = privateKey.substring(footerStart)
      const wrappedBody = body.match(/.{1,64}/g)?.join('\n') ?? body
      privateKey = header + wrappedBody + footer
    }
  }

  report.privateKey = {
    rawLength: rawKey.length,
    processedLength: privateKey.length,
    hasNewlines: privateKey.includes('\n'),
    lineCount: privateKey.split('\n').length,
    startsWithBeginRSA: privateKey.trimStart().startsWith('-----BEGIN RSA PRIVATE KEY-----'),
    endsWithEndRSA: privateKey.trimEnd().endsWith('-----END RSA PRIVATE KEY-----'),
    first50: privateKey.substring(0, 50),
    last50: privateKey.substring(Math.max(0, privateKey.length - 50)),
  }

  let pkcs8pem = ''
  try {
    const { createPrivateKey } = await import('node:crypto')
    const keyObject = createPrivateKey({ key: privateKey, format: 'pem' })
    pkcs8pem = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string
    report.parseKey = 'OK ✅'
  } catch (e: any) {
    report.parseKey = `FAILED ❌ — ${e.message}`
  }

  // ── 3. Gerar App JWT ─────────────────────────────────────────────────────
  let appJWT = ''
  if (pkcs8pem) {
    try {
      const { importPKCS8, SignJWT } = await import('jose')
      const privateKeyObj = await importPKCS8(pkcs8pem, 'RS256')
      const appId = process.env.GITHUB_APP_ID ?? ''
      const now = Math.floor(Date.now() / 1000)
      appJWT = await new SignJWT({ iss: appId })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt(now - 60)
        .setExpirationTime(now + 540)
        .sign(privateKeyObj)
      report.generateJWT = 'OK ✅'
    } catch (e: any) {
      report.generateJWT = `FAILED ❌ — ${e.message}`
    }
  } else {
    report.generateJWT = 'SKIPPED (key parse failed)'
  }

  // ── 4. Listar instalações da GitHub App ─────────────────────────────────
  if (appJWT) {
    try {
      const ghRes = await fetch('https://api.github.com/app/installations', {
        headers: {
          Authorization: `Bearer ${appJWT}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      const ghBody = await ghRes.text()
      if (ghRes.ok) {
        const installations = JSON.parse(ghBody)
        report.githubAppInstallations = {
          status: `OK ✅ — ${installations.length} installation(s)`,
          ids: installations.map((i: any) => ({ id: i.id, account: i.account?.login })),
        }
      } else {
        report.githubAppInstallations = `FAILED ❌ — HTTP ${ghRes.status}: ${ghBody.substring(0, 300)}`
      }
    } catch (e: any) {
      report.githubAppInstallations = `FAILED ❌ (network) — ${e.message}`
    }
  } else {
    report.githubAppInstallations = 'SKIPPED (JWT generation failed)'
  }

  // ── 5. Supabase admin client ─────────────────────────────────────────────
  try {
    const { getAdminSupabaseClient } = await import('./_lib/supabase')
    const sb = getAdminSupabaseClient()
    const { error } = await sb.from('users').select('id').limit(1)
    report.supabaseAdmin = error ? `FAILED ❌ — ${error.message}` : 'OK ✅'
  } catch (e: any) {
    report.supabaseAdmin = `FAILED ❌ — ${e.message}`
  }

  return res.status(200).json(report)
}

async function handleLoadProject(_req: VercelRequest, res: VercelResponse) {
  try {
    const stats = await fs.stat(LOCAL_SMOKE_TEST_PATH)
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Smoke test path is not a directory' })
    }

    const files: Record<string, string> = {}
    await readDirectoryRecursive(LOCAL_SMOKE_TEST_PATH, LOCAL_SMOKE_TEST_PATH, files)

    return res.status(200).json({
      path: LOCAL_SMOKE_TEST_PATH,
      name: 'refract-test-project',
      files,
      fileCount: Object.keys(files).length,
    })
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to load local smoke test project',
    })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const action = req.query.action as string

  switch (action) {
    case 'health':
      return handleHealth(req, res)
    case 'test-env':
      return handleTestEnv(req, res)
    case 'load-project':
      return handleLoadProject(req, res)
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` })
  }
}
