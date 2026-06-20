import React, { useEffect, useState } from 'react'
import { Loader2, AlertCircle, ExternalLink, ShieldCheck } from 'lucide-react'
import { ScoreRing } from '../components/ScoreRing'
import { getScoreColor, getScoreBg, C } from '../lib/health'

interface AuditData {
  slug: string
  project_name: string
  score: number
  issue_count: number
  high: number
  medium: number
  low: number
  scanned_files: number
  category_counts: Record<string, number>
  top_issues: Array<{
    category: string
    problem: string
    filePath: string
    impact: string
  }>
  created_at: string
}

interface Props {
  slug: string
}

const IMPACT_COLOR: Record<string, string> = {
  High:   'var(--semantic-error)',
  Medium: 'var(--timeline-done)',
  Low:    'var(--ink-muted)',
}

export const PublicAuditPage: React.FC<Props> = ({ slug }) => {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/audit?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((d) => { setData(d); setLoading(false) })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [slug])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)' }}>
        <Loader2 size={20} className="spin" style={{ color: 'var(--ink-muted)' }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', flexDirection: 'column', gap: 12 }}>
        <AlertCircle size={24} style={{ color: 'var(--semantic-error)' }} />
        <p style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600 }}>Audit not found</p>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{error ?? 'This audit link may have been removed.'}</p>
        <a
          href="/"
          style={{ fontSize: 12, color: 'var(--ink-muted)', textDecoration: 'underline', marginTop: 8 }}
        >
          Go to Refract →
        </a>
      </div>
    )
  }

  const topCategories = Object.entries(data.category_counts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const maxCount = topCategories.length > 0 ? topCategories[0][1] : 1

  const auditDate = new Date(data.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--canvas)', display: 'flex', flexDirection: 'column' }}>

      {/* ─── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: '1px solid var(--hairline)', padding: '0 24px', height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--canvas)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={16} style={{ color: 'var(--ink-muted)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Refract</span>
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>· Code Audit Report</span>
        </div>
        <a
          href="/"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
            color: 'var(--ink-muted)', textDecoration: 'none',
          }}
        >
          <ExternalLink size={11} />
          Try Refract free
        </a>
      </div>

      {/* ─── Content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, maxWidth: 760, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 24px)', width: '100%' }}>

        {/* Project name + date */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            {data.project_name}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            Code quality audit · {auditDate} · {data.scanned_files} files scanned
          </p>
        </div>

        {/* ─── Hero: score + breakdown ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, marginBottom: 32, alignItems: 'center' }}>
          <div className="card" style={{ padding: '24px 28px', background: getScoreBg(data.score), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 140 }}>
            <ScoreRing score={data.score} size={72} />
            <p style={{ fontSize: 28, fontWeight: 800, color: getScoreColor(data.score), fontFamily: 'var(--font-mono)', letterSpacing: '-0.04em' }}>
              {data.score}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-muted)' }}>/100</span>
            </p>
            <p style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health Score</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ padding: '14px 18px' }}>
              <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6, fontWeight: 500 }}>Total Issues</p>
              <p style={{ fontSize: 26, fontWeight: 700, color: data.issue_count > 0 ? C.red : C.green, fontFamily: 'var(--font-mono)' }}>
                {data.issue_count}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { label: 'High', count: data.high, color: C.red },
                { label: 'Medium', count: data.medium, color: C.yellow },
                { label: 'Low', count: data.low, color: C.muted },
              ].map(({ label, count, color }) => (
                <div key={label} className="card" style={{ padding: '10px 14px', background: `${color}08`, border: `1px solid ${color}22` }}>
                  <p style={{ fontSize: 10, color: 'var(--ink-muted)', marginBottom: 3, fontWeight: 500 }}>{label}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Category breakdown ──────────────────────────────────────── */}
        {topCategories.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>Issues by Category</p>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topCategories.map(([cat, count]) => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--font-mono)', width: 180, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cat}
                    </span>
                    <div style={{ flex: 1, height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.round((count / maxCount) * 100)}%`,
                        background: 'var(--semantic-error)',
                        borderRadius: 3,
                        opacity: 0.7,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-mono)', width: 28, textAlign: 'right', flexShrink: 0 }}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Top issues ──────────────────────────────────────────────── */}
        {data.top_issues && data.top_issues.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>
              Top Issues ({data.top_issues.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.top_issues.map((issue, i) => {
                const color = IMPACT_COLOR[issue.impact] ?? C.muted
                return (
                  <div key={i} className="card" style={{ padding: '12px 16px', borderLeft: `3px solid ${color}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color,
                        background: `${color}15`, borderRadius: 3, padding: '1px 6px',
                      }}>
                        {issue.impact}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                        {issue.category}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 4 }}>
                      {issue.problem}
                    </p>
                    {issue.filePath && (
                      <p style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                        {issue.filePath}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--hairline)', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--canvas)', flexShrink: 0,
      }}>
        <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          Powered by{' '}
          <a href="/" style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>Refract</a>
          {' '}— AI code quality analysis
        </p>
        <a
          href="/"
          className="btn btn-primary btn-sm"
          style={{ fontSize: 11, gap: 5 }}
        >
          Analyse your codebase →
        </a>
      </div>
    </div>
  )
}
