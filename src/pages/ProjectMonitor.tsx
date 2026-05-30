import React, { useState, useEffect } from 'react'
import {
  ArrowLeft, Play, TrendingUp, TrendingDown, Minus,
  Clock, GitBranch, Copy, CopyCheck, Loader2,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getHealthSnapshots, getProject } from '../lib/db'
import { fetchDriftReport, fetchProjectCommits, type DriftReport, type GitHubCommit } from '../lib/api'
import { isMockMode, MOCK_PROJECT, MOCK_SNAPSHOTS, MOCK_DRIFT_REPORT, MOCK_COMMITS, MOCK_LAST_SNAPSHOT, MOCK_PREV_SNAPSHOT } from '../lib/mockData'
import { HealthTrendChart } from '../components/HealthTrendChart'
import { CategoryTrendChart } from '../components/CategoryTrendChart'
import { DriftAlertsPanel } from '../components/DriftAlertsPanel'
import { ScoreRing } from '../components/ScoreRing'
import { useTranslation } from '../hooks/useTranslation'
import { getScoreColor, getDelta, C } from '../lib/health'
import type { HealthSnapshot } from '../lib/health'
import type { Project } from '../shared/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeDate(dateStr: string, lang: string): string {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = now - d
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hour = Math.floor(min / 60)
  const day = Math.floor(hour / 24)
  const week = Math.floor(day / 7)

  if (sec < 60) return lang === 'pt' ? 'agora' : lang === 'es' ? 'ahora' : lang === 'fr' ? "à l'instant" : lang === 'de' ? 'gerade' : 'just now'
  if (min < 60) return `${min}${lang === 'pt' ? 'min' : lang === 'es' ? 'min' : lang === 'fr' ? 'min' : lang === 'de' ? 'Min' : 'min'} ${lang === 'pt' ? 'atrás' : lang === 'es' ? 'atrás' : lang === 'fr' ? 'avant' : lang === 'de' ? 'her' : 'ago'}`
  if (hour < 24) return `${hour}${lang === 'pt' ? 'h' : lang === 'es' ? 'h' : lang === 'fr' ? 'h' : lang === 'de' ? 'Std' : 'h'} ${lang === 'pt' ? 'atrás' : lang === 'es' ? 'atrás' : lang === 'fr' ? 'avant' : lang === 'de' ? 'her' : 'ago'}`
  if (day < 7) return `${day} ${lang === 'pt' ? 'dias atrás' : lang === 'es' ? 'días atrás' : lang === 'fr' ? 'jours avant' : lang === 'de' ? 'Tage her' : 'days ago'}`
  return `${week} ${lang === 'pt' ? 'semanas atrás' : lang === 'es' ? 'semanas atrás' : lang === 'fr' ? 'semaines avant' : lang === 'de' ? 'Wochen her' : 'weeks ago'}`
}

function formatDate(dateStr: string | null | undefined, lang: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(
    lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US'
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string
  value: React.ReactNode
  sub?: string
  color?: string
}> = ({ label, value, sub, color }) => (
  <div style={{
    background: 'var(--surface-card)', border: '1px solid var(--hairline)',
    borderRadius: 10, padding: '18px 20px', flex: 1, minWidth: 0,
  }}>
    <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 8, fontWeight: 500 }}>{label}</p>
    <p style={{
      fontSize: 22, fontWeight: 700, color: color ?? 'var(--ink)',
      fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 10,
    }}>{value}</p>
    {sub && <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{sub}</p>}
  </div>
)

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  onBack: () => void
  onOpenProject: (id: string) => void
  initialProjectData?: any
}

