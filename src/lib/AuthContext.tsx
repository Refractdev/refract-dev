import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, UserProfile } from './supabase'
import { identifyUser, resetUser } from './analytics'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  connectGitHub: (redirectToPath?: string) => Promise<{ error: Error | null }>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => { },
  signOut: async () => { },
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  connectGitHub: async () => ({ error: null }),
})

export const useAuth = () => useContext(AuthContext)

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const identifiedUserId = useRef<string | null>(null)

  const loadingDone = useRef(false)
  const doneLoading = useCallback(() => {
    if (!loadingDone.current) {
      loadingDone.current = true
      setLoading(false)
    }
  }, [])

  const syncAnalyticsIdentity = useCallback(async (userId: string, traits: Record<string, unknown> = {}) => {
    if (identifiedUserId.current === userId) return
    identifiedUserId.current = userId
    await identifyUser(userId, traits)
  }, [])

  const syncGitHubInstallationFromUrl = useCallback(async (userId: string, currentProfile: UserProfile): Promise<UserProfile> => {
    const params = new URLSearchParams(window.location.search)
    const installationIdParam = params.get('installation_id')
    const shouldCleanUrl = installationIdParam !== null || params.get('github_connected') === '1'
    if (!installationIdParam) {
      if (shouldCleanUrl) {
        params.delete('github_connected')
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`
        )
      }
      return currentProfile
    }

    const installationId = Number(installationIdParam)
    if (!Number.isFinite(installationId)) {
      console.warn('[auth] ignored invalid installation_id from redirect:', installationIdParam)
      return currentProfile
    }

    try {
      const { data: updatedProfile, error } = await supabase
        .from('users')
        .update({ github_installation_id: installationId })
        .eq('id', userId)
        .select('*')
        .single()

      if (!error && updatedProfile) {
        params.delete('installation_id')
        params.delete('github_connected')
        const nextQuery = params.toString()
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
        )
        return updatedProfile as UserProfile
      }
    } catch (err) {
      console.warn('[auth] failed to save installation id from redirect:', err)
    }

    return currentProfile
  }, [])

  const ensureProfileForSession = useCallback(async (currentSession: Session): Promise<UserProfile | null> => {
    const userId = currentSession.user.id
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error || !data) {
        const { error: insertError } = await supabase.from('users').insert({
          id: userId,
          auth_id: userId,
          name: currentSession.user.user_metadata?.name ?? currentSession.user.email?.split('@')[0] ?? 'User',
          email: currentSession.user.email ?? '',
          onboarding_completed: false,
          language: 'pt',
          avatar_url: currentSession.user.user_metadata?.avatar_url ?? null,
        })

        if (insertError) {
          setProfile(null)
          return null
        }

        const { data: createdProfile, error: createdError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single()

        if (createdError || !createdProfile) {
          setProfile(null)
          return null
        }

        const nextProfile = await syncGitHubInstallationFromUrl(userId, createdProfile as UserProfile)
        setProfile(nextProfile)
        return nextProfile
      }

      let nextProfile = data as UserProfile
      nextProfile = await syncGitHubInstallationFromUrl(userId, nextProfile)
      setProfile(nextProfile)
      return nextProfile
    } catch (e) {
      setProfile(null)
      return null
    }
  }, [syncGitHubInstallationFromUrl])

  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  const refreshProfile = useCallback(async () => {
    if (sessionRef.current) await ensureProfileForSession(sessionRef.current)
  }, [ensureProfileForSession])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    identifiedUserId.current = null
    void resetUser()
    setSession(null)
    setProfile(null)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error && data.session?.user?.id) {
        void syncAnalyticsIdentity(data.session.user.id, {
          email: data.session.user.email ?? email,
        })
      }
      return { error: error ?? null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Sign in failed') }
    }
  }, [syncAnalyticsIdentity])

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) return { error: signUpError }
      const user = data.user
      if (!user) return { error: new Error('No user returned from signup') }

      const { error: profileError } = await supabase.from('users').insert({
        id: user.id,
        auth_id: user.id,
        name: email.split('@')[0],
        email,
        onboarding_completed: false,
        language: 'pt',
        avatar_url: null,
      })
      if (profileError) console.warn('[auth] failed to create user profile:', profileError.message)
      return { error: null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Sign up failed') }
    }
  }, [])

  const persistGitHubToken = useCallback(async (userId: string, providerToken: string | undefined) => {
    if (!providerToken) return
    const { error } = await supabase
      .from('users')
      .update({ github_token: providerToken })
      .eq('id', userId)
    if (error) console.warn('[auth] failed to persist github_token:', error.message)
  }, [])

  // Link GitHub when already signed in; sign in with GitHub otherwise.
  const connectGitHub = useCallback(async (redirectToPath = '/repos') => {
    const options = {
      scopes: 'repo user',
      redirectTo: `${window.location.origin}${redirectToPath}`,
    }

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()

      if (currentSession) {
        const { data, error } = await supabase.auth.linkIdentity({
          provider: 'github',
          options,
        })
        if (error) return { error }
        if (data?.url) window.location.assign(data.url)
        return { error: null }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options,
      })
      return { error: error ?? null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Failed to connect GitHub') }
    }
  }, [])

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let initialSessionHandled = false

    const persistGitHubTokenIfPresent = async (currentSession: Session) => {
      await persistGitHubToken(currentSession.user.id, currentSession.provider_token ?? undefined)
    }

    const loadProfileAsync = (currentSession: Session) => {
      window.setTimeout(() => {
        void ensureProfileForSession(currentSession).finally(() => {
          if (!initialSessionHandled) {
            initialSessionHandled = true
            doneLoading()
          }
        })
      }, 0)
    }

    const persistAndLoadProfile = (currentSession: Session) => {
      // Defer Supabase calls outside onAuthStateChange to avoid auth deadlocks
      // that hang all client queries (including project loads).
      window.setTimeout(() => {
        void (async () => {
          await persistGitHubTokenIfPresent(currentSession)
          await ensureProfileForSession(currentSession)
          if (!initialSessionHandled) {
            initialSessionHandled = true
            doneLoading()
          }
        })()
      }, 0)
    }

    const bootstrapSession = async () => {
      let currentSession: Session | null = null
      try {
        const { data: { session } } = await supabase.auth.getSession()
        currentSession = session ?? null
        setSession(currentSession)

        if (currentSession?.user?.id) {
          void syncAnalyticsIdentity(currentSession.user.id, {
            email: currentSession.user.email ?? undefined,
          })
          if (currentSession.provider_token) {
            await persistGitHubTokenIfPresent(currentSession)
            await ensureProfileForSession(currentSession)
            if (!initialSessionHandled) {
              initialSessionHandled = true
              doneLoading()
            }
          } else {
            loadProfileAsync(currentSession)
          }
        } else {
          setProfile(null)
        }
      } catch (err) {
        console.warn('[auth] failed to bootstrap session:', err)
        setProfile(null)
      } finally {
        if (!currentSession?.user?.id && !initialSessionHandled) {
          initialSessionHandled = true
          doneLoading()
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)

      if (s?.user?.id) {
        void syncAnalyticsIdentity(s.user.id, {
          email: s.user.email ?? undefined,
        })

        const hasProviderToken = !!s.provider_token
        const isAuthEvent = event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED'

        if (isAuthEvent && hasProviderToken) {
          persistAndLoadProfile(s)
        } else {
          loadProfileAsync(s)
        }
      } else {
        setProfile(null)
        if (!initialSessionHandled) {
          initialSessionHandled = true
          doneLoading()
        }
      }
    })

    const fallback = setTimeout(() => {
      if (!initialSessionHandled) {
        initialSessionHandled = true
        doneLoading()
      }
    }, 5000)

    bootstrapSession()

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallback)
    }
  }, [ensureProfileForSession, persistGitHubToken, syncAnalyticsIdentity])

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut, signIn, signUp, connectGitHub }}>
      {children}
    </AuthContext.Provider>
  )
}
