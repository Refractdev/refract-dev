import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Gerar JWT para autenticar como GitHub App ────────────────────────────────

function generateAppJWT(): string {
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('GITHUB_APP_PRIVATE_KEY environment variable is not defined')
  }

  // Strip wrapping quotes if present
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1)
  } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.slice(1, -1)
  }

  // Replace literal backslash-n with actual newlines
  privateKey = privateKey.replace(/\\n/g, '\n').replace(/\\r/g, '\r')

  const appId = process.env.GITHUB_APP_ID
  if (!appId) {
    throw new Error('GITHUB_APP_ID environment variable is not defined')
  }

  return jwt.sign(
    { iat: Math.floor(Date.now() / 1000) - 60, exp: Math.floor(Date.now() / 1000) + 540, iss: appId },
    privateKey,
    { algorithm: 'RS256' }
  )
}

// ─── Gerar Installation Access Token ─────────────────────────────────────────

export async function getInstallationToken(installationId: number): Promise<string> {
  const appJWT = generateAppJWT()

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJWT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to get installation token: ${err}`)
  }

  const data = await res.json()
  return data.token
}

// ─── Autenticar utilizador via Supabase session ───────────────────────────────

export async function getAuthenticatedUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization header')
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

  if (error || !user) throw new Error('Invalid session')

  const { data: profile } = await supabase
    .from('users')
    .select('plan, github_installation_id')
    .eq('id', user.id)
    .single()

  if (!profile?.github_installation_id) {
    throw new Error('GitHub App not installed')
  }

  const installationToken = await getInstallationToken(profile.github_installation_id)

  return {
    user,
    plan: profile.plan ?? 'free',
    githubToken: installationToken,
    installationId: profile.github_installation_id,
  }
}