export const ProjectMonitor: React.FC<Props> = ({ projectId, onBack, onOpenProject, initialProjectData }) => {
  const { profile } = useAuth()
  const { t, lang } = useTranslation()
  const [mockMode, setMockMode] = useState(isMockMode())

  // Update mockMode when URL changes
  useEffect(() => {
    setMockMode(isMockMode())
  }, [window.location.search])

  const init = mockMode ? MOCK_PROJECT : (initialProjectData ?? {})

  const [project, setProject] = useState<Project | null>(init as Project)
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>(
    mockMode ? MOCK_SNAPSHOTS : (initialProjectData?.snapshots ?? [])
  )
  const [lastSnapshot, setLastSnapshot] = useState<HealthSnapshot | undefined>(
    mockMode ? MOCK_LAST_SNAPSHOT : (initialProjectData?.lastSnapshot ?? undefined)
  )
  const [prevSnapshot, setPrevSnapshot] = useState<HealthSnapshot | undefined>(
    mockMode ? MOCK_PREV_SNAPSHOT : (initialProjectData?.prevSnapshot ?? undefined)
  )
  const [driftReport, setDriftReport] = useState<DriftReport | null>(mockMode ? MOCK_DRIFT_REPORT : null)
  const [commits, setCommits] = useState<GitHubCommit[]>(mockMode ? MOCK_COMMITS : [])
  const [driftLoading, setDriftLoading] = useState(!mockMode)
  const [copiedSha, setCopiedSha] = useState<string | null>(null)

   useEffect(() => {
     const profileId = profile?.id
     if (mockMode) { /* handled inside load() */ }
     else if (!profileId || !projectId) return
     const userId = profileId as string

     let cancelled = false

     const load = async () => {
       if (mockMode) return

      if (!initialProjectData) {
        const [proj, snapData] = await Promise.all([
          getProject(projectId),
          getHealthSnapshots(projectId, userId),
        ])
        if (cancelled || !proj) return
        setProject(proj)
        const fromDb = (snapData ?? []) as any[]
        const last = fromDb.length > 0 ? fromDb[0] : null
        const prev = fromDb.length > 1 ? fromDb[1] : null
        const mapped: HealthSnapshot[] = fromDb.slice().reverse().map((s: any) => ({
          score: s.score, timestamp: s.timestamp, issueCount: s.issue_count,
          high: s.high, medium: s.medium, low: s.low,
        }))
        setSnapshots(mapped)
        setLastSnapshot(last ? { score: last.score, timestamp: last.timestamp, issueCount: last.issue_count, high: last.high, medium: last.medium, low: last.low } : undefined)
        setPrevSnapshot(prev ? { score: prev.score, timestamp: prev.timestamp, issueCount: prev.issue_count, high: prev.high, medium: prev.medium, low: prev.low } : undefined)
      }

      if (cancelled) return

      const [drift, commitData] = await Promise.all([
        fetchDriftReport(projectId).catch(() => null),
        fetchProjectCommits(initialProjectData?.repo ?? project?.repo),
      ])

      if (cancelled) return
      if (drift) setDriftReport(drift)
      setCommits(commitData)
      setDriftLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [projectId, profile?.id])

  useEffect(() => {
    if (initialProjectData) {
      setProject(initialProjectData as Project)
      setSnapshots(initialProjectData.snapshots ?? [])
      setLastSnapshot(initialProjectData.lastSnapshot ?? undefined)
      setPrevSnapshot(initialProjectData.prevSnapshot ?? undefined)
    }
  }, [initialProjectData])

  const score = lastSnapshot?.score ?? 0
  const delta = getDelta(lastSnapshot, prevSnapshot)

  const chartData = snapshots.length >= 2
    ? snapshots.map((s) => ({ date: s.timestamp, score: s.score }))
    : null

  const categoryChartData = driftReport && driftReport.trends.length > 0
    ? [
        {
          date: lang === 'pt' ? 'Média ant.' : lang === 'es' ? 'Media ant.' : lang === 'fr' ? 'Moyenne préc.' : lang === 'de' ? 'Vorheriger Ø' : 'Previous avg',
          ...Object.fromEntries(driftReport.trends.map(t => [t.category, Math.round(t.averageCount)])),
        },
        {
          date: lang === 'pt' ? 'Atual' : lang === 'es' ? 'Actual' : lang === 'fr' ? 'Actuel' : lang === 'de' ? 'Aktuell' : 'Current',
          ...Object.fromEntries(driftReport.trends.map(t => [t.category, t.currentCount])),
        },
      ]
    : null

  const handleCopySha = async (sha: string) => {
    try {
      await navigator.clipboard.writeText(sha)
      setCopiedSha(sha)
      setTimeout(() => setCopiedSha(null), 2000)
    } catch {}
  }

  if (!project) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Loader2 size={16} className="spin" style={{ color: 'var(--ink-muted)' }} />
          <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>{t('common.loading')}</span>
        </div>
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--canvas)', overflow: 'hidden' }}>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ─── Section 1: Fixed Header ───────────────────────────────────── */}
      <div style={{
        flexShrink: 0, borderBottom: '1px solid var(--hairline)',
        padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--canvas)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              color: 'var(--ink-muted)', fontSize: 13, padding: '4px 0',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-muted)'}
          >
            <ArrowLeft size={15} />
            {lang === 'pt' ? 'Projetos' : lang === 'es' ? 'Proyectos' : lang === 'fr' ? 'Projets' : lang === 'de' ? 'Projekte' : 'Projects'}
          </button>
          <div style={{ width: 1, height: 24, background: 'var(--hairline)' }} />
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{project.name}</p>
            <p style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
              {project.repo || project.path}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            {project.last_run
              ? `${lang === 'pt' ? 'Última análise' : lang === 'es' ? 'Último análisis' : lang === 'fr' ? 'Dernière analyse' : lang === 'de' ? 'Letzte Analyse' : 'Last analysis'}: ${formatDate(project.last_run, lang)}`
              : (lang === 'pt' ? 'Nunca analisado' : lang === 'es' ? 'Nunca analizado' : lang === 'fr' ? 'Jamais analysé' : lang === 'de' ? 'Nie analysiert' : 'Never analysed')}
          </span>
          <button
            onClick={() => onOpenProject(project.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
              background: 'var(--ink)', color: 'var(--canvas)', border: 'none', borderRadius: 6,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Play size={12} />
            {lang === 'pt' ? 'Analisar' : lang === 'es' ? 'Analizar' : lang === 'fr' ? 'Analyser' : lang === 'de' ? 'Analysieren' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* ─── Scrollable Body ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

        {/* ─── Section 2: Hero Row ──────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
          <StatCard
            label={lang === 'pt' ? 'Pontuação de Saúde' : lang === 'es' ? 'Puntuación de Salud' : lang === 'fr' ? 'Score de Santé' : lang === 'de' ? 'Gesundheitswert' : 'Health Score'}
            value={<>
              <ScoreRing score={score} size={56} />
              <span style={{ color: getScoreColor(score) }}>
                {snapshots.length > 0 ? score : '—'}
              </span>
            </>}
          />
          <StatCard
            label={lang === 'pt' ? 'Variação' : lang === 'es' ? 'Variación' : lang === 'fr' ? 'Variation' : lang === 'de' ? 'Änderung' : 'Score Delta'}
            value={delta !== null ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: delta >= 0 ? C.green : C.red }}>
                {delta > 0 ? <TrendingUp size={16} /> : delta < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                {delta > 0 ? '+' : ''}{delta}
              </span>
            ) : (
              <span style={{ color: 'var(--ink-muted)' }}>—</span>
            )}
          />
          <StatCard
            label={lang === 'pt' ? 'Total de Análises' : lang === 'es' ? 'Total de Análisis' : lang === 'fr' ? 'Analyses Totales' : lang === 'de' ? 'Analysen Gesamt' : 'Total Analyses'}
            value={<span style={{ color: 'var(--ink)' }}>{snapshots.length}</span>}
          />
          <StatCard
            label={lang === 'pt' ? 'Problemas Ativos' : lang === 'es' ? 'Problemas Activos' : lang === 'fr' ? 'Problèmes Actifs' : lang === 'de' ? 'Aktive Probleme' : 'Active Issues'}
            value={lastSnapshot ? (
              <span style={{ color: lastSnapshot.issueCount > 0 ? C.red : C.green }}>
                {lastSnapshot.issueCount}
              </span>
            ) : (
              <span style={{ color: 'var(--ink-muted)' }}>—</span>
            )}
          />
        </div>

        {/* ─── Section 3: Health Score Trend ──────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>
            {t('projects.monitor.scoreTrend')}
          </p>
          <div style={{
            background: 'var(--surface-card)', border: '1px solid var(--hairline)',
            borderRadius: 10, padding: '16px 12px', position: 'relative', height: 200,
          }}>
            <HealthTrendChart data={chartData ?? [{ date: '', score: 0 }, { date: '', score: 0 }]} height={200} />
            {snapshots.length < 2 && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)', borderRadius: 10,
              }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '16px 24px', borderRadius: 8,
                  background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                }}>
                  <Clock size={18} color="var(--ink-muted)" />
                  <p style={{ fontSize: 12, color: 'var(--ink-muted)', textAlign: 'center' }}>
                    {lang === 'pt' ? 'Execute pelo menos 2 análises para ver tendências'
                    : lang === 'es' ? 'Ejecuta al menos 2 análisis para ver tendencias'
                    : lang === 'fr' ? 'Exécutez au moins 2 analyses pour voir les tendances'
                    : lang === 'de' ? 'Führen Sie mindestens 2 Analysen durch, um Trends zu sehen'
                    : 'Run at least 2 analyses to unlock trend data'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Section 4: Two Columns ─────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
          <div style={{ flex: '0 0 60%', minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>
              {lang === 'pt' ? 'Problemas por Categoria'
              : lang === 'es' ? 'Problemas por categoría'
              : lang === 'fr' ? 'Problèmes par catégorie'
              : lang === 'de' ? 'Probleme nach Kategorie'
              : 'Issues by Category'}
            </p>
            <div style={{
              background: 'var(--surface-card)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: '12px 8px', height: 200,
            }}>
              {driftLoading ? (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={14} color="var(--ink-muted)" className="spin" />
                </div>
              ) : categoryChartData ? (
                <CategoryTrendChart data={categoryChartData} height={200} />
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    {lang === 'pt' ? 'Nenhum dado de categoria ainda'
                    : lang === 'es' ? 'Sin datos de categoría aún'
                    : lang === 'fr' ? 'Pas encore de données de catégorie'
                    : lang === 'de' ? 'Noch keine Kategoriedaten'
                    : 'No category data yet'}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>
              {lang === 'pt' ? 'Alertas' : lang === 'es' ? 'Alertas' : lang === 'fr' ? 'Alertes' : lang === 'de' ? 'Warnungen' : 'Alerts'}
            </p>
            {driftLoading ? (
              <div style={{
                background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                borderRadius: 10, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Loader2 size={14} color="var(--ink-muted)" className="spin" />
              </div>
            ) : driftReport ? (
              <DriftAlertsPanel report={driftReport} />
            ) : (
              <div style={{
                background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                borderRadius: 10, padding: '16px 20px',
              }}>
                <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                  {lang === 'pt' ? 'Execute uma análise para gerar alertas'
                  : lang === 'es' ? 'Ejecuta un análisis para generar alertas'
                  : lang === 'fr' ? 'Exécutez une analyse pour générer des alertes'
                  : lang === 'de' ? 'Führen Sie eine Analyse durch, um Warnungen zu generieren'
                  : 'Run an analysis to generate alerts'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Section 5: Three Columns ─────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
          <ColumnCard
            title={lang === 'pt' ? 'Tendências por Categoria'
              : lang === 'es' ? 'Tendencias por categoría'
              : lang === 'fr' ? 'Tendances par catégorie'
              : lang === 'de' ? 'Kategorie-Trends'
              : 'Category Trends'}
            loading={driftLoading}
            empty={!(driftReport && driftReport.trends.length > 0)}
            emptyMsg={lang === 'pt' ? 'Nenhum dado de tendência ainda. Tendências aparecem após 2+ análises.'
              : lang === 'es' ? 'Aún no hay datos de tendencia. Las tendencias aparecen después de 2+ análisis.'
              : lang === 'fr' ? 'Pas encore de données de tendance. Les tendances apparaissent après 2+ analyses.'
              : lang === 'de' ? 'Noch keine Trenddaten. Trends erscheinen nach 2+ Analysen.'
              : 'No trend data yet. Trends appear after 2+ analyses.'}
          >
            {driftReport?.trends?.map((trend) => {
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
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trend.category}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                    {lang === 'pt' ? 'média' : lang === 'es' ? 'media' : lang === 'fr' ? 'moyenne' : lang === 'de' ? 'Mittelwert' : 'avg'} {Math.round(trend.averageCount)}
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
          </ColumnCard>

          <ColumnCard
            title={lang === 'pt' ? 'Anomalias'
              : lang === 'es' ? 'Anomalías'
              : lang === 'fr' ? 'Anomalies'
              : lang === 'de' ? 'Anomalien'
              : 'Anomalies'}
            loading={driftLoading}
            empty={!(driftReport && driftReport.anomalies.length > 0)}
            emptyMsg={lang === 'pt' ? 'Nenhuma anomalia detetada.'
              : lang === 'es' ? 'No se detectaron anomalías.'
              : lang === 'fr' ? 'Aucune anomalie détectée.'
              : lang === 'de' ? 'Keine Anomalien erkannt.'
              : 'No anomalies detected.'}
          >
            {driftReport?.anomalies?.map((anomaly, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                borderRadius: 6, padding: '8px 10px',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  color: anomaly.type === 'spike' ? C.red : C.green,
                  background: anomaly.type === 'spike' ? `${C.red}15` : `${C.green}15`,
                  borderRadius: 3, padding: '1px 5px', flexShrink: 0,
                }}>
                  {anomaly.type}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {anomaly.category}
                </span>
                <span style={{ fontSize: 10, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                  {anomaly.deviationPercent > 0 ? '+' : ''}{Math.round(anomaly.deviationPercent)}%
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  color: anomaly.severity === 'critical' ? C.red : anomaly.severity === 'warning' ? C.yellow : 'var(--ink-muted)',
                  background: anomaly.severity === 'critical' ? `${C.red}15` : anomaly.severity === 'warning' ? `${C.yellow}15` : 'var(--hairline)',
                  borderRadius: 3, padding: '1px 5px',
                }}>
                  {anomaly.severity === 'critical'
                    ? (lang === 'pt' ? 'Crítico' : lang === 'es' ? 'Crítico' : lang === 'fr' ? 'Critique' : lang === 'de' ? 'Kritisch' : 'Critical')
                    : anomaly.severity === 'warning'
                    ? (lang === 'pt' ? 'Aviso' : lang === 'es' ? 'Advertencia' : lang === 'fr' ? 'Avertissement' : lang === 'de' ? 'Warnung' : 'Warning')
                    : (lang === 'pt' ? 'Info' : lang === 'es' ? 'Info' : lang === 'fr' ? 'Info' : lang === 'de' ? 'Info' : 'Info')}
                </span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard
            title={lang === 'pt' ? 'Pontos Críticos'
              : lang === 'es' ? 'Puntos críticos'
              : lang === 'fr' ? 'Points chauds'
              : lang === 'de' ? 'Hotspots'
              : 'Decay Hotspots'}
            loading={driftLoading}
            empty={!(driftReport && driftReport.decayHotspots.length > 0)}
            emptyMsg={lang === 'pt' ? 'Nenhum ponto crítico detetado.'
              : lang === 'es' ? 'No se detectaron puntos críticos.'
              : lang === 'fr' ? 'Aucun point chaud détecté.'
              : lang === 'de' ? 'Keine Hotspots erkannt.'
              : 'No decay hotspots detected.'}
          >
            {driftReport?.decayHotspots?.map((hotspot) => {
              const isCritical = hotspot.severity === 'critical'
              const color = isCritical ? C.red : C.yellow
              return (
                <div key={hotspot.filePath} style={{
                  background: `${color}08`, border: `1px solid ${color}22`,
                  borderRadius: 6, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                      {hotspot.fileName}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color,
                      background: `${color}15`, borderRadius: 4, padding: '1px 6px', flexShrink: 0,
                    }}>
                      {isCritical
                        ? (lang === 'pt' ? 'Crítico' : lang === 'es' ? 'Crítico' : lang === 'fr' ? 'Critique' : lang === 'de' ? 'Kritisch' : 'Critical')
                        : (lang === 'pt' ? 'Aviso' : lang === 'es' ? 'Advertencia' : lang === 'fr' ? 'Avertissement' : lang === 'de' ? 'Warnung' : 'Warning')}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hotspot.filePath}
                  </p>
                  <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                    +{hotspot.growthRate} {lang === 'pt' ? 'problemas/análise' : lang === 'es' ? 'problemas/análisis' : lang === 'fr' ? 'problèmes/analyse' : lang === 'de' ? 'Probleme/Scan' : 'issues/scan'}
                  </span>
                </div>
              )
            })}
          </ColumnCard>
        </div>

        {/* ─── Section 6: Commit History ─────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              {lang === 'pt' ? 'Histórico de Commits' : lang === 'es' ? 'Historial de Commits' : lang === 'fr' ? 'Historique des Commits' : lang === 'de' ? 'Commit-Verlauf' : 'Commit History'}
            </p>
            {project.branch && (
              <span style={{
                fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
                background: 'var(--hairline)', borderRadius: 3, padding: '1px 6px',
              }}>
                {project.branch}
              </span>
            )}
          </div>

          {driftLoading && commits.length === 0 ? (
            <div style={{
              background: 'var(--surface-card)', border: '1px solid var(--hairline)',
              borderRadius: 10, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader2 size={14} color="var(--ink-muted)" className="spin" />
            </div>
          ) : !project.repo ? (
            <div style={{
              background: 'var(--surface-card)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: '24px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {lang === 'pt' ? 'Conecte um repositório GitHub para ver o histórico de commits.'
                : lang === 'es' ? 'Conecta un repositorio de GitHub para ver el historial de commits.'
                : lang === 'fr' ? "Connectez un dépôt GitHub pour voir l'historique des commits."
                : lang === 'de' ? 'Verbinden Sie ein GitHub-Repository, um den Commit-Verlauf zu sehen.'
                : 'Connect a GitHub repository to see commit history.'}
              </p>
            </div>
          ) : commits.length === 0 ? (
            <div style={{
              background: 'var(--surface-card)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: '24px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {lang === 'pt' ? 'Nenhum histórico de commits disponível. Certifique-se de que o repositório está conectado via GitHub.'
                : lang === 'es' ? 'No hay historial de commits disponible. Asegúrate de que el repositorio esté conectado a través de GitHub.'
                : lang === 'fr' ? "Aucun historique de commits disponible. Assurez-vous que le dépôt est connecté via GitHub."
                : lang === 'de' ? 'Kein Commit-Verlauf verfügbar. Stellen Sie sicher, dass das Repository über GitHub verbunden ist.'
                : 'No commit history available. Make sure the repo is connected via GitHub.'}
              </p>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface-card)', border: '1px solid var(--hairline)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              {commits.map((commit, i) => (
                <div
                  key={commit.sha}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 18px',
                    borderBottom: i < commits.length - 1 ? '1px solid var(--hairline)' : 'none',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)',
                  }}>
                    {commit.author.charAt(0).toUpperCase()}
                  </div>
                  <button
                    onClick={() => handleCopySha(commit.sha)}
                    title={lang === 'pt' ? 'Copiar SHA' : lang === 'es' ? 'Copiar SHA' : lang === 'fr' ? 'Copier SHA' : lang === 'de' ? 'SHA kopieren' : 'Copy SHA'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', padding: 0, flexShrink: 0,
                    }}
                  >
                    {commit.sha.substring(0, 7)}
                    {copiedSha === commit.sha
                      ? <CopyCheck size={10} color="var(--semantic-success)" />
                      : <Copy size={10} />}
                  </button>
                  <span style={{
                    flex: 1, fontSize: 12, color: 'var(--ink)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {commit.message.length > 80 ? `${commit.message.substring(0, 80)}…` : commit.message}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {commit.author}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {relativeDate(commit.date, lang)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Column Card (reusable section wrapper) ──────────────────────────────────

const ColumnCard: React.FC<{
  title: string
  loading?: boolean
  empty: boolean
  emptyMsg: string
  children: React.ReactNode
}> = ({ title, loading, empty, emptyMsg, children }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>{title}</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {loading ? (
        <div style={{
          background: 'var(--surface-card)', border: '1px solid var(--hairline)',
          borderRadius: 6, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Loader2 size={14} color="var(--ink-muted)" className="spin" />
        </div>
      ) : empty ? (
        <div style={{
          background: 'var(--surface-card)', border: '1px solid var(--hairline)',
          borderRadius: 6, padding: '14px 16px',
        }}>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{emptyMsg}</p>
        </div>
      ) : children}
    </div>
  </div>
)
