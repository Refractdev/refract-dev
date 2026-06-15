import { getAdminSupabaseClient } from './supabase'

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
    .select('plan')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error(`[auth] Failed to fetch user profile for userId=${user.id}:`, profileError.message)
  }

  // Retrieve GitHub provider_token if available
  let providerToken: string | null = null
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.getUserById(user.id)
    if (!sessionError && sessionData?.user) {
      const identities = sessionData.user.identities ?? []
      const githubIdentity = identities.find((id: any) => id.provider === 'github')
      providerToken = (githubIdentity as any)?.identity_data?.provider_token ?? null
    }
  } catch (err) {
    console.error('[auth] Failed to fetch user identity for github token', err)
  }

  if (!providerToken) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      providerToken = session?.provider_token ?? null
    } catch {
      // Ignored
    }
  }

  return {
    user,
    plan: profile?.plan ?? 'free',
    githubToken: providerToken,
  }
}

export async function getAuthenticatedUser(authHeader: string | undefined) {
  const { user, plan, githubToken } = await getAuthenticatedProfile(authHeader)
  return {
    user,
    plan,
    githubToken,
  }
}

export async function getAuthenticatedUserWithOptionalGitHub(authHeader: string | undefined) {
  return getAuthenticatedUser(authHeader)
}

/** Placeholder for legacy background jobs if called in OAuth mode */
export async function getInstallationToken(installationId: number): Promise<string> {
  console.warn(`[auth] getInstallationToken called with id ${installationId} under OAuth App configuration. Returning empty token.`)
  return ''
}
