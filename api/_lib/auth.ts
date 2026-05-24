import { getAdminSupabaseClient } from './supabase'

// ─── Gerar JWT para autenticar como GitHub App ────────────────────────────────

async function generateAppJWT(): Promise<string> {
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!privateKey) throw new Error('GITHUB_APP_PRIVATE_KEY not defined')

  privateKey = privateKey.replace(/\\n/g, '\n')
  if (privateKey.startsWith('"')) privateKey = privateKey.slice(1, -1)

  const appId = process.env.GITHUB_APP_ID
  if (!appId) throw new Error('GITHUB_APP_ID not defined')

  // Converter PKCS#1 (BEGIN RSA PRIVATE KEY) para PKCS#8 (BEGIN PRIVATE KEY)
  const { createPrivateKey } = await import('node:crypto')
  const keyObject = createPrivateKey({ key: privateKey, format: 'pem' })
  const pkcs8pem = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string

  const { importPKCS8, SignJWT } = await import('jose')
  const privateKeyObj = await importPKCS8(pkcs8pem, 'RS256')

  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ iss: appId })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 540)
    .sign(privateKeyObj)
}


// ─── Gerar Installation Access Token ─────────────────────────────────────────

export async function getInstallationToken(installationId: number): Promise<string> {
  const appJWT = await generateAppJWT()

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

async function getAuthenticatedProfile(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization header')
  }

  const supabase = getAdminSupabaseClient()
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

  if (error || !user) throw new Error('Invalid session')

  const { data: profile } = await supabase
    .from('users')
    .select('plan, github_installation_id')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user,
    plan: profile?.plan ?? 'free',
    installationId: profile?.github_installation_id ?? null,
  }
}

export async function getAuthenticatedUser(authHeader: string | undefined) {
  const { user, plan, installationId } = await getAuthenticatedProfile(authHeader)

  if (!installationId) {
    throw new Error('GitHub App not installed')
  }

  const installationToken = await getInstallationToken(installationId)

  return {
    user,
    plan,
    githubToken: installationToken,
    installationId,
  }
}

export async function getAuthenticatedUserWithOptionalGitHub(
  authHeader: string | undefined
) {
  const { user, plan, installationId } = await getAuthenticatedProfile(authHeader)

  if (!installationId) {
    return {
      user,
      plan,
      githubToken: null,
      installationId: null,
    }
  }

  const installationToken = await getInstallationToken(installationId)

  return {
    user,
    plan,
    githubToken: installationToken,
    installationId,
  }
}
