import { getAdminSupabaseClient } from './supabase'

// ─── Gerar JWT para autenticar como GitHub App ────────────────────────────────

function normalizePrivateKey(raw: string): string {
  // 1. Remove outer quotes se existirem
  let key = raw.trim()
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim()
  }

  // 2. Substitui \n literais (como string de 2 chars) por newlines reais
  key = key.replace(/\\n/g, '\n')

  // 3. Se ainda assim não tiver newlines (linha única), insere-as nos lugares corretos
  if (!key.includes('\n')) {
    key = key
      .replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n')
      .replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----')
    // Quebra o corpo da chave em linhas de 64 chars
    const headerEnd = key.indexOf('\n') + 1
    const footerStart = key.lastIndexOf('\n-----END')
    if (headerEnd > 0 && footerStart > headerEnd) {
      const header = key.substring(0, headerEnd)
      const body = key.substring(headerEnd, footerStart)
      const footer = key.substring(footerStart)
      const wrappedBody = body.match(/.{1,64}/g)?.join('\n') ?? body
      key = header + wrappedBody + footer
    }
  }

  return key
}

async function generateAppJWT(): Promise<string> {
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!rawKey) throw new Error('[auth] GITHUB_APP_PRIVATE_KEY is not set in environment variables')

  const appId = process.env.GITHUB_APP_ID
  if (!appId) throw new Error('[auth] GITHUB_APP_ID is not set in environment variables')

  const privateKey = normalizePrivateKey(rawKey)

  console.log(`[auth] Generating App JWT — appId: ${appId}, keyLength: ${privateKey.length}, hasNewlines: ${privateKey.includes('\n')}, startsCorrectly: ${privateKey.trimStart().startsWith('-----BEGIN')}`)

  let pkcs8pem: string
  try {
    const { createPrivateKey } = await import('node:crypto')
    const keyObject = createPrivateKey({ key: privateKey, format: 'pem' })
    pkcs8pem = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string
  } catch (err: any) {
    console.error('[auth] Raw key first 100 chars:', rawKey.substring(0, 100))
    throw new Error(`[auth] Failed to parse GITHUB_APP_PRIVATE_KEY — check PEM format and line breaks. Details: ${err?.message}`)
  }

  let privateKeyObj: any
  try {
    const { importPKCS8 } = await import('jose')
    privateKeyObj = await importPKCS8(pkcs8pem, 'RS256')
  } catch (err: any) {
    throw new Error(`[auth] Failed to import private key with jose. Details: ${err?.message}`)
  }

  const now = Math.floor(Date.now() / 1000)
  const { SignJWT } = await import('jose')
  return new SignJWT({ iss: appId })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 540)
    .sign(privateKeyObj)
}


// ─── Gerar Installation Access Token ─────────────────────────────────────────

export async function getInstallationToken(installationId: number): Promise<string> {
  console.log(`[auth] Requesting installation token for installationId: ${installationId}`)
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
    const errBody = await res.text()
    throw new Error(`[auth] GitHub returned ${res.status} when generating installation token for id ${installationId}. Body: ${errBody}`)
  }

  const data = await res.json()
  if (!data.token) {
    throw new Error(`[auth] GitHub installation token response missing 'token' field. Response: ${JSON.stringify(data)}`)
  }

  console.log(`[auth] Installation token obtained successfully for installationId: ${installationId}`)
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

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('plan, github_installation_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error(`[auth] Failed to fetch user profile for userId=${user.id}:`, profileError.message)
  }

  console.log(`[auth] Profile loaded — userId: ${user.id}, plan: ${profile?.plan ?? 'free'}, installationId: ${profile?.github_installation_id ?? null}`)

  return {
    user,
    plan: profile?.plan ?? 'free',
    installationId: profile?.github_installation_id ?? null,
  }
}

export async function getAuthenticatedUser(authHeader: string | undefined) {
  const { user, plan, installationId } = await getAuthenticatedProfile(authHeader)

  if (!installationId) {
    console.warn(`[auth] getAuthenticatedUser — userId ${user.id} has no github_installation_id in profile`)
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
