import { getAdminSupabaseClient } from './supabase'

async function getAuthenticatedProfile(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization header')
  }

  const supabase = getAdminSupabaseClient()
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

  if (error || !user) throw new Error('Invalid session')

  // Fetch profile including the stored github_token
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('plan, github_token')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error(`[auth] Failed to fetch user profile for userId=${user.id}:`, profileError.message)
  }

  // The github_token column is populated by the frontend AuthContext
  // when the user connects GitHub (stored from the Supabase OAuth session).
  const githubToken: string | null = (profile as any)?.github_token ?? null

  return {
    user,
    plan: (profile as any)?.plan ?? 'free',
    githubToken,
  }
}

export async function getAuthenticatedUser(authHeader: string | undefined) {
  const { user, plan, githubToken } = await getAuthenticatedProfile(authHeader)
  return { user, plan, githubToken }
}

export async function getAuthenticatedUserWithOptionalGitHub(authHeader: string | undefined) {
  return getAuthenticatedUser(authHeader)
}

/** Not used under OAuth App configuration — kept for API surface compatibility */
export async function getInstallationToken(_installationId: number): Promise<string> {
  console.warn('[auth] getInstallationToken called but GitHub App is not configured. Returning empty token.')
  return ''
}
