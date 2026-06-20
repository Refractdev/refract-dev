import React, { useState, useEffect } from 'react'
import {
  Plus, FolderOpen, GitBranch, Play, Trash2,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { Project } from '../shared/types'
import { useAuth } from '../lib/AuthContext'
import { NewProjectModal } from '../components/NewProjectModal'
import { ScoreRing } from '../components/ScoreRing'
import { cn } from '../lib/utils'

import { getAllProjects, deleteProject, getHealthSnapshots } from '../lib/db'
import { useTranslation } from '../hooks/useTranslation'
import { getScoreColor, getDelta, C } from '../lib/health'
import type { HealthSnapshot } from '../lib/health'
import { useToast } from '../components/Toast'
import { Modal, ModalHeader, ModalFooter } from '../components/Modal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectWithHealth extends Project {
  healthScore?: number
  lastSnapshot?: HealthSnapshot
  prevSnapshot?: HealthSnapshot
  snapshots?: HealthSnapshot[]
}

// Mini sparkline — SVG simples baseado em scores
const Sparkline: React.FC<{ snapshots: HealthSnapshot[]; color: string }> = ({ snapshots, color }) => {
  if (snapshots.length < 2) return null
  const W = 64, H = 24
  const scores = snapshots.map((s: HealthSnapshot) => s.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1

  const points = scores.map((s: number, i: number) => {
    const x = (i / (scores.length - 1)) * W
    const y = H - ((s - min) / range) * H
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
    </svg>
  )
}



// ─── Project Card ─────────────────────────────────────────────────────────────

const ProjectCard: React.FC<{
  project: ProjectWithHealth
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onAnalyse: (e: React.MouseEvent) => void
}> = ({ project, onClick, onDelete, onAnalyse }) => {
  const { t, lang } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const score = project.healthScore
  const color = score !== undefined ? getScoreColor(score) : C.muted
  const delta = getDelta(project.lastSnapshot, project.prevSnapshot)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="card group cursor-pointer relative flex flex-col justify-between py-5 px-6 border bg-[var(--surface-card)] border-[var(--hairline)]"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[var(--ink)] truncate">
            {project.name}
          </p>
          <p className="text-xs font-mono text-[var(--ink-muted)] truncate mt-1">
            {project.repo || project.path}
          </p>
        </div>
        {score !== undefined && (
          <div className="flex-shrink-0 ml-3">
            <ScoreRing score={score} size={40} />
          </div>
        )}
        {score === undefined && (
          <span className="badge badge-muted text-[10px] scale-90 origin-right flex-shrink-0">
            {t('home.notAnalysed')}
          </span>
        )}
      </div>

      {/* Middle row — metrics */}
      <div className="flex items-center gap-2 mb-4">
        <span className="badge badge-muted flex items-center gap-1.5 font-mono text-[10px] py-0.5 px-2">
          <GitBranch size={9} /> {project.branch || 'main'}
        </span>
        {delta !== null && (
          <span className={cn(
            "inline-flex items-center gap-1 text-[11px] font-semibold",
            delta >= 0 ? "text-[var(--semantic-success)]" : "text-[var(--semantic-error)]"
          )}>
            {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
        {project.lastSnapshot && (
          <span className="section-label font-mono text-[10px] tracking-wide text-[var(--ink-muted-soft)] ml-auto">
            {project.lastSnapshot.issueCount} {lang === 'pt' ? 'problemas' : lang === 'es' ? 'problemas' : lang === 'fr' ? 'problèmes' : lang === 'de' ? 'Probleme' : 'issues'}
          </span>
        )}
      </div>

      {/* Sparkline if history exists */}
      {project.snapshots && project.snapshots.length >= 2 && (
        <div className="mb-4">
          <Sparkline snapshots={project.snapshots} color={color} />
        </div>
      )}

      {/* Bottom row — actions */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--hairline-soft)] mt-auto">
        <span className="text-[11px] text-[var(--ink-muted-soft)]">
          {project.last_run 
            ? t('projects.lastAnalysis', { date: new Date(project.last_run).toLocaleDateString(lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US') }) 
            : t('projects.neverAnalysed')}
        </span>
        <div className="flex gap-1.5 items-center touch-visible-actions" style={{ opacity: hovered ? 1 : undefined }}>
          <button
            onClick={onAnalyse}
            title={t('projects.analyseBtn')}
            className="btn btn-secondary btn-sm rounded-pill text-[11px] h-6 px-3"
          >
            <Play size={10} /> {t('projects.analyseBtn')}
          </button>
          <button
            onClick={onDelete}
            title={t('common.delete')}
            className="btn btn-ghost btn-sm rounded-sm h-6 w-6 p-0 hover:bg-[var(--semantic-error)]/10"
          >
            <Trash2 size={12} className="text-[var(--semantic-error)]" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface ProjectsPageProps {
  onOpenProject: (id: string) => void
  onOpenMonitor: (id: string, data: ProjectWithHealth) => void
  onNavigate?: (page: string, params?: any) => void
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ onOpenProject, onOpenMonitor, onNavigate }) => {
  const { profile } = useAuth()
  const { t, lang } = useTranslation()
  const { success: toastSuccess, error: toastError } = useToast()
  const [projects, setProjects] = useState<ProjectWithHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = async () => {
    if (!profile?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const p: Project[] = await getAllProjects(profile.id)

      const enriched: ProjectWithHealth[] = await Promise.all(
        (p || []).map(async (proj) => {
          const snapshots: any[] = await getHealthSnapshots(proj.id, profile.id)
          const [last, prev] = snapshots // mais recente primeiro
          return {
            ...proj,
            healthScore: last?.score,
            lastSnapshot: last ? {
              score: last.score,
              timestamp: last.timestamp,
              issueCount: last.issue_count,
              high: last.high,
              medium: last.medium,
              low: last.low,
            } : undefined,
            prevSnapshot: prev ? {
              score: prev.score,
              timestamp: prev.timestamp,
              issueCount: prev.issue_count,
              high: prev.high,
              medium: prev.medium,
              low: prev.low,
            } : undefined,
            snapshots: snapshots.reverse().map((s: any) => ({
              score: s.score,
              timestamp: s.timestamp,
              issueCount: s.issue_count,
              high: s.high,
              medium: s.medium,
              low: s.low,
            })),
          }
        })
      )

      setProjects(enriched)
    } catch (e) {
      console.error(e)
      setError('Failed to load projects: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.id) {
      loadProjects()
    }
  }, [profile?.id])

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleDeleteRequest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleteConfirmId(id)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    try {
      await deleteProject(id)
      setProjects((prev: ProjectWithHealth[]) => prev.filter((p: ProjectWithHealth) => p.id !== id))
      toastSuccess('Project deleted.')
    } catch (err) {
      toastError('Failed to delete project: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const pluralSuffix = lang === 'de' ? (projects.length !== 1 ? 'e' : '') : (projects.length !== 1 ? 's' : '')

  return (
    <div className="p-8 md:p-12 h-full overflow-y-auto bg-[var(--canvas-soft)] select-none box-sizing">
      <style>{`@media (hover: none) { .touch-visible-actions { opacity: 1 !important; } }`}</style>

      {/* In-app delete confirmation dialog */}
      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} maxWidth={380}>
        <ModalHeader
          title={t('projects.confirmDelete') || 'Delete project?'}
          subtitle="This will permanently remove the project and all its analysis history. This action cannot be undone."
          onClose={() => setDeleteConfirmId(null)}
        />
        <ModalFooter>
          <button className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirmId(null)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-sm bg-[var(--semantic-error)] text-white border-0"
            onClick={handleDeleteConfirm}
          >
            {t('common.delete')}
          </button>
        </ModalFooter>
      </Modal>

       {error && (
         <div className="p-3.5 bg-[var(--semantic-error)]/10 border border-[var(--semantic-error)]/25 rounded-sm text-xs text-[var(--semantic-error)] leading-relaxed mb-4">
           {error}
         </div>
       )}
       {/* Header */}
       <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="page-title mb-1">
              {t('projects.title')}.
            </h1>
            <p className="text-xs text-[var(--ink-muted)] font-sans">
              {t('projects.projectCount', { 
                count: String(projects.length), 
                plural: pluralSuffix 
              })}
            </p>
          </div>
          <button className="btn btn-primary rounded-pill shadow-sm px-4" onClick={() => setShowModal(true)}>
            <Plus size={16} /> {t('projects.newProject')}
          </button>
      </div>

      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="skeleton h-4 rounded" style={{ width: '55%' }} />
                <div className="skeleton h-5 w-14 rounded-full" />
              </div>
              <div className="skeleton h-3 rounded" style={{ width: '35%' }} />
              <div className="skeleton h-12 rounded" />
              <div className="flex gap-2 mt-1">
                <div className="skeleton h-7 w-20 rounded" />
                <div className="skeleton h-7 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 mt-24">
          <FolderOpen size={20} className="text-[var(--ink-muted-soft)]" />
          <p className="text-xs text-[var(--ink-muted)]">{t('projects.noProjects')}</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary text-xs rounded-pill px-5">
            <Plus size={14} /> {t('projects.emptyCta')}
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {projects.map((p: ProjectWithHealth) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => onOpenMonitor(p.id, p)}
              onDelete={(e: React.MouseEvent) => handleDeleteRequest(e, p.id)}
              onAnalyse={(e: React.MouseEvent) => { e.stopPropagation(); onOpenProject(p.id) }}
            />
          ))}

          {/* Add new card */}
          <button
            onClick={() => setShowModal(true)}
            className="card flex flex-col items-center justify-center gap-3 min-h-[140px] border border-dashed border-[var(--hairline-strong)] bg-transparent"
          >
            <Plus size={20} className="text-[var(--ink-muted)]" />
            <span className="section-label text-[10px] font-mono tracking-wider">{t('projects.newProject')}</span>
          </button>
        </div>
      )}

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onProjectCreated={(project: Project) => {
            setProjects((prev: ProjectWithHealth[]) => [{ ...project }, ...prev])
            setShowModal(false)
            onOpenProject(project.id)
          }}
          onNavigate={(page, params) => {
            setShowModal(false)
            if (typeof (onNavigate as any) === 'function') (onNavigate as any)(page, params)
          }}
        />
      )}
    </div>
  )
}
