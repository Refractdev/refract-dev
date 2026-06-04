import React, { useState, useEffect } from 'react'
import { Plus, GitBranch, ArrowRight, Zap, Activity, Wrench } from 'lucide-react'
import { Page } from '../components/Sidebar'
import { Project } from '../shared/types'
import { useAuth } from '../lib/AuthContext'
import { NewProjectModal } from '../components/NewProjectModal'
import { getRecentProjects } from '../lib/db'
import { useTranslation } from '../hooks/useTranslation'

interface HomePageProps {
  onNavigate: (page: Page | string, params?: any) => void
}

const greeting = (t: (key: string) => string): string => {
  const h = new Date().getHours()
  if (h < 12) return t('home.greetings.morning')
  if (h < 18) return t('home.greetings.afternoon')
  return t('home.greetings.evening')
}

const normalizeStatus = (status?: string): string => {
  if (status === 'Analysed') return 'Refracted'
  return status || 'Not analysed'
}

const StatusBadge: React.FC<{ status: string; t: (key: string) => string }> = ({ status, t }) => {
  const normalized = normalizeStatus(status)
  const map: Record<string, string> = {
    Refracted:      'badge-success',
    Pending:        'badge-medium',
    'Not analysed': 'badge-muted',
  }
  const labelMap: Record<string, string> = {
    Refracted:      t('home.refracted'),
    Pending:        t('home.pending'),
    'Not analysed': t('home.notAnalysed'),
  }
  const cls = map[normalized] ?? map['Not analysed']
  const label = labelMap[normalized] ?? labelMap['Not analysed']
  return (
    <span className={`badge ${cls}`}>
      {label}
    </span>
  )
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { profile } = useAuth()
  const { t, lang } = useTranslation()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!profile?.id) {
        setLoading(false)
        return
      }
      try {
        setError(null);
        const p = await getRecentProjects(profile.id)
        setProjects(p ?? [])
      } catch (err) {
        console.error('Failed to load home data:', err)
        setError('Failed to load projects: ' + (err instanceof Error ? err.message : 'Unknown error'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profile?.id])

  const hasProjects = projects.length > 0
  const analysedCount = projects.filter((p: Project) => normalizeStatus(p.status) === 'Refracted').length

  const pluralSuffix = lang === 'de' ? (projects.length !== 1 ? 'e' : '') : (projects.length !== 1 ? 's' : '')

  return (
    <div className="relative min-h-full h-full overflow-y-auto bg-[var(--canvas-soft)] px-6 py-12 md:px-16 md:py-20 select-none stagger-list box-sizing">

      <div className="relative z-10 max-w-5xl mx-auto space-y-16">
        {/* Hero Section */}
        <div className="space-y-4 max-w-2xl">
          {error && (
            <div className="p-3.5 bg-[var(--semantic-error)]/10 border border-[var(--semantic-error)]/25 rounded-sm text-xs text-[var(--semantic-error)] leading-relaxed">
              {error}
            </div>
          )}
          
          <h1 className="text-display-lg font-semibold tracking-tight text-[var(--ink)]">
            {greeting(t)}.
          </h1>
          
          <p className="text-body-md text-[var(--body)] leading-relaxed font-sans max-w-xl">
            {!loading && hasProjects
              ? analysedCount > 0
                ? t('home.stats.projectsInfo', {
                    count: String(projects.length),
                    plural: pluralSuffix,
                    analysedCount: String(analysedCount),
                  })
                : t('home.stats.projectsInfoNone', {
                    count: String(projects.length),
                    plural: pluralSuffix,
                  })
              : !loading && !hasProjects
              ? t('home.stats.noProjects')
              : t('home.stats.loading')
            }
          </p>

          {/* Quick actions — only appears if no projects */}
          {!loading && !hasProjects && (
            <div className="pt-2">
              <button 
                onClick={() => setShowModal(true)} 
                className="btn btn-primary shadow-sm rounded-pill px-6"
              >
                <Plus size={16} /> {t('home.actions.addFirst')}
              </button>
            </div>
          )}
        </div>

        {/* Recent Projects Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-display-sm font-semibold tracking-tight text-[var(--ink)]">
              {t('home.recentProjects')}.
            </h2>
            {hasProjects && (
              <button
                onClick={() => onNavigate('projects')}
                className="btn btn-secondary text-xs rounded-pill px-4"
              >
                {t('home.actions.viewAll')} <ArrowRight size={12} className="ml-1" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="card min-h-[120px] opacity-60 flex flex-col justify-between py-4 px-5">
                  <div className="space-y-2">
                    <div className="w-[60%] h-3.5 bg-[var(--canvas-soft-2)] rounded-xs shimmer" />
                    <div className="w-[40%] h-3 bg-[var(--canvas-soft-2)] rounded-xs shimmer" />
                  </div>
                  <div className="w-[20%] h-2.5 bg-[var(--canvas-soft-2)] rounded-xs shimmer" />
                </div>
              ))
            ) : (
              <>
                {projects.slice(0, 5).map((p: Project, idx: number) => (
                  <div
                    key={p.id}
                    onClick={() => onNavigate('project-view', { projectId: p.id })}
                    className="card group cursor-pointer flex flex-col justify-between min-h-[120px] py-4 px-5 bg-[var(--surface-card)]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[15px] font-semibold text-[var(--ink)] truncate max-w-[70%]">
                          {p.name}
                        </span>
                        <StatusBadge status={normalizeStatus(p.status)} t={t} />
                      </div>
                      <p className="text-xs font-mono text-[var(--ink-muted)] truncate">
                        {p.repo || p.path || ''}
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 mt-4 border-t border-[var(--hairline-soft)]">
                      <span className="badge badge-muted flex items-center gap-1.5 font-mono text-[10px] scale-90 origin-left">
                        <GitBranch size={9} /> {p.branch || 'main'}
                      </span>
                      <span className="text-[11px] text-[var(--ink-muted-soft)]">
                        {p.last_run 
                          ? new Date(p.last_run).toLocaleDateString(lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US') 
                          : t('home.never')}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Feature Cards Grid (What Refract does) */}
        {!loading && !hasProjects && (
          <div className="space-y-6 pt-4">
            <p className="section-label font-mono text-[10px] tracking-wider text-[var(--ink-muted-soft)] uppercase px-1">
              {t('home.whatRefractDoes')}.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card space-y-4">
                <div className="p-2 w-10 h-10 rounded-sm bg-[var(--canvas-soft-2)] border border-[var(--hairline)] flex items-center justify-center text-[var(--ink)]">
                  <Zap size={16} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-body-md-strong font-semibold text-[var(--ink)] tracking-tight">{t('home.features.astTitle')}</h3>
                  <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{t('home.features.astDesc')}</p>
                </div>
              </div>
              
              <div className="card space-y-4">
                <div className="p-2 w-10 h-10 rounded-sm bg-[var(--canvas-soft-2)] border border-[var(--hairline)] flex items-center justify-center text-[var(--ink)]">
                  <Activity size={16} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-body-md-strong font-semibold text-[var(--ink)] tracking-tight">{t('home.features.healthTitle')}</h3>
                  <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{t('home.features.healthDesc')}</p>
                </div>
              </div>

              <div className="card space-y-4">
                <div className="p-2 w-10 h-10 rounded-sm bg-[var(--canvas-soft-2)] border border-[var(--hairline)] flex items-center justify-center text-[var(--ink)]">
                  <Wrench size={16} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-body-md-strong font-semibold text-[var(--ink)] tracking-tight">{t('home.features.applyTitle')}</h3>
                  <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{t('home.features.applyDesc')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onProjectCreated={(project: Project) => {
            setProjects((prev: Project[]) => [project, ...prev])
            setShowModal(false)
            onNavigate('project-view', { projectId: project.id })
          }}
          onNavigate={onNavigate}
        />
      )}
    </div>
  )
}
