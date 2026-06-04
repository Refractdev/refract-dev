import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from './supabase'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, refreshProfile } = useAuth()
  const [theme, setThemeState] = useState<Theme>('dark')
  const [initialized, setInitialized] = useState(false)

  // Load theme from localStorage first
  useEffect(() => {
    const savedTheme = localStorage.getItem('refract-theme') as Theme | null
    if (savedTheme) {
      setThemeState(savedTheme)
      document.documentElement.setAttribute('data-theme', savedTheme)
    } else {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
    setInitialized(true)
  }, [])

  // Load theme from Supabase profile when it becomes available
  useEffect(() => {
    if (!initialized || !profile) return

    const saved = profile.theme
    if (saved === 'dark' || saved === 'light') {
      setThemeState(saved)
      document.documentElement.setAttribute('data-theme', saved)
      localStorage.setItem('refract-theme', saved)
    }
  }, [profile?.theme, initialized])

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('refract-theme', newTheme)

    if (profile?.id) {
      try {
        const { error } = await supabase
          .from('users')
          .update({ theme: newTheme })
          .eq('id', profile.id)
        if (error) throw error
        await refreshProfile()
      } catch (err) {
        console.warn('[theme] failed to save theme to Supabase:', err)
      }
    }
  }, [profile?.id, refreshProfile])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
