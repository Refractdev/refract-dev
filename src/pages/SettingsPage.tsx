import React, { useEffect, useState } from 'react'
import {
  Check,
  ChevronRight,
  Globe,
  Loader2,
  LogOut,
  ShieldAlert,
  User2,
  Sun,
  Moon,
  Save,
  GitBranch,
  Github,
  Lock,
  AlertCircle,
  Trash2,
  ExternalLink,
  Plus,
  RefreshCw,
  X,
  Users,
  UserPlus,
  BookOpen,
  BarChart3,
  GitPullRequest,
  ListChecks,
  Gift,
  Copy,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'

import { supabase, UserProfile } from '../lib/supabase'
import { getAllProjects, getSetting, setSetting } from '../lib/db'
import { useTranslation } from '../hooks/useTranslation'
import { useToast } from '../components/Toast'

interface SettingsPageProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #007cf0, #00dfd8)', // Develop
  'linear-gradient(135deg, #7928ca, #ff0080)', // Preview
  'linear-gradient(135deg, #ff4d4d, #f9cb28)', // Ship
  'linear-gradient(135deg, #50e3c2, #29bc9b)', // Mint
  'linear-gradient(135deg, #7928ca, #50e3c2)', // Violet-Mint
  'linear-gradient(135deg, #ff0080, #f9cb28)', // Pink-Yellow
]

