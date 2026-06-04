import React, { useState } from 'react'
import { LogoMark } from '../components/Logo'
import { useAuth } from '../lib/AuthContext'
import { Loader2 } from 'lucide-react'

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { signIn, signUp } = useAuth()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!email.trim()) {
        setError('Email is required')
        setLoading(false)
        return
      }
      if (!password) {
        setError('Password is required')
        setLoading(false)
        return
      }

      const { error: err } = await signIn(email, password)
      if (err) {
        setError(err.message || 'Failed to sign in')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!email.trim()) {
        setError('Email is required')
        setLoading(false)
        return
      }
      if (!password) {
        setError('Password is required')
        setLoading(false)
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
        setLoading(false)
        return
      }

      sessionStorage.setItem('justSignedUp', 'true')
      const { error: err } = await signUp(email, password)
      if (err) {
        setError(err.message || 'Failed to create account')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-[var(--canvas-soft)] p-6 select-none relative">
      <div className="card relative z-10 w-full max-w-[400px] bg-[var(--surface-card)] border border-[var(--hairline)] p-8 md:p-10 shadow-[var(--shadow-level-5)] rounded-md space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <LogoMark size={28} className="text-[var(--ink)]" />
        </div>

        {/* Title */}
        <h1 className="text-display-sm font-semibold tracking-tight text-[var(--ink)] text-center">
          {mode === 'signin' ? 'Sign in to Refract.' : 'Create your account.'}
        </h1>

        {/* Mode toggle */}
        <div className="flex gap-1.5 bg-[var(--canvas-soft-2)] border border-[var(--hairline)] rounded-sm p-1">
          <button
            onClick={() => {
              setMode('signin')
              setError('')
            }}
            className={`flex-1 py-1.5 px-3 rounded-xs border-none text-xs font-medium cursor-pointer transition-all duration-150 ${
              mode === 'signin' 
                ? 'bg-[var(--surface-card)] text-[var(--ink)] shadow-sm font-semibold' 
                : 'bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => {
              setMode('signup')
              setError('')
            }}
            className={`flex-1 py-1.5 px-3 rounded-xs border-none text-xs font-medium cursor-pointer transition-all duration-150 ${
              mode === 'signup' 
                ? 'bg-[var(--surface-card)] text-[var(--ink)] shadow-sm font-semibold' 
                : 'bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-mono text-[var(--ink-muted)] uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              className="input text-sm"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-mono text-[var(--ink-muted)] uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              className="input text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-[var(--semantic-error)]/10 border border-[var(--semantic-error)]/25 rounded-sm text-xs text-[var(--semantic-error)]">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full mt-2"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1.5" />
                {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : mode === 'signin' ? (
              'Sign in'
            ) : (
              'Create account'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
