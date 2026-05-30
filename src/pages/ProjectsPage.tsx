import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus, FolderOpen, GitBranch, Play, Trash2, Loader2,
  TrendingDown, TrendingUp, Minus, X,
  AlertTriangle, CheckCircle, Clock, ChevronRight,
} from 'lucide-react'
import { Project } from '../shared/types'
import { useAuth } from '../lib/AuthContext'
import { NewProjectModal } from '../components/NewProjectModal'

import { getAllProjects, deleteProject, getHealthSnapshots } from '../lib/db'
import { fetchDriftReport, type DriftReport } from '../lib/api'
import { HealthTrendChart } from '../components/HealthTrendChart'
import { DriftAlertsPanel } from '../components/DriftAlertsPanel'
import { CategoryTrendChart } from '../components/CategoryTrendChart'
import { useTranslation } from '../hooks/useTranslation'

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  bg: 'var(--canvas)', surface: 'var(--surface-card)', border: 'var(--hairline)',
  text: 'var(--ink)', muted: 'var(--ink-muted)', subtle: 'var(--surface-strong)',
  green: 'var(--semantic-success)', red: 'var(--semantic-error)',
  yellow: 'var(--timeline-done)',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthSnapshot {
  score: number
  timestamp: string
  issueCount: number
  high: number
  medium: number
  low: number
}

interface ProjectWithHealth extends Project {
  healthScore?: number
  lastSnapshot?: HealthSnapshot
  prevSnapshot?: HealthSnapshot
  snapshots?: HealthSnapshot[]
}

// ─── Health Score helpers ─────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return C.green
  if (score >= 55) return C.yellow
  return C.red
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'rgba(31, 138, 101, 0.1)'
  if (score >= 55) return 'rgba(192, 133, 50, 0.1)'
  return 'rgba(207, 45, 86, 0.1)'
}

function getDelta(current?: HealthSnapshot, prev?: HealthSnapshot): number | null {
  if (!current || !prev) return null
  return current.score - prev.score
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

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 48 }) => {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = getScoreColor(score)

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={2} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        style={{ fill: color, fontSize: size * 0.32, fontWeight: 600, transform: 'rotate(90deg)', transformOrigin: '50% 50%', fontFamily: 'var(--font-mono)' }}>
        {score}
      </text>
    </svg>
  )
}

// ─── Monitor Panel ────────────────────────────────────────────────────────────

