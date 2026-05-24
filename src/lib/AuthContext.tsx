import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, UserProfile } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  installGitHubApp: () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  installGitHubApp: () => {},
})

export const useAuth = () => useContext(AuthContext)

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadingDone = useRef(false)
  const doneLoading = useCallback(() => {
    if (!loadingDone.current) {
      loadingDone.current = true
      setLoading(false)
    }
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
          plan: 'free',
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
    setSession(null)
    setProfile(null)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ?? null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Sign in failed') }
    }
  }, [])

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
        plan: 'free',
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

  // Redireciona para instalação da GitHub App
  // Passa o user_id no ?state= para o callback conseguir identificar o utilizador
  const installGitHubApp = useCallback(() => {
    const userId = sessionRef.current?.user?.id
    if (!userId) return

    const rawState = JSON.stringify({
      userId,
      returnTo: window.location.origin,
    })
    const state = btoa(rawState)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

    const url = `https://github.com/apps/refractdev/installations/new?state=${encodeURIComponent(state)}`
    window.location.href = url
  }, [])

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let initialSessionHandled = false

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

    const bootstrapSession = async () => {
      let currentSession: Session | null = null
      try {
        const { data: { session } } = await supabase.auth.getSession()
        currentSession = session ?? null
        setSession(currentSession)

        if (currentSession?.user?.id) {
          loadProfileAsync(currentSession)
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)

      if (s?.user?.id) {
        loadProfileAsync(s)
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
  }, [ensureProfileForSession])

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut, signIn, signUp, installGitHubApp }}>
      {children}
    </AuthContext.Provider>
  )
}
