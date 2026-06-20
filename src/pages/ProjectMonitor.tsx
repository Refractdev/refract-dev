import React, { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Play, TrendingUp, TrendingDown, Minus,
  Clock, GitBranch, Copy, CopyCheck, Loader2, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getHealthSnapshots, getProject, updateProject } from '../lib/db'
import { fetchDriftReport, fetchProjectCommits, type DriftReport, type GitHubCommit } from '../lib/api'
import { isMockMode, MOCK_PROJECT, MOCK_SNAPSHOTS, MOCK_DRIFT_REPORT, MOCK_COMMITS, MOCK_LAST_SNAPSHOT, MOCK_PREV_SNAPSHOT } from '../lib/mockData'
import { HealthTrendChart } from '../components/HealthTrendChart'
import { CategoryCompareChart } from '../components/CategoryCompareChart'
import { DriftAlertsPanel } from '../components/DriftAlertsPanel'
import { ScoreRing } from '../components/ScoreRing'
import { useTranslation } from '../hooks/useTranslation'
import { getScoreColor, getScoreBg, getDelta, C } from '../lib/health'
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
  if (min < 60) return `${min}min ${lang === 'pt' || lang === 'es' ? 'atrás' : lang === 'fr' ? 'avant' : lang === 'de' ? 'her' : 'ago'}`
  if (hour < 24) return `${hour}h ${lang === 'pt' || lang === 'es' ? 'atrás' : lang === 'fr' ? 'avant' : lang === 'de' ? 'her' : 'ago'}`
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

