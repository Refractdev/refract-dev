import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Session } from '@supabase/supabase-js'
import { H } from 'highlight.run'
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
  const doneLoading = () => {
    if (!loadingDone.current) {
      loadingDone.current = true
      setLoading(false)
    }
  }

  const checkPendingInstallation = useCallback(async (userId: string, currentProfile: UserProfile): Promise<UserProfile> => {
    const pendingId = localStorage.getItem('pending_installation_id')
    if (!pendingId) return currentProfile

    localStorage.removeItem('pending_installation_id')
    try {
      const { data: updatedProfile, error } = await supabase
        .from('users')
        .update({ github_installation_id: Number(pendingId) })
        .eq('id', userId)
        .select()
        .single()

      if (!error && updatedProfile) {
        return updatedProfile as UserProfile
      }
    } catch (err) {
      console.warn('[auth] failed to save pending installation id:', err)
    }
    return currentProfile
  }, [])

  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        setProfile(null)
        return null
      }
      let nextProfile = data as UserProfile
      nextProfile = await checkPendingInstallation(userId, nextProfile)
      setProfile(nextProfile)
      return nextProfile
    } catch (e) {
      setProfile(null)
      return null
    }
  }, [checkPendingInstallation])

  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  const refreshProfile = useCallback(async () => {
    if (sessionRef.current?.user?.id) await fetchProfile(sessionRef.current.user.id)
  }, [fetchProfile])

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
    const url = `https://github.com/apps/refractdev/installations/new?state=${userId}`
    window.location.href = url
  }, [])

  // Highlight identify
  useEffect(() => {
    if (!session?.user) return
    H.identify(session.user.email ?? session.user.id, {
      id: session.user.id,
      plan: profile?.plan ?? 'free',
    })
  }, [session, profile?.plan])

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let initialSessionHandled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)

      if (event === 'TOKEN_REFRESHED') {
        if (!initialSessionHandled) {
          initialSessionHandled = true
          doneLoading()
        }
        return
      }

      if (s?.user?.id) {
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', s.user.id)
          .single()

        if (profileError || !profileData) {
          const { error: insertError } = await supabase.from('users').insert({
            id: s.user.id,
            auth_id: s.user.id,
            name: s.user.user_metadata?.name ?? s.user.email?.split('@')[0] ?? 'User',
            email: s.user.email ?? '',
            plan: 'free',
            onboarding_completed: false,
            language: 'pt',
            avatar_url: s.user.user_metadata?.avatar_url ?? null,
          })
          if (!insertError) {
            const { data: newProfile } = await supabase
              .from('users')
              .select('*')
              .eq('id', s.user.id)
              .single()
            if (newProfile) {
              const finalProfile = await checkPendingInstallation(s.user.id, newProfile as UserProfile)
              setProfile(finalProfile)
            }
          } else {
            setProfile(null)
          }
        } else {
          const finalProfile = await checkPendingInstallation(s.user.id, profileData as UserProfile)
          setProfile(finalProfile)
        }
      } else {
        setProfile(null)
      }

      if (!initialSessionHandled) {
        initialSessionHandled = true
        doneLoading()
      }
    })

    const fallback = setTimeout(() => {
      if (!initialSessionHandled) {
        initialSessionHandled = true
        doneLoading()
      }
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallback)
    }
  }, [fetchProfile, checkPendingInstallation])

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut, signIn, signUp, installGitHubApp }}>
      {children}
    </AuthContext.Provider>
  )
}
