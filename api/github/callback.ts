import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabaseClient } from '../_lib/supabase'

interface InstallationState {
  userId: string
  returnTo?: string
}

function getFirstQueryValue(value: string | string[] | undefined): string | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function parseInstallationState(rawState: string): InstallationState {
  try {
    const normalized = rawState.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = Buffer.from(normalized, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)

    if (typeof parsed?.userId === 'string') {
      return {
        userId: parsed.userId,
        returnTo: typeof parsed.returnTo === 'string' ? parsed.returnTo : undefined,
      }
    }
  } catch {
    // Older install links used the Supabase user id directly as state.
  }

  return { userId: rawState }
}

function getSafeReturnUrl(returnTo: string | undefined, path: string): string {
  if (!returnTo) return path

  try {
    const url = new URL(returnTo)
    const isLocalhost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'

    if (!isLocalhost) return path

    return new URL(path, url.origin).toString()
  } catch {
    return path
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { installation_id, state, setup_action } = req.query
  const installationIdParam = getFirstQueryValue(installation_id)
  const stateParam = getFirstQueryValue(state)

  // Ignorar uninstall events
  if (setup_action === 'deleted') {
    return res.redirect('/repos')
  }

  if (!installationIdParam) {
    return res.status(400).send('Missing installation_id')
  }

  const installationId = Number(installationIdParam)

  if (!Number.isFinite(installationId)) {
    return res.status(400).send('Invalid installation_id')
  }

  if (!stateParam) {
    return res.redirect(`/repos?installation_id=${encodeURIComponent(String(installationId))}`)
  }

  const { userId, returnTo } = parseInstallationState(stateParam)
  const redirectPath = getSafeReturnUrl(returnTo, '/repos?github_connected=1')
  const supabase = getAdminSupabaseClient()

  const { data: existingProfile, error: profileLookupError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (profileLookupError) {
    console.error('[github/callback] failed to look up profile:', profileLookupError.message)
    return res.status(500).send('Failed to save installation')
  }

  let error = null

  if (existingProfile) {
    const result = await supabase
      .from('users')
      .update({ github_installation_id: installationId })
      .eq('id', userId)
    error = result.error
  } else {
    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(userId)

    if (authUserError || !authUser?.user) {
      console.error('[github/callback] failed to load auth user:', authUserError?.message ?? 'missing user')
      return res.status(500).send('Failed to save installation')
    }

    const user = authUser.user
    const result = await supabase.from('users').insert({
      id: userId,
      auth_id: userId,
      name: user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'User',
      email: user.email ?? '',
      plan: 'free',
      onboarding_completed: false,
      language: 'pt',
      avatar_url: user.user_metadata?.avatar_url ?? null,
      github_installation_id: installationId,
    })
    error = result.error
  }

  if (error) {
    console.error('[github/callback] failed to save installation_id:', error.message)
    return res.status(500).send('Failed to save installation')
  }

  console.log(`[github/callback] installation_id ${installationId} saved for user ${userId}`)
  return res.redirect(redirectPath)
}
