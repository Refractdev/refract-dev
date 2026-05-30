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
    <div style={{ padding: '80px 40px', height: '100%', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--canvas)' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

       {/* Hero Section */}
       <div style={{ marginBottom: 80, animation: 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both', maxWidth: 800 }}>
         {error && (
            <div style={{ 
              background: 'rgba(207, 45, 86, 0.08)', 
              border: '1px solid rgba(207, 45, 86, 0.18)', 
              borderRadius: '8px', 
              color: 'var(--semantic-error)', 
              fontSize: '14px', 
              lineHeight: 1.5, 
              padding: '12px 16px', 
              marginBottom: 16 
            }}>
              {error}
            </div>
          )}
          <h1 className="page-title" style={{ marginBottom: 16, fontSize: '36px', fontWeight: 400, letterSpacing: '-0.72px', lineHeight: 1.2 }}>
            {greeting(t)}
          </h1>
          <p style={{ 
            fontSize: '16px', 
            color: 'var(--body)', 
            lineHeight: 1.5, 
            letterSpacing: 0,
            maxWidth: 600,
            fontFamily: 'var(--font-sans)',
            marginBottom: 32
          }}>
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

         {/* ── Quick actions — only appears if no projects ─────────────────── */}
         {!loading && !hasProjects && (
           <div style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both' }}>
             <button onClick={() => setShowModal(true)} className="btn btn-primary">
               <Plus size={16} /> {t('home.actions.addFirst')}
             </button>
           </div>
         )}
       </div>

      {/* ── Recent Projects ───────────────────────────────────────────────────── */}
      <div style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both', marginBottom: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: '26px', fontWeight: 400, letterSpacing: '-0.325px', color: 'var(--ink)', lineHeight: 1.25, fontFamily: 'var(--font-sans)' }}>{t('home.recentProjects')}</h2>
          {hasProjects && (
            <button
              onClick={() => onNavigate('projects')}
              className="btn btn-secondary"
            >
              {t('home.actions.viewAll')} <ArrowRight size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {loading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="card" style={{ minHeight: 110, opacity: 0.5, padding: '16px 20px' }}>
                <div style={{ width: '60%', height: 14, background: 'var(--canvas-soft)', borderRadius: '4px', marginBottom: 16 }} />
                <div style={{ width: '40%', height: 12, background: 'var(--canvas-soft)', borderRadius: '4px' }} />
              </div>
            ))
          ) : (
              <>
                {projects.slice(0, 5).map((p: Project, idx: number) => (
                  <div
                    key={p.id}
                    onClick={() => onNavigate('project-view', { projectId: p.id })}
                    className="card"
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', minHeight: 110, padding: '16px 20px', animation: `fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${0.18 + idx * 0.04}s both` }}
                 >
                   <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                     <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: 0, color: 'var(--ink)' }}>{p.name}</span>
                     <StatusBadge status={normalizeStatus(p.status)} t={t} />
                   </div>
                   <p style={{ fontSize: '14px', color: 'var(--ink-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 16, lineHeight: 1.5 }}>
                     {p.repo || p.path || ''}
                   </p>
                   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                     <span className="badge badge-muted">
                       <GitBranch size={11} /> {p.branch || 'main'}
                     </span>
                     <span style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
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

      {/* ── What Refract does ─────────────── */}
      {!loading && !hasProjects && (
        <div style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.16s both', marginTop: 40 }}>
          <p className="section-label" style={{ marginBottom: 16 }}>
            {t('home.whatRefractDoes')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ marginBottom: 12, color: 'var(--ink)' }}><Zap size={18} /></div>
              <p style={{ fontSize: '16px', fontWeight: 600, letterSpacing: 0, color: 'var(--ink)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>{t('home.features.astTitle')}</p>
              <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>{t('home.features.astDesc')}</p>
            </div>
            
            <div className="card" style={{ padding: 24 }}>
              <div style={{ marginBottom: 12, color: 'var(--ink)' }}><Activity size={18} /></div>
              <p style={{ fontSize: '16px', fontWeight: 600, letterSpacing: 0, color: 'var(--ink)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>{t('home.features.healthTitle')}</p>
              <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>{t('home.features.healthDesc')}</p>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div style={{ marginBottom: 12, color: 'var(--ink)' }}><Wrench size={18} /></div>
              <p style={{ fontSize: '16px', fontWeight: 600, letterSpacing: 0, color: 'var(--ink)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>{t('home.features.applyTitle')}</p>
              <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>{t('home.features.applyDesc')}</p>
            </div>
          </div>
        </div>
      )}

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
