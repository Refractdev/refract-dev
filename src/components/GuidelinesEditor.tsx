import React, { useEffect, useState } from 'react'
import { GitBranch, Save, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getAllProjects, getSetting, setSetting } from '../lib/db'
import { useTranslation } from '../hooks/useTranslation'
import { useToast } from './Toast'
import type { Project } from '../shared/types'

interface ProjectGuideline {
  project: Project
  text: string
  isSaving: boolean
  savedAt: string
}

interface GuidelinesEditorProps {
  showHeader?: boolean
  className?: string
}

export const GuidelinesEditor: React.FC<GuidelinesEditorProps> = ({
  showHeader = true,
  className = '',
}) => {
  const { profile } = useAuth()
  const { t } = useTranslation()
  const { success: toastSuccess, error: toastError } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [globalGuidelines, setGlobalGuidelines] = useState('')
  const [isSavingGlobal, setIsSavingGlobal] = useState(false)
  const [guidelinesProjects, setGuidelinesProjects] = useState<ProjectGuideline[]>([])

  useEffect(() => {
    if (!profile?.id) {
      setIsLoading(false)
      return
    }

    const loadGuidelines = async () => {
      setIsLoading(true)
      try {
        const gText = await getSetting('global_guidelines', '')
        setGlobalGuidelines(gText)

        const allProjects = await getAllProjects(profile.id)
        const projectItems: ProjectGuideline[] = []
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
        console.error('Error loading guidelines:', err)
      } finally {
        setIsLoading(false)
      }
    }

    void loadGuidelines()
  }, [profile?.id])

  const handleSaveGlobalGuidelines = async () => {
    setIsSavingGlobal(true)
    try {
      await setSetting('global_guidelines', globalGuidelines)
      toastSuccess('Guidelines saved.')
    } catch (err) {
      console.error('[guidelines] Failed to save global guidelines:', err)
      toastError('Failed to save guidelines. Please try again.')
    } finally {
      setTimeout(() => setIsSavingGlobal(false), 500)
    }
  }

  const handleSaveProjectGuideline = async (projectId: string, text: string) => {
    setGuidelinesProjects(prev =>
      prev.map(p => (p.project.id === projectId ? { ...p, isSaving: true } : p))
    )
    try {
      await setSetting(`guideline_${projectId}`, text)
      toastSuccess('Guidelines saved.')
      setGuidelinesProjects(prev =>
        prev.map(p =>
          p.project.id === projectId
            ? { ...p, isSaving: false, savedAt: 'Just now' }
            : p
        )
      )
    } catch (err) {
      console.error('[guidelines] Failed to save project guideline:', err)
      toastError('Failed to save guideline. Please try again.')
      setGuidelinesProjects(prev =>
        prev.map(p => (p.project.id === projectId ? { ...p, isSaving: false } : p))
      )
    }
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-3 text-sm text-[var(--ink-muted)] p-6 ${className}`}>
        <Loader2 size={16} className="spin text-[var(--primary)]" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className={`space-y-6 max-w-3xl ${className}`}>
      {showHeader && (
        <div className="card p-6 space-y-2 bg-[var(--canvas-soft)] border border-[var(--hairline)]">
          <h3 className="text-lg font-medium text-[var(--ink)]">{t('settings.guidelines.title')}</h3>
          <p className="text-sm text-[var(--ink-muted)]">{t('settings.guidelines.subtitle')}</p>
        </div>
      )}

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-[var(--ink)]">{t('settings.guidelines.global')}</h4>
            <p className="text-xs text-[var(--ink-muted)]">{t('settings.guidelines.globalDesc')}</p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void handleSaveGlobalGuidelines()}
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
                  {gp.savedAt !== 'Synced' && (
                    <span className="text-xs text-[var(--ink-muted)]">{gp.savedAt}</span>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleSaveProjectGuideline(gp.project.id, gp.text)}
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
                    prev.map(p =>
                      p.project.id === gp.project.id ? { ...p, text: val, savedAt: 'Modified' } : p
                    )
                  )
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