const MonitorPanel: React.FC<{
  project: ProjectWithHealth
  onClose: () => void
  onOpenAnalysis: () => void
  driftReport: DriftReport | null
  driftLoading: boolean
}> = ({ project, onClose, onOpenAnalysis, driftReport, driftLoading }) => {
  const { t, lang } = useTranslation()
  const score = project.healthScore ?? 0
  const color = getScoreColor(score)
  const bg = getScoreBg(score)
  const delta = getDelta(project.lastSnapshot, project.prevSnapshot)
  const snapshots = project.snapshots ?? []

  const chartData = snapshots.length >= 2
    ? snapshots.map((s) => ({ date: s.timestamp, score: s.score }))
    : null

  // Transform driftReport trends into CategoryTrendChart format
  // Each trend gives us current vs average — we simulate 2 data points: "Previous" and "Current"
  const categoryChartData = driftReport && driftReport.trends.length > 0
    ? [
        {
          date: 'Previous avg',
          ...Object.fromEntries(driftReport.trends.map(t => [t.category, Math.round(t.averageCount)])),
        },
        {
          date: 'Current',
          ...Object.fromEntries(driftReport.trends.map(t => [t.category, t.currentCount])),
        },
      ]
    : null

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
      background: 'var(--canvas)', borderLeft: '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column', zIndex: 100,
      animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>

      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid var(--hairline)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', letterSpacing: 0 }}>{project.name}</p>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {project.repo || project.path}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 4 }}
          onMouseEnter={e => (e.currentTarget.style.color = C.text)}
          onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* Health Score */}
        <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: '12px', padding: '24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
          <ScoreRing score={score} size={64} />
          <div style={{ flex: 1 }}>
            <p className="section-label" style={{ marginBottom: 4 }}>{t('home.features.healthTitle')}</p>
            <p style={{ fontSize: 28, fontWeight: 600, color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.05em' }}>{score}<span style={{ fontSize: 14, color: 'var(--ink-muted)' }}>/100</span></p>
            {delta !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                {delta > 0
                  ? <TrendingUp size={12} color={C.green} />
                  : delta < 0
                  ? <TrendingDown size={12} color={C.red} />
                  : <Minus size={12} color="var(--ink-muted)" />
                }
                <span style={{ fontSize: 12, color: delta > 0 ? C.green : delta < 0 ? C.red : 'var(--ink-muted)' }}>
                  {delta > 0 ? '+' : ''}{delta} {lang === 'pt' ? 'desde a última análise' : lang === 'es' ? 'desde el último análisis' : lang === 'fr' ? 'depuis la dernière analyse' : lang === 'de' ? 'seit der letzten Analyse' : 'since last analysis'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Degradation Detection */}
        <div style={{ marginBottom: 20 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>{t('projects.monitor.degradation.title')}</p>

          {project.lastSnapshot ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {delta !== null && delta < -5 && (
                <div style={{ background: 'rgba(207, 45, 86, 0.08)', border: '1px solid rgba(207, 45, 86, 0.18)', borderRadius: '8px', padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <AlertTriangle size={13} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 12, color: C.red, fontWeight: 500, marginBottom: 2 }}>{t('projects.monitor.degradation.detected')}</p>
                    <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{t('projects.monitor.degradation.detectedDesc', { points: String(Math.abs(delta)) })}</p>
                  </div>
                </div>
              )}
              {delta !== null && delta >= 0 && (
                <div style={{ background: 'rgba(31, 138, 101, 0.08)', border: '1px solid rgba(31, 138, 101, 0.18)', borderRadius: '8px', padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <CheckCircle size={13} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 12, color: C.green, fontWeight: 500, marginBottom: 2 }}>{t('projects.monitor.degradation.none')}</p>
                    <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{t('projects.monitor.degradation.noneDesc')}</p>
                  </div>
                </div>
              )}

              {/* Last snapshot info */}
              <div className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="section-label" style={{ fontSize: 11 }}>{t('projects.monitor.lastAnalysisTitle')}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                    {project.lastSnapshot.timestamp ? new Date(project.lastSnapshot.timestamp).toLocaleDateString(lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US') : '—'}
                  </span>
                </div>
                {[
                  { label: t('projects.monitor.totalIssues'), value: project.lastSnapshot.issueCount },
                  { label: t('projects.monitor.highImpact'), value: project.lastSnapshot.high, color: C.red },
                  { label: t('projects.monitor.medium'), value: project.lastSnapshot.medium, color: C.yellow },
                  { label: t('projects.monitor.low'), value: project.lastSnapshot.low, color: 'var(--ink-muted)' },
                ].map(({ label, value, color: vc }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: 'var(--ink-muted)' }}>{label}</span>
                    <span style={{ fontSize: 14, color: vc ?? 'var(--ink)', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--canvas-soft)', border: `1px solid var(--hairline)`, borderRadius: '8px', padding: '14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={13} color={C.muted} />
              <p style={{ fontSize: 14, color: C.muted }}>{t('projects.monitor.noAnalyses')}</p>
            </div>
          )}
        </div>

        {/* Health Trend Chart */}
        {chartData && (
          <div style={{ marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>{t('projects.monitor.scoreTrend')}</p>
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '12px 8px' }}>
              <HealthTrendChart data={chartData} height={160} />
            </div>
          </div>
        )}

        {/* Category Trends Chart */}
        {driftLoading && (
          <div style={{ marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>{lang === 'pt' ? 'Problemas por Categoria' : lang === 'es' ? 'Problemas por categoría' : lang === 'fr' ? 'Problèmes par catégorie' : lang === 'de' ? 'Probleme nach Kategorie' : 'Issues by Category'}</p>
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 8, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={14} color="var(--ink-muted)" className="spin" />
            </div>
          </div>
        )}
        {!driftLoading && categoryChartData && (
          <div style={{ marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>{lang === 'pt' ? 'Problemas por Categoria' : lang === 'es' ? 'Problemas por categoría' : lang === 'fr' ? 'Problèmes par catégorie' : lang === 'de' ? 'Probleme nach Kategorie' : 'Issues by Category'}</p>
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '12px 8px' }}>
              <CategoryTrendChart data={categoryChartData} height={160} />
            </div>
          </div>
        )}

        {/* Drift Alerts */}
        {!driftLoading && driftReport && (
          <div style={{ marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>{t('projects.monitor.alertsTitle', { count: '' }).replace('()', '').trim()}</p>
            <DriftAlertsPanel report={driftReport} />
          </div>
        )}

        {/* Category Trends */}
        {!driftLoading && driftReport && driftReport.trends.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>{lang === 'pt' ? 'Tendências por Categoria' : lang === 'es' ? 'Tendencias por categoría' : lang === 'fr' ? 'Tendances par catégorie' : lang === 'de' ? 'Kategorie-Trends' : 'Category Trends'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {driftReport.trends.map((trend) => {
                const isWorsening = trend.direction === 'worsening'
                const isImproving = trend.direction === 'improving'
                const color = isWorsening ? C.red : isImproving ? C.green : C.muted
                const icon = isWorsening
                  ? <TrendingDown size={11} color={C.red} />
                  : isImproving
                  ? <TrendingUp size={11} color={C.green} />
                  : <Minus size={11} color={C.muted} />

                return (
                  <div key={trend.category} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                    borderRadius: 6, padding: '8px 10px',
                  }}>
                    {icon}
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
                      {trend.category}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                      {lang === 'pt' ? 'média' : lang === 'es' ? 'media' : lang === 'fr' ? 'moyenne' : lang === 'de' ? 'Mittelwert' : 'avg'} {trend.averageCount}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color,
                      background: `${color}15`, borderRadius: 4, padding: '1px 6px',
                    }}>
                      {trend.currentCount}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Decay Hotspots */}
        {!driftLoading && driftReport && driftReport.decayHotspots.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>{lang === 'pt' ? 'Pontos Críticos de Degradação' : lang === 'es' ? 'Puntos críticos de degradación' : lang === 'fr' ? 'Points chauds de dégradation' : lang === 'de' ? 'Verfall-Hotspots' : 'Decay Hotspots'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {driftReport.decayHotspots.map((hotspot) => {
                const isCritical = hotspot.severity === 'critical'
                const color = isCritical ? C.red : C.yellow

                return (
                  <div key={hotspot.filePath} style={{
                    background: `${color}08`,
                    border: `1px solid ${color}22`,
                    borderRadius: 6, padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                        {hotspot.fileName}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color,
                        background: `${color}15`, borderRadius: 4, padding: '1px 6px', flexShrink: 0,
                      }}>
                        {isCritical ? (lang === 'pt' ? 'Crítico' : lang === 'es' ? 'Crítico' : lang === 'fr' ? 'Critique' : lang === 'de' ? 'Kritisch' : 'Critical') : (lang === 'pt' ? 'Aviso' : lang === 'es' ? 'Advertencia' : lang === 'fr' ? 'Avertissement' : lang === 'de' ? 'Warnung' : 'Warning')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                        +{hotspot.growthRate} issues/{lang === 'pt' ? 'análise' : lang === 'es' ? 'análisis' : lang === 'fr' ? 'analyse' : lang === 'de' ? 'Scan' : 'scan'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                        {hotspot.latestCount} issues {lang === 'pt' ? 'agora' : lang === 'es' ? 'ahora' : lang === 'fr' ? 'actuels' : lang === 'de' ? 'jetzt' : 'now'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                        {hotspot.appearances} {lang === 'pt' ? 'análises' : lang === 'es' ? 'análisis' : lang === 'fr' ? 'analyses' : lang === 'de' ? 'Scans' : 'scans'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{ padding: '16px 24px', borderTop: `1px solid var(--hairline)`, flexShrink: 0 }}>
        <button onClick={onOpenAnalysis} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Play size={14} /> {t('projects.monitor.openAnalysis')}</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

const ProjectCard: React.FC<{
  project: ProjectWithHealth
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onAnalyse: (e: React.MouseEvent) => void
  selected: boolean
}> = ({ project, onClick, onDelete, onAnalyse, selected }) => {
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
      className="card"
      style={{
        background: selected ? 'var(--canvas-soft)' : 'var(--surface-card)',
        padding: '20px', cursor: 'pointer',
        border: selected ? '1px solid var(--primary)' : '1px solid var(--hairline)',
        position: 'relative',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4, letterSpacing: 0 }}>{project.name}</p>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
            {project.repo || project.path}
          </p>
        </div>
        {score !== undefined && (
          <div style={{ flexShrink: 0, marginLeft: 12 }}>
            <ScoreRing score={score} size={40} />
          </div>
        )}
        {score === undefined && (
          <span style={{ fontSize: 11, color: C.muted, background: 'var(--surface-strong)', borderRadius: '4px', padding: '3px 7px', flexShrink: 0 }}>
            {t('home.notAnalysed')}
          </span>
        )}
      </div>

      {/* Middle row — métricas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span className="badge badge-muted" style={{ fontSize: 11, padding: '2px 6px' }}>
          <GitBranch size={9} /> {project.branch || 'main'}
        </span>
        {delta !== null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: delta >= 0 ? C.green : C.red, fontWeight: 600 }}>
            {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
        {project.lastSnapshot && (
          <span className="section-label" style={{ fontSize: 11, marginLeft: 'auto' }}>
            {project.lastSnapshot.issueCount} {lang === 'pt' ? 'problemas' : lang === 'es' ? 'problemas' : lang === 'fr' ? 'problèmes' : lang === 'de' ? 'Probleme' : 'issues'}
          </span>
        )}
      </div>

      {/* Sparkline se tiver histórico */}
      {project.snapshots && project.snapshots.length >= 2 && (
        <div style={{ marginBottom: 12 }}>
          <Sparkline snapshots={project.snapshots} color={color} />
        </div>
      )}

      {/* Bottom row — actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid var(--hairline)` }}>
        <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
          {project.last_run 
            ? t('projects.lastAnalysis', { date: new Date(project.last_run).toLocaleDateString(lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US') }) 
            : t('projects.neverAnalysed')}
        </span>
        <div style={{ display: 'flex', gap: 6, opacity: hovered ? 1 : 0, transition: 'opacity 0.12s ease' }}>
          <button
            onClick={onAnalyse}
            title={t('projects.analyseBtn')}
            className="btn btn-secondary btn-sm"
            style={{ height: 28, padding: '0 10px', fontSize: 12 }}
          >
            <Play size={12} /> {t('projects.analyseBtn')}
          </button>
          <button
            onClick={onDelete}
            title={t('common.delete')}
            className="btn btn-ghost btn-sm"
            style={{ height: 28, width: 28, padding: 0 }}
          >
            <Trash2 size={14} color={C.red} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface ProjectsPageProps {
  onOpenProject: (id: string) => void
  onNavigate?: (page: string, params?: any) => void
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ onOpenProject, onNavigate }) => {
  const { profile } = useAuth()
  const { t, lang } = useTranslation()
  const [projects, setProjects] = useState<ProjectWithHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectWithHealth | null>(null)
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null)
  const [driftLoading, setDriftLoading] = useState(false)
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

  const loadDriftReport = useCallback(async (projectId: string) => {
    setDriftLoading(true)
    try {
      const report = await fetchDriftReport(projectId)
      setDriftReport(report)
    } catch {
      setDriftReport(null)
    } finally {
      setDriftLoading(false)
    }
  }, [])

  const handleSelectProject = (project: ProjectWithHealth | null) => {
    setSelectedProject(project)
    if (project) {
      loadDriftReport(project.id)
    } else {
      setDriftReport(null)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm(t('projects.confirmDelete'))) {
      await deleteProject(id)
      setProjects((prev: ProjectWithHealth[]) => prev.filter((p: ProjectWithHealth) => p.id !== id))
      if (selectedProject?.id === id) setSelectedProject(null)
    }
  }

  const pluralSuffix = lang === 'de' ? (projects.length !== 1 ? 'e' : '') : (projects.length !== 1 ? 's' : '')

  return (
    <div style={{ padding: '32px 36px', height: '100%', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--canvas)' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .spin { animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite; }`}</style>

       {error && (
         <div style={{ 
           background: 'rgba(207, 45, 86, 0.08)', 
           border: '1px solid rgba(207, 45, 86, 0.18)', 
           borderRadius: '8px', 
           color: 'var(--semantic-error)', 
           fontSize: 14, 
           lineHeight: 1.5, 
           padding: '12px 16px', 
           marginBottom: 16 
         }}>
           {error}
         </div>
       )}
       {/* Header */}
       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4, fontSize: '26px', fontWeight: 400, letterSpacing: '-0.325px' }}>{t('projects.title')}</h1>
            <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>
              {t('projects.projectCount', { 
                count: String(projects.length), 
                plural: pluralSuffix 
              })}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> {t('projects.newProject')}
          </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-muted)', fontSize: 14, marginTop: 80, justifyContent: 'center' }}>
          <Loader2 size={16} className="spin" /> {t('common.loading')}
        </div>
      ) : projects.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 80 }}>
          <FolderOpen size={24} style={{ color: 'var(--ink-muted)' }} />
          <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>{t('projects.noProjects')}</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginRight: selectedProject ? 452 : 0,
          transition: 'margin-right 0.2s ease',
        }}>
          {projects.map((p: ProjectWithHealth) => (
            <ProjectCard
              key={p.id}
              project={p}
              selected={selectedProject?.id === p.id}
              onClick={() => handleSelectProject(selectedProject?.id === p.id ? null : p)}
              onDelete={(e: React.MouseEvent) => handleDelete(e, p.id)}
              onAnalyse={(e: React.MouseEvent) => { e.stopPropagation(); onOpenProject(p.id) }}
            />
          ))}

          {/* Add new card */}
          <button
            onClick={() => setShowModal(true)}
            className="card"
            style={{
              background: 'transparent', border: '1px dashed var(--hairline-strong)',
              padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 140,
            }}
          >
            <Plus size={24} color="var(--ink-muted)" />
            <span className="section-label">{t('projects.newProject')}</span>
          </button>
        </div>
      )}

      {/* Monitor Panel */}
      {selectedProject && (
        <>
          {/* Overlay para fechar */}
          <div
            onClick={() => setSelectedProject(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          />
          <MonitorPanel
            project={selectedProject}
            onClose={() => handleSelectProject(null)}
            onOpenAnalysis={() => { handleSelectProject(null); onOpenProject(selectedProject.id) }}
            driftReport={driftReport}
            driftLoading={driftLoading}
          />
        </>
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