export const SettingsPage: React.FC<SettingsPageProps> = ({ activeTab, onTabChange }) => {
  const { profile, session, refreshProfile, signOut, connectGitHub } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, lang } = useTranslation()
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast()

  // Profile Form States
  const [name, setName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  // Language Change State
  const [isSavingLanguage, setIsSavingLanguage] = useState(false)
  const [languageSaved, setLanguageSaved] = useState(false)

  // Guidelines States
  const [isLoadingGuidelines, setIsLoadingGuidelines] = useState(false)
  const [guidelinesProjects, setGuidelinesProjects] = useState<any[]>([])
  const [globalGuidelines, setGlobalGuidelines] = useState('')
  const [isSavingGlobal, setIsSavingGlobal] = useState(false)

  // Danger Zone States
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setName(profile?.name ?? '')
  }, [profile?.name])

  // Clear save notifications after a delay
  useEffect(() => {
    if (!nameSaved) return
    const timeout = setTimeout(() => setNameSaved(false), 2000)
    return () => clearTimeout(timeout)
  }, [nameSaved])

  useEffect(() => {
    if (!languageSaved) return
    const timeout = setTimeout(() => setLanguageSaved(false), 2000)
    return () => clearTimeout(timeout)
  }, [languageSaved])

  // Load guidelines when Guidelines tab becomes active
  useEffect(() => {
    if (activeTab !== 'guidelines' || !profile?.id) return

    const loadGuidelines = async () => {
      setIsLoadingGuidelines(true)
      try {
        const gText = await getSetting('global_guidelines', '')
        setGlobalGuidelines(gText)

        const allProjects = await getAllProjects(profile.id)
        const projectItems = []
        for (const proj of allProjects) {
          const text = await getSetting(`guideline_${proj.id}`, '')
          projectItems.push({
            project: proj,
            text,
            isSaving: false,
            savedAt: 'Synced',
          })
        }
        setGuidelinesProjects(projectItems)
      } catch (err) {
        console.error('Error loading guidelines in settings:', err)
      } finally {
        setIsLoadingGuidelines(false)
      }
    }

    loadGuidelines()
  }, [activeTab, profile?.id])

  if (!profile) {
    return (
      <div className="p-10 min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <div className="card max-w-md w-full p-6 text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--primary)]" />
          <p className="text-sm text-[var(--ink-muted)]">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const handleSaveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === profile.name || isSavingName) return

    setIsSavingName(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ name: trimmed })
        .eq('id', profile.id)

      if (error) throw error
      await refreshProfile()
      setNameSaved(true)
      toastSuccess('Name updated.')
    } catch (err) {
      console.error('[settings] Failed to update name:', err)
      toastError('Failed to save name. Please try again.')
    } finally {
      setIsSavingName(false)
    }
  }

  const handleSelectAvatar = async (url: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: url })
        .eq('id', profile.id)

      if (error) throw error
      await refreshProfile()
      toastSuccess('Avatar updated.')
    } catch (err) {
      console.error('[settings] Failed to save avatar:', err)
      toastError('Failed to update avatar. Please try again.')
    }
  }

  const handleSyncGitHubAvatar = async () => {
    const githubUsername = session?.user?.email?.split('@')[0]
    const githubAvatarUrl = session?.user?.user_metadata?.avatar_url || 
      (githubUsername ? `https://github.com/${githubUsername}.png` : null)

    if (githubAvatarUrl) {
      await handleSelectAvatar(githubAvatarUrl)
    }
  }

  const handleLanguageChange = async (nextLang: UserProfile['language']) => {
    if (nextLang === profile.language || isSavingLanguage) return

    setIsSavingLanguage(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ language: nextLang })
        .eq('id', profile.id)

      if (error) throw error
      await refreshProfile()
      setLanguageSaved(true)
      toastSuccess('Language updated.')
    } catch (err) {
      console.error('[settings] Failed to update language:', err)
      toastError('Failed to save language preference.')
    } finally {
      setIsSavingLanguage(false)
    }
  }

  const handleSaveProjectGuideline = async (projectId: string, text: string) => {
    setGuidelinesProjects(prev =>
      prev.map(p => (p.project.id === projectId ? { ...p, isSaving: true } : p))
    )
    try {
      await setSetting(`guideline_${projectId}`, text)
      setGuidelinesProjects(prev =>
        prev.map(p =>
          p.project.id === projectId
            ? { ...p, isSaving: false, savedAt: 'Just now' }
            : p
        )
      )
    } catch (err) {
      console.error('[settings] Failed to save project guideline:', err)
      toastError('Failed to save guideline. Please try again.')
      setGuidelinesProjects(prev =>
        prev.map(p => (p.project.id === projectId ? { ...p, isSaving: false } : p))
      )
    }
  }

  const handleSaveGlobalGuidelines = async () => {
    setIsSavingGlobal(true)
    try {
      await setSetting('global_guidelines', globalGuidelines)
      toastSuccess('Guidelines saved.')
    } catch (err) {
      console.error('[settings] Failed to save global guidelines:', err)
      toastError('Failed to save guidelines. Please try again.')
    } finally {
      setTimeout(() => setIsSavingGlobal(false), 500)
    }
  }

  const handleDeleteAccount = async () => {
    const confirmationWord = lang === 'pt' ? 'ELIMINAR' : 'DELETE'
    if (deleteConfirmationInput !== confirmationWord || isDeletingAccount) return

    setIsDeletingAccount(true)
    setDeleteError(null)

    try {
      // 1. Delete user projects (RLS allows users to delete own projects, which cascades to health snapshots, decisions, activity)
      const { error: projectsError } = await supabase
        .from('projects')
        .delete()
        .eq('user_id', profile.id)
      if (projectsError) throw projectsError

      // 2. Delete user settings
      const { error: settingsError } = await supabase
        .from('settings')
        .delete()
        .eq('user_id', profile.id)
      if (settingsError) throw settingsError

      // 3. Delete user row in users table
      const { error: userProfileError } = await supabase
        .from('users')
        .delete()
        .eq('id', profile.id)
      if (userProfileError) throw userProfileError

      // 4. Sign out
      await signOut()
      setShowDeleteModal(false)
    } catch (err: any) {
      console.error('Account deletion failed:', err)
      setDeleteError(err.message || 'Failed to delete account. Please try again.')
      setIsDeletingAccount(false)
    }
  }

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6 max-w-2xl page-enter">
            {/* Header section card */}
            <div className="card p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-[var(--canvas-soft)] border border-[var(--hairline)] flex items-center justify-center text-[var(--primary)]">
                  <User2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.profile.title')}</h3>
                  <p className="text-sm text-[var(--ink-muted)]">{t('settings.profile.subtitle')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider mb-2">
                    {t('settings.profile.name')}
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      className="input flex-1"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t('settings.profile.namePlaceholder')}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveName}
                      disabled={isSavingName || !name.trim() || name.trim() === profile.name}
                    >
                      {isSavingName ? <Loader2 size={16} className="spin" /> : null}
                      {isSavingName ? t('settings.profile.saving') : t('settings.profile.saveBtn')}
                    </button>
                  </div>
                  {nameSaved && (
                    <span className="text-xs text-[var(--semantic-success)] flex items-center gap-1 mt-1">
                      <Check size={12} /> {t('settings.profile.saved')}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider mb-2">
                    {t('settings.profile.email')}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="input bg-[var(--canvas-soft)] opacity-60 cursor-not-allowed pr-10"
                      value={profile.email}
                      readOnly
                      disabled
                    />
                    <Lock size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Avatar Selector card */}
            <div className="card p-6 space-y-6">
              <div>
                <h3 className="text-base font-medium text-[var(--ink)]">{t('settings.profile.avatar')}</h3>
                <p className="text-sm text-[var(--ink-muted)]">{t('settings.profile.avatarDesc')}</p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Active Avatar Preview */}
                <div className="flex flex-col items-center gap-2 pr-6 border-r border-[var(--hairline)]">
                  {profile.avatar_url ? (
                    profile.avatar_url.startsWith('linear-gradient') ? (
                      <div style={{ background: profile.avatar_url }} className="h-16 w-16 rounded-full border border-[var(--hairline)] shadow-inner" />
                    ) : (
                      <img src={profile.avatar_url} alt="Profile" className="h-16 w-16 rounded-full object-cover border border-[var(--hairline)]" />
                    )
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-[var(--canvas-soft)] border border-[var(--hairline)] flex items-center justify-center text-lg font-bold text-[var(--ink)]">
                      {profile.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs text-[var(--ink-muted)] font-medium">{t('settings.profile.avatarPreview')}</span>
                </div>

                {/* Preset Gradients */}
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap gap-2.5">
                    {AVATAR_GRADIENTS.map((grad, i) => {
                      const isActive = profile.avatar_url === grad
                      return (
                        <button
                          key={i}
                          onClick={() => handleSelectAvatar(grad)}
                          style={{ background: grad }}
                          className="h-10 w-10 rounded-full border border-[var(--hairline)] relative focus:outline-none cursor-pointer"
                        >
                          {isActive && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-full">
                              <Check size={16} className="text-white drop-shadow-md" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleSyncGitHubAvatar}
                      style={{ gap: 6 }}
                    >
                      <Github size={14} />
                      {t('settings.profile.githubAvatar')}
                    </button>
                    {profile.avatar_url && (
                      <button
                        className="btn btn-ghost btn-sm text-[var(--semantic-error)] hover:bg-[var(--semantic-error)]/10"
                        onClick={() => handleSelectAvatar('')}
                      >
                        {t('settings.profile.avatarReset')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--ink-muted)] text-center">
              {t('settings.profile.created')}: {new Date(profile.created_at).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-US', { dateStyle: 'long' })}
            </p>
          </div>
        )

      case 'preferences':
        return (
          <div className="space-y-6 max-w-2xl page-enter">
            {/* Theme picker */}
            <div className="card p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-[var(--canvas-soft)] border border-[var(--hairline)] flex items-center justify-center text-[var(--primary)]">
                  {theme === 'dark' ? <Moon size={24} /> : <Sun size={24} />}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.preferences.themeTitle')}</h3>
                  <p className="text-sm text-[var(--ink-muted)]">{t('settings.preferences.themeDesc')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Light theme card */}
                <div
                  onClick={() => setTheme('light')}
                  className={`cursor-pointer p-5 rounded-2xl border-2 flex flex-col justify-between gap-6 select-none ${
                    theme === 'light'
                      ? 'border-[var(--primary)] bg-[var(--canvas-soft)] shadow-sm'
                      : 'border-[var(--hairline)] bg-[var(--surface-card)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Sun size={20} className={theme === 'light' ? 'text-[var(--primary)]' : 'text-[var(--ink-muted)]'} />
                    {theme === 'light' ? (
                      <div className="h-5 w-5 rounded-full bg-[var(--primary)] flex items-center justify-center text-white">
                        <Check size={12} />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-[var(--hairline-strong)]" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{t('settings.preferences.lightMode')}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{t('settings.preferences.lightDesc')}</p>
                  </div>
                </div>

                {/* Dark theme card */}
                <div
                  onClick={() => setTheme('dark')}
                  className={`cursor-pointer p-5 rounded-2xl border-2 flex flex-col justify-between gap-6 select-none ${
                    theme === 'dark'
                      ? 'border-[var(--primary)] bg-[var(--canvas-soft)] shadow-sm'
                      : 'border-[var(--hairline)] bg-[var(--surface-card)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Moon size={20} className={theme === 'dark' ? 'text-[var(--primary)]' : 'text-[var(--ink-muted)]'} />
                    {theme === 'dark' ? (
                      <div className="h-5 w-5 rounded-full bg-[var(--primary)] flex items-center justify-center text-white">
                        <Check size={12} />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-[var(--hairline-strong)]" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{t('settings.preferences.darkMode')}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{t('settings.preferences.darkDesc')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Language card */}
            <div className="card p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-[var(--canvas-soft)] border border-[var(--hairline)] flex items-center justify-center text-[var(--primary)]">
                  <Globe size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.preferences.langTitle')}</h3>
                  <p className="text-sm text-[var(--ink-muted)]">{t('settings.preferences.langDesc')}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 max-w-sm">
                  <select
                    className="input"
                    value={profile.language}
                    onChange={e => handleLanguageChange(e.target.value as UserProfile['language'])}
                    disabled={isSavingLanguage}
                    style={{ appearance: 'none', cursor: 'pointer' }}
                  >
                    <option value="en">{t('settings.preferences.langOptions.en')}</option>
                    <option value="pt">{t('settings.preferences.langOptions.pt')}</option>
                    <option value="es">{t('settings.preferences.langOptions.es')}</option>
                    <option value="fr">{t('settings.preferences.langOptions.fr')}</option>
                    <option value="de">{t('settings.preferences.langOptions.de')}</option>
                  </select>
                </div>
                <div className="text-xs text-[var(--ink-muted)]">
                  {isSavingLanguage ? (
                    <span className="flex items-center gap-1.5"><Loader2 size={12} className="spin" /> {t('settings.preferences.saving')}</span>
                  ) : languageSaved ? (
                    <span className="text-[var(--semantic-success)] flex items-center gap-1"><Check size={12} /> {t('settings.preferences.saved')}</span>
                  ) : (
                    t('settings.preferences.autoSave')
                  )}
                </div>
              </div>
            </div>
          </div>
        )

      case 'guidelines':
        return (
          <div className="space-y-6 max-w-3xl page-enter">
            <div className="card p-6 space-y-2 bg-[var(--canvas-soft)] border border-[var(--hairline)]">
              <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.guidelines.title')}</h3>
              <p className="text-sm text-[var(--ink-muted)]">{t('settings.guidelines.subtitle')}</p>
            </div>

            {isLoadingGuidelines ? (
              <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)] p-6">
                <Loader2 size={16} className="spin text-[var(--primary)]" />
                {t('common.loading')}
              </div>
            ) : (
              <>
                {/* Global Guidelines */}
                <div className="card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-[var(--ink)]">{t('settings.guidelines.global')}</h4>
                      <p className="text-xs text-[var(--ink-muted)]">{t('settings.guidelines.globalDesc')}</p>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveGlobalGuidelines}
                      disabled={isSavingGlobal}
                    >
                      {isSavingGlobal ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
                      {isSavingGlobal ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                  <textarea
                    className="textarea font-mono text-sm min-h-[140px]"
                    placeholder={t('settings.guidelines.placeholder')}
                    value={globalGuidelines}
                    onChange={e => setGlobalGuidelines(e.target.value)}
                  />
                </div>

                {/* Per project guidelines */}
                <div className="space-y-3">
                  <p className="section-label px-1">{t('settings.guidelines.perProject')}</p>

                  {guidelinesProjects.length === 0 ? (
                    <div className="p-8 border border-dashed border-[var(--hairline-strong)] rounded-2xl text-center text-sm text-[var(--ink-muted)] bg-[var(--surface-card)]">
                      {t('settings.guidelines.noProjects')}
                    </div>
                  ) : (
                    guidelinesProjects.map(gp => (
                      <div key={gp.project.id} className="card p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-base text-[var(--ink)]">{gp.project.name}</span>
                            <span className="badge badge-muted flex items-center gap-1.5 lowercase">
                              <GitBranch size={10} /> {gp.project.branch}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[var(--ink-muted)]">
                              {gp.savedAt === 'Synced' ? '' : gp.savedAt}
                            </span>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleSaveProjectGuideline(gp.project.id, gp.text)}
                              disabled={gp.isSaving}
                            >
                              {gp.isSaving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
                              {gp.isSaving ? t('common.saving') : t('common.save')}
                            </button>
                          </div>
                        </div>

                        <textarea
                          className="textarea font-mono text-sm min-h-[100px]"
                          placeholder={t('settings.guidelines.placeholder')}
                          value={gp.text}
                          onChange={e => {
                            const val = e.target.value
                            setGuidelinesProjects(prev =>
                              prev.map(p => (p.project.id === gp.project.id ? { ...p, text: val, savedAt: 'Modified' } : p))
                            )
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )

      case 'integrations':
        const isGitHubConnected = Boolean(
          profile?.github_token ||
          session?.provider_token
        )
        return (
          <div className="space-y-6 max-w-3xl page-enter">
            {/* Main GitHub card */}
            <div className="card p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <div className="h-12 w-12 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--hairline)] flex items-center justify-center text-[var(--ink)]">
                    <Github size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.integrations.githubTitle')}</h3>
                    <p className="text-sm text-[var(--ink-muted)] max-w-md">{t('settings.integrations.githubDesc')}</p>
                  </div>
                </div>

                <span className={`badge ${isGitHubConnected ? 'badge-success' : 'badge-muted'}`}>
                  {isGitHubConnected ? t('settings.integrations.connected') : t('settings.integrations.notConnected')}
                </span>
              </div>

              {isGitHubConnected && (
                <div className="p-4 bg-[var(--canvas-soft)] border border-[var(--hairline)] rounded-xl space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--ink-muted)]">{t('settings.integrations.connectedAs')}</span>
                    <span className="font-semibold text-[var(--ink)] font-mono">
                      {session?.user?.user_metadata?.preferred_username || session?.user?.email}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--ink-muted)]">{t('settings.integrations.repoSync')}</span>
                    <span className="text-[var(--semantic-success)] font-medium">{t('settings.integrations.automatic')}</span>
                  </div>
                </div>
              )}

              <button
                className={`btn ${isGitHubConnected ? 'btn-secondary' : 'btn-primary'}`}
                onClick={async () => {
                  const { error: connectError } = await connectGitHub('/settings')
                  if (connectError) toastError(connectError.message)
                }}
                style={{ gap: 8 }}
              >
                <Github size={16} />
                {isGitHubConnected ? t('settings.integrations.reconnectBtn') : t('settings.integrations.installBtn')}
              </button>
            </div>

            {/* Other integrations grid */}
            <div>
              <p className="section-label mb-3 px-1">{t('settings.integrations.otherPlatforms')}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    id: 'gitlab',
                    title: t('settings.integrations.gitlabTitle'),
                    desc: t('settings.integrations.gitlabDesc'),
                  },
                  {
                    id: 'slack',
                    title: t('settings.integrations.slackTitle'),
                    desc: t('settings.integrations.slackDesc'),
                  },
                  {
                    id: 'discord',
                    title: t('settings.integrations.discordTitle'),
                    desc: t('settings.integrations.discordDesc'),
                  },
                ].map(item => (
                  <div key={item.id} className="card p-5 flex flex-col justify-between min-h-[160px] opacity-75">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm text-[var(--ink)]">{item.title}</span>
                        <span className="badge badge-muted text-[10px] scale-90">{t('common.comingSoon')}</span>
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{item.desc}</p>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm mt-4 w-full"
                      onClick={() => toastInfo(t('common.comingSoon'))}
                    >
                      {t('common.comingSoon')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      case 'team':
        return (
          <div className="space-y-6 max-w-4xl page-enter">
            <div className="card p-6 space-y-2">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-[var(--canvas-soft)] border border-[var(--hairline)] flex items-center justify-center text-[var(--primary)]">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.team.title')}</h3>
                  <p className="text-sm text-[var(--ink-muted)]">{t('settings.team.subtitle')}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  id: 'members',
                  icon: UserPlus,
                  title: t('settings.team.membersTitle'),
                  desc: t('settings.team.membersDesc'),
                },
                {
                  id: 'guidelines',
                  icon: BookOpen,
                  title: t('settings.team.guidelinesTitle'),
                  desc: t('settings.team.guidelinesDesc'),
                },
                {
                  id: 'dashboard',
                  icon: BarChart3,
                  title: t('settings.team.dashboardTitle'),
                  desc: t('settings.team.dashboardDesc'),
                },
                {
                  id: 'cicd',
                  icon: GitPullRequest,
                  title: t('settings.team.cicdTitle'),
                  desc: t('settings.team.cicdDesc'),
                },
                {
                  id: 'review',
                  icon: ListChecks,
                  title: t('settings.team.reviewTitle'),
                  desc: t('settings.team.reviewDesc'),
                },
              ].map(item => (
                <div key={item.id} className="card p-5 flex flex-col justify-between min-h-[160px] opacity-75">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <item.icon size={16} className="text-[var(--ink-muted)] shrink-0" />
                        <span className="font-semibold text-sm text-[var(--ink)]">{item.title}</span>
                      </div>
                      <span className="badge badge-muted text-[10px] scale-90">{t('common.comingSoon')}</span>
                    </div>
                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{item.desc}</p>
                  </div>

                  <button
                    className="btn btn-secondary btn-sm mt-4 w-full"
                    onClick={() => toastInfo(t('common.comingSoon'))}
                  >
                    {t('common.comingSoon')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )

      case 'invite':
        return (
          <div className="space-y-6 max-w-2xl page-enter">
            <div className="card p-6 space-y-2">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-[var(--canvas-soft)] border border-[var(--hairline)] flex items-center justify-center text-[var(--primary)]">
                  <Gift size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.invite.title')}</h3>
                  <p className="text-sm text-[var(--ink-muted)]">{t('settings.invite.subtitle')}</p>
                </div>
              </div>
            </div>

            <div className="card p-6 space-y-5 opacity-75">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-[var(--ink)]">{t('settings.invite.linkLabel')}</span>
                <span className="badge badge-muted text-[10px] scale-90">{t('common.comingSoon')}</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  disabled
                  readOnly
                  placeholder={t('settings.invite.linkPlaceholder')}
                  className="input flex-1 text-sm opacity-60"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm shrink-0"
                  onClick={() => toastInfo(t('common.comingSoon'))}
                >
                  <Copy size={14} />
                  {t('settings.invite.copyBtn')}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas-soft)] p-3 text-center">
                  <div className="text-xl font-semibold text-[var(--ink)]">0</div>
                  <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wide mt-1">{t('settings.invite.statInvited')}</div>
                </div>
                <div className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas-soft)] p-3 text-center">
                  <div className="text-xl font-semibold text-[var(--ink)]">0</div>
                  <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wide mt-1">{t('settings.invite.statActivated')}</div>
                </div>
                <div className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas-soft)] p-3 text-center">
                  <div className="text-xl font-semibold text-[var(--ink)]">0</div>
                  <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wide mt-1">{t('settings.invite.statCredits')}</div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--hairline)]">
                <p className="section-label">{t('settings.invite.howItWorksTitle')}</p>
                <ul className="text-sm text-[var(--ink-muted)] space-y-2 list-none">
                  <li className="flex gap-2">
                    <span className="text-[var(--ink-muted)]">1.</span>
                    <span>{t('settings.invite.step1')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[var(--ink-muted)]">2.</span>
                    <span>{t('settings.invite.step2')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[var(--ink-muted)]">3.</span>
                    <span>{t('settings.invite.step3')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )

      case 'danger':
        return (
          <div className="space-y-6 max-w-2xl page-enter">
            {/* Account danger actions card */}
            <div className="card p-6 space-y-6 border border-[var(--semantic-error)]/30 bg-[var(--semantic-error)]/5">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-[var(--semantic-error)]/10 flex items-center justify-center text-[var(--semantic-error)] shrink-0">
                  <ShieldAlert size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.danger.title')}</h3>
                  <p className="text-sm text-[var(--ink-muted)]">{t('settings.danger.subtitle')}</p>
                </div>
              </div>

              <hr className="divider border-[var(--semantic-error)]/10" />

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  className="btn btn-secondary text-[var(--ink)] border-[var(--hairline-strong)] hover:bg-[var(--canvas-soft)]"
                  onClick={signOut}
                >
                  <LogOut size={16} className="text-[var(--ink-muted)]" />
                  {t('settings.danger.signOutBtn')}
                </button>

                <button
                  className="btn bg-[var(--semantic-error)] text-white hover:opacity-90"
                  onClick={() => {
                    setDeleteConfirmationInput('')
                    setDeleteError(null)
                    setShowDeleteModal(true)
                  }}
                >
                  <Trash2 size={16} />
                  {t('settings.danger.deleteBtn')}
                </button>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const confirmationWord = lang === 'pt' ? 'ELIMINAR' : 'DELETE'

  return (
    <div className="p-8 md:p-12 h-full overflow-y-auto box-sizing bg-[var(--canvas-soft)] select-none">
      <div className="max-w-4xl mx-auto space-y-8 pb-16">
        <div>
          <span className="section-label font-mono text-[10px] tracking-wider text-[var(--ink-muted-soft)] uppercase mb-1 block">
            {t('settings.title')}
          </span>
          <h1 className="page-title mb-1">
            {t(`settings.tabs.${activeTab}`)}.
          </h1>
        </div>

        {renderActiveTabContent()}
      </div>

      {/* Confirmation Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full p-6 relative border border-[var(--hairline)] shadow-2xl animate-[backdropIn_0.2s_ease-out]">
            <button
              onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
              className="absolute right-4 top-4 btn btn-ghost p-1.5 h-auto text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              <X size={16} />
            </button>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-[var(--semantic-error)]">
                <ShieldAlert size={24} />
                <h3 className="text-lg font-bold">{t('settings.danger.modalTitle')}</h3>
              </div>

              <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                {t('settings.danger.modalDesc', { deleteWord: `"${confirmationWord}"` })}
              </p>

              <input
                type="text"
                className="input font-semibold tracking-wide uppercase text-center border-red-500/30"
                placeholder={t('settings.danger.modalPlaceholder')}
                value={deleteConfirmationInput}
                onChange={e => setDeleteConfirmationInput(e.target.value.toUpperCase())}
                disabled={isDeletingAccount}
              />

              {deleteError && (
                <div className="p-3 bg-[var(--semantic-error)]/10 border border-[var(--semantic-error)]/25 rounded-lg flex gap-2 text-xs text-[var(--semantic-error)]">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeletingAccount}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="btn bg-[var(--semantic-error)] text-white btn-sm"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmationInput !== confirmationWord || isDeletingAccount}
                >
                  {isDeletingAccount ? <Loader2 size={14} className="spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
                  {isDeletingAccount ? t('common.saving') : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