interface StatCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: string
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, accent }) => (
  <div className="card p-5 flex flex-col justify-between min-h-[110px]" style={accent ? { background: accent } : undefined}>
    <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)', marginBottom: 8 }}>{label}</p>
    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 10 }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 6 }}>{sub}</div>}
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
  const { profile, session } = useAuth()
  const { t, lang } = useTranslation()
  const [mockMode, setMockMode] = useState(isMockMode())

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
  const [driftError, setDriftError] = useState<string | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const [copiedSha, setCopiedSha] = useState<string | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<number[]>([])
  const [thresholdValue, setThresholdValue] = useState<number>(60)
  const [thresholdSaved, setThresholdSaved] = useState(false)
  const thresholdRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const profileId = profile?.id
    if (mockMode) { /* handled inside load() */ }
    else if (!profileId || !projectId) return
    const userId = profileId as string

    let cancelled = false

    const load = async () => {
      if (mockMode) return

      let loadedRepo: string | null | undefined = initialProjectData?.repo

      if (!initialProjectData) {
        const [proj, snapData] = await Promise.all([
          getProject(projectId),
          getHealthSnapshots(projectId, userId),
        ])
        if (cancelled || !proj) return
        loadedRepo = proj.repo
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

      const repoUrl = loadedRepo ?? project?.repo
      const hasGitHubToken = Boolean(profile?.github_token || session?.provider_token)

      const [drift, commitData] = await Promise.all([
        fetchDriftReport(projectId).catch((err) => {
          if (!cancelled) {
            setDriftError(err instanceof Error ? err.message : t('projects.monitor.driftLoadError'))
          }
          return null
        }),
        hasGitHubToken && repoUrl
          ? fetchProjectCommits(repoUrl)
          : Promise.resolve([] as GitHubCommit[]),
      ])

      if (cancelled) return
      if (drift) {
        setDriftReport(drift)
        setDriftError(null)
      }
      setCommits(commitData)
      setDriftLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [projectId, profile?.id, profile?.github_token, session?.provider_token, loadKey])

  useEffect(() => {
    if (mockMode) return
    if (initialProjectData) {
      setProject(initialProjectData as Project)
      setSnapshots(initialProjectData.snapshots ?? [])
      setLastSnapshot(initialProjectData.lastSnapshot ?? undefined)
      setPrevSnapshot(initialProjectData.prevSnapshot ?? undefined)
    }
  }, [initialProjectData])

  // Sync threshold input when project loads
  useEffect(() => {
    if (project?.quality_gate_score !== undefined) {
      setThresholdValue(project.quality_gate_score ?? 60)
    }
  }, [project?.quality_gate_score])

  const handleSaveThreshold = async () => {
    if (!project) return
    const clamped = Math.max(0, Math.min(100, thresholdValue))
    try {
      await updateProject(project.id, { quality_gate_score: clamped })
      setProject((p) => p ? { ...p, quality_gate_score: clamped } : p)
      setThresholdSaved(true)
      setTimeout(() => setThresholdSaved(false), 2000)
    } catch (err) {
      console.error('[monitor] Failed to save threshold:', err)
    }
  }

  const score = lastSnapshot?.score ?? 0
  const delta = getDelta(lastSnapshot, prevSnapshot)
  const isMonitored = Boolean(project?.repo)

  const chartData = snapshots.length >= 2
    ? snapshots.map((s) => ({ date: s.timestamp, score: s.score }))
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
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--canvas)', overflow: 'hidden' }}>

      {/* ─── B1: Professional Header ─────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        height: 48,
        borderBottom: '1px solid var(--hairline)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--canvas)',
        gap: 16,
      }}>
        {/* Left: breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button
            onClick={onBack}
            className="btn btn-ghost btn-sm"
            style={{ gap: 4, padding: '4px 8px', flexShrink: 0 }}
          >
            <ArrowLeft size={14} />
            <span style={{ fontSize: 12 }}>{t('projects.monitor.projects')}</span>
          </button>
          <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>›</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </span>
          {project.branch && (
            <span style={{
              fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
              background: 'var(--hairline)', borderRadius: 4, padding: '2px 7px', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <GitBranch size={10} />
              {project.branch}
            </span>
          )}
          {/* Status pill */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 600, flexShrink: 0,
            color: isMonitored ? 'var(--semantic-success)' : 'var(--ink-muted)',
            background: isMonitored
              ? 'color-mix(in srgb, var(--semantic-success) 12%, transparent)'
              : 'var(--hairline)',
            borderRadius: 12, padding: '3px 9px',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isMonitored ? 'var(--semantic-success)' : 'var(--ink-muted)',
            }} />
            {isMonitored ? t('projects.monitor.monitoringActive') : t('projects.monitor.manualOnly')}
          </span>
        </div>

        {/* Right: gate threshold + last analysis + Run Analysis */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {isMonitored && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title={t('projects.monitor.qualityGateHint')}
            >
              <ShieldCheck size={12} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                {t('projects.monitor.qualityGateThreshold')}
              </span>
              <input
                ref={thresholdRef}
                type="number"
                min={0}
                max={100}
                value={thresholdValue}
                onChange={(e) => setThresholdValue(Number(e.target.value))}
                onBlur={handleSaveThreshold}
                onKeyDown={(e) => e.key === 'Enter' && thresholdRef.current?.blur()}
                style={{
                  width: 44, padding: '2px 6px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                  borderRadius: 4, color: 'var(--ink)', textAlign: 'center',
                }}
              />
              {thresholdSaved && (
                <span style={{ fontSize: 10, color: 'var(--semantic-success)' }}>
                  {t('projects.monitor.qualityGateSaved')}
                </span>
              )}
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            {project.last_run
              ? `${t('projects.monitor.lastAnalysisTitle')}: ${formatDate(project.last_run, lang)}`
              : t('projects.neverAnalysed')}
          </span>
          <button
            onClick={() => onOpenProject(project.id)}
            className="btn btn-primary btn-sm"
            style={{ gap: 6 }}
          >
            <Play size={11} />
            {t('projects.monitor.runAnalysis')}
          </button>
        </div>
      </div>

      {/* ─── Scrollable Body ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px, 3vw, 28px)' }}>

        {driftError && (
          <div className="mb-4 p-3.5 bg-[var(--semantic-error)]/10 border border-[var(--semantic-error)]/25 rounded-sm flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--semantic-error)] leading-relaxed">{driftError}</p>
            <button
              type="button"
              onClick={() => { setDriftError(null); setDriftLoading(true); setLoadKey((k) => k + 1) }}
              className="btn btn-secondary text-xs shrink-0"
            >
              {t('projects.monitor.retry')}
            </button>
          </div>
        )}

        {/* ─── B2: Hero Row ────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>

          {/* Health Score */}
          <StatCard
            label={t('projects.monitor.healthScore')}
            accent={snapshots.length > 0 ? getScoreBg(score) : undefined}
            value={<>
              <ScoreRing score={score} size={52} />
              <span style={{ color: getScoreColor(score) }}>
                {snapshots.length > 0 ? score : '—'}
              </span>
            </>}
            sub={snapshots.length > 0 ? `/ 100` : undefined}
          />

          {/* Score Delta */}
          <StatCard
            label={t('projects.monitor.scoreDelta')}
            accent={delta !== null
              ? delta >= 0
                ? 'color-mix(in srgb, var(--semantic-success) 8%, transparent)'
                : 'color-mix(in srgb, var(--semantic-error) 8%, transparent)'
              : undefined}
            value={delta !== null ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: delta >= 0 ? C.green : C.red }}>
                {delta > 0 ? <TrendingUp size={16} /> : delta < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                {delta > 0 ? '+' : ''}{delta}
              </span>
            ) : (
              <span style={{ color: 'var(--ink-muted)' }}>—</span>
            )}
            sub={delta !== null ? t('projects.monitor.vsPrev') : undefined}
          />

          {/* Total Analyses */}
          <StatCard
            label={t('projects.monitor.totalAnalyses')}
            value={<span style={{ color: 'var(--ink)' }}>{snapshots.length}</span>}
          />

          {/* Active Issues with H/M/L breakdown */}
          <StatCard
            label={t('projects.monitor.activeIssues')}
            value={lastSnapshot ? (
              <span style={{ color: lastSnapshot.issueCount > 0 ? C.red : C.green }}>
                {lastSnapshot.issueCount}
              </span>
            ) : (
              <span style={{ color: 'var(--ink-muted)' }}>—</span>
            )}
            sub={lastSnapshot && (lastSnapshot.high + lastSnapshot.medium + lastSnapshot.low) > 0
              ? t('projects.monitor.issueBreakdown')
                  .replace('{h}', String(lastSnapshot.high ?? 0))
                  .replace('{m}', String(lastSnapshot.medium ?? 0))
                  .replace('{l}', String(lastSnapshot.low ?? 0))
              : undefined}
          />
        </div>

        {/* ─── Section 3: Score Trend ──────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>
            {t('projects.monitor.scoreTrend')}
          </p>
          <div className="card" style={{ padding: '16px 12px', position: 'relative', height: 200 }}>
            <HealthTrendChart data={chartData ?? [{ date: '', score: 0 }, { date: '', score: 0 }]} height={200} />
            {snapshots.length < 2 && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'color-mix(in srgb, var(--canvas) 80%, transparent)', borderRadius: 10,
              }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 24px' }}>
                  <Clock size={18} color="var(--ink-muted)" />
                  <p style={{ fontSize: 12, color: 'var(--ink-muted)', textAlign: 'center' }}>
                    {t('projects.monitor.runAtLeast2')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Section 4: B3 Category Chart + Alerts ───────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 20, marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>
              {t('projects.monitor.issuesByCategory')}
            </p>
            <div className="card" style={{ padding: '12px 8px', height: 220 }}>
              {driftLoading ? (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={14} color="var(--ink-muted)" className="spin" />
                </div>
              ) : (driftReport && driftReport.trends.length > 0) ? (
                <CategoryCompareChart
                  trends={driftReport.trends}
                  prevLabel={t('projects.monitor.prevAvg')}
                  currentLabel={t('projects.monitor.currentLabel')}
                  height={220}
                />
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    {t('projects.monitor.noCategoryData')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>
              {t('projects.monitor.alerts')}
            </p>
            {driftLoading ? (
              <div className="card" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={14} color="var(--ink-muted)" className="spin" />
              </div>
            ) : driftReport ? (
              <DriftAlertsPanel
                report={{
                  ...driftReport,
                  alerts: driftReport.alerts.filter((_, i) => !dismissedAlerts.includes(i)),
                }}
                onDismiss={(visibleIdx) => {
                  let count = 0
                  for (let i = 0; i < driftReport.alerts.length; i++) {
                    if (!dismissedAlerts.includes(i)) {
                      if (count === visibleIdx) {
                        setDismissedAlerts((prev) => [...prev, i])
                        break
                      }
                      count++
                    }
                  }
                }}
              />
            ) : (
              <div className="card" style={{ padding: '16px 20px' }}>
                <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                  {t('projects.monitor.runForAlerts')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Section 5: B6 Three Columns — Category Trends, Anomalies, Hotspots ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 24 }}>
          <ColumnCard
            title={t('projects.monitor.categoryTrends')}
            loading={driftLoading}
            empty={!(driftReport && driftReport.trends.length > 0)}
            emptyMsg={t('projects.monitor.noTrendData')}
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
                    {t('projects.monitor.avg')} {Math.round(trend.averageCount)}
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
            title={t('projects.monitor.anomalies')}
            loading={driftLoading}
            empty={!(driftReport && driftReport.anomalies.length > 0)}
            emptyMsg={t('projects.monitor.noAnomalies')}
          >
            {driftReport?.anomalies?.map((anomaly, i) => {
              const severityLabel =
                anomaly.severity === 'critical' ? t('projects.monitor.critical')
                : anomaly.severity === 'warning' ? t('projects.monitor.warning')
                : t('projects.monitor.infoSeverity')
              return (
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
                    {severityLabel}
                  </span>
                </div>
              )
            })}
          </ColumnCard>

          <ColumnCard
            title={t('projects.monitor.decayHotspots')}
            loading={driftLoading}
            empty={!(driftReport && driftReport.decayHotspots.length > 0)}
            emptyMsg={t('projects.monitor.noDecayHotspots')}
          >
            {driftReport?.decayHotspots?.map((hotspot) => {
              const isCritical = hotspot.severity === 'critical'
              const color = isCritical ? C.red : C.yellow
              const severityLabel = isCritical ? t('projects.monitor.critical') : t('projects.monitor.warning')
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
                      {severityLabel}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hotspot.filePath}
                  </p>
                  <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                    +{hotspot.growthRate} {t('projectView.issuesPerScan')}
                  </span>
                </div>
              )
            })}
          </ColumnCard>
        </div>

        {/* ─── Section 6: B5 Commit History ────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              {t('projects.monitor.recentCommits')}
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
            <div className="card" style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={14} color="var(--ink-muted)" className="spin" />
            </div>
          ) : !project.repo ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {t('projects.monitor.connectGitHub')}
              </p>
            </div>
          ) : commits.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {t('projects.monitor.noCommitsHistory')}
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {commits.map((commit, i) => (
                <div
                  key={commit.sha}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 18px',
                    borderBottom: i < commits.length - 1 ? '1px solid var(--hairline)' : 'none',
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)',
                  }}>
                    {commit.author.charAt(0).toUpperCase()}
                  </div>
                  <button
                    onClick={() => handleCopySha(commit.sha)}
                    title={t('projects.monitor.copySha')}
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

// ─── Column Card ─────────────────────────────────────────────────────────────

const ColumnCard: React.FC<{
  title: string
  loading?: boolean
  empty: boolean
  emptyMsg: string
  children: React.ReactNode
}> = ({ title, loading, empty, emptyMsg, children }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>{title}</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {loading ? (
        <div className="card" style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={14} color="var(--ink-muted)" className="spin" />
        </div>
      ) : empty ? (
        <div className="card" style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{emptyMsg}</p>
        </div>
      ) : children}
    </div>
  </div>
)
