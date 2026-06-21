import React, { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Copy, CopyCheck } from 'lucide-react'
import { HEALTH_C as C } from '../shared/constants'
import type { DemoProject, HealthSnapshot, DriftReport, GitHubCommit } from '../shared/types'
import {
  DEMO_PROJECT,
  DEMO_SNAPSHOTS,
  DEMO_DRIFT_REPORT,
  DEMO_COMMITS,
  getScoreColor,
  getDelta,
  relativeDate,
  formatDate,
} from '../mock/demoData'
import { ScoreRing } from './charts/ScoreRing'
import { HealthTrendChart } from './charts/HealthTrendChart'
import { CategoryTrendChart } from './charts/CategoryTrendChart'
import { DriftAlertsPanel } from './charts/DriftAlertsPanel'

const StatCard: React.FC<{
  label: string
  value: React.ReactNode
  sub?: string
}> = ({ label, value, sub }) => (
  <div style={{
    background: 'var(--surface-card)', border: '1px solid var(--hairline)',
    borderRadius: 10, padding: '18px 20px', flex: 1, minWidth: 0,
  }}>
    <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 8, fontWeight: 500 }}>{label}</p>
    <p style={{
      fontSize: 22, fontWeight: 700, color: 'var(--ink)',
      fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 10,
    }}>{value}</p>
    {sub && <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{sub}</p>}
  </div>
)

const ColumnCard: React.FC<{
  title: string
  empty: boolean
  emptyMsg: string
  children: React.ReactNode
}> = ({ title, empty, emptyMsg, children }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>{title}</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {empty ? (
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

interface QualityDashboardEmbedProps {
  project?: DemoProject
  snapshots?: HealthSnapshot[]
  driftReport?: DriftReport
  commits?: GitHubCommit[]
  height?: number | string
}

export const QualityDashboardEmbed: React.FC<QualityDashboardEmbedProps> = ({
  project = DEMO_PROJECT,
  snapshots = DEMO_SNAPSHOTS,
  driftReport = DEMO_DRIFT_REPORT,
  commits = DEMO_COMMITS,
  height = 860,
}) => {
  const [copiedSha, setCopiedSha] = useState<string | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<number[]>([])

  const lastSnapshot = snapshots[snapshots.length - 1]
  const prevSnapshot = snapshots[snapshots.length - 2]
  const score = lastSnapshot?.score ?? 0
  const delta = getDelta(lastSnapshot, prevSnapshot)

  const chartData = snapshots.length >= 2
    ? snapshots.map(s => ({ date: s.timestamp, score: s.score }))
    : null

  const categoryChartData = driftReport.trends.length > 0
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

  const handleCopySha = async (sha: string) => {
    try {
      await navigator.clipboard.writeText(sha)
      setCopiedSha(sha)
      setTimeout(() => setCopiedSha(null), 2000)
    } catch { /* clipboard unavailable in some iframe contexts */ }
  }

  return (
    <div style={{
      height,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--canvas)',
      overflow: 'hidden',
      border: '1px solid var(--hairline)',
      borderRadius: 12,
    }}>
      {/* Compact header — no back / run analysis */}
      <div style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--hairline)',
        padding: '14px 28px',
        background: 'var(--canvas)',
      }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', margin: 0 }}>{project.name}</p>
        <p style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
          {project.repo} · Last analysis: {formatDate(project.last_run)}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px, 4vw, 32px)' }}>
        {/* Hero stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard
            label="Health Score"
            value={<>
              <ScoreRing score={score} size={56} />
              <span style={{ color: getScoreColor(score) }}>{score}</span>
            </>}
          />
          <StatCard
            label="Score Delta"
            value={delta !== null ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: delta >= 0 ? C.green : C.red }}>
                {delta > 0 ? <TrendingUp size={16} /> : delta < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                {delta > 0 ? '+' : ''}{delta}
              </span>
            ) : <span style={{ color: 'var(--ink-muted)' }}>—</span>}
          />
          <StatCard label="Total Analyses" value={<span>{snapshots.length}</span>} />
          <StatCard
            label="Active Issues"
            value={<span style={{ color: lastSnapshot && lastSnapshot.issueCount > 0 ? C.red : C.green }}>
              {lastSnapshot?.issueCount ?? '—'}
            </span>}
          />
        </div>

        {/* Health trend */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Health Score Trend</p>
          <div style={{
            background: 'var(--surface-card)', border: '1px solid var(--hairline)',
            borderRadius: 10, padding: '16px 12px', height: 200,
          }}>
            <HealthTrendChart data={chartData ?? [{ date: '', score: 0 }, { date: '', score: 0 }]} height={200} />
          </div>
        </div>

        {/* Category chart + alerts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 20, marginBottom: 28 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Issues by Category</p>
            <div style={{
              background: 'var(--surface-card)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: '12px 8px', height: 200,
            }}>
              {categoryChartData && <CategoryTrendChart data={categoryChartData} height={200} />}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Alerts</p>
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
                      setDismissedAlerts(prev => [...prev, i])
                      break
                    }
                    count++
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Three columns: trends, anomalies, hotspots */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 28 }}>
          <ColumnCard title="Category Trends" empty={driftReport.trends.length === 0} emptyMsg="No trend data yet.">
            {driftReport.trends.map(trend => {
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
                    avg {Math.round(trend.averageCount)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}15`, borderRadius: 4, padding: '1px 6px' }}>
                    {trend.currentCount}
                  </span>
                </div>
              )
            })}
          </ColumnCard>

          <ColumnCard title="Anomalies" empty={driftReport.anomalies.length === 0} emptyMsg="No anomalies detected.">
            {driftReport.anomalies.map((anomaly, i) => (
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
              </div>
            ))}
          </ColumnCard>

          <ColumnCard title="Decay Hotspots" empty={driftReport.decayHotspots.length === 0} emptyMsg="No decay hotspots detected.">
            {driftReport.decayHotspots.map(hotspot => {
              const color = hotspot.severity === 'critical' ? C.red : C.yellow
              return (
                <div key={hotspot.filePath} style={{
                  background: `${color}08`, border: `1px solid ${color}22`,
                  borderRadius: 6, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                      {hotspot.fileName}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}15`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                      {hotspot.severity === 'critical' ? 'Critical' : 'Warning'}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hotspot.filePath}
                  </p>
                  <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                    +{hotspot.growthRate} issues/scan
                  </span>
                </div>
              )
            })}
          </ColumnCard>
        </div>

        {/* Commits */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Recent Commits</p>
            <span style={{
              fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
              background: 'var(--hairline)', borderRadius: 3, padding: '1px 6px',
            }}>
              {project.branch}
            </span>
          </div>
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
                  title="Copy SHA"
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
                  {relativeDate(commit.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
