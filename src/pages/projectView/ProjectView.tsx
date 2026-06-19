import React, { useState, useEffect, useRef } from 'react'
import {
  GitBranch, Play, Layout, Code2, ZapOff, Loader2,
  FileText, ChevronLeft, ChevronRight, Check, X,
  CheckCircle2, ArrowLeft, Download, Folder, CheckCheck,
  File as FileIcon, Sparkles,
  Terminal, Zap, Tag, RefreshCw, Layers, Globe, Shield, Activity, Copy, AlertTriangle
} from 'lucide-react'
import { Project, AnalysisResult, IssueCategory, AnalysisIssue } from '../../shared/types'
import { LogoMark } from '../../components/Logo'
import type { Phase, Decision } from './types'
import { getProject, saveDecision, getDecisionHistory, getSetting, persistProjectHealth } from '../../lib/db'
import { explainIssue, explainCode, generateBriefing, RateLimitError, cloneGitHubRepo, validateProposalSafety, createGitHubPullRequest } from '../../lib/api'
import { useFiles } from '../../context/FilesContext'
import { trackEvent } from '../../lib/analytics'
import type { TransformProposal, SafetyResult } from '../../engine/types'
import { generateReport } from '../../lib/report'
import { applyAcceptedPatches } from '../../lib/applyIssuePatch'
import { CodeMap } from './CodeMap'
import { useTranslation } from '../../hooks/useTranslation'
import { UnifiedDiffView } from '../../components/UnifiedDiffView'

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  bg: 'var(--background)',
  surface: 'var(--card)',
  surfaceHover: 'var(--accent)',
  border: 'var(--border)',
  borderHover: 'rgba(255,255,255,0.4)',
  text: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  subtle: 'var(--accent)',
  blue: 'var(--ring)',
  blueHover: 'var(--ring)',
  blueDim: 'rgba(0,153,255,0.1)',
  green: 'var(--semantic-success)',
  red: 'var(--semantic-error)',
}

const CATEGORY_META: Record<IssueCategory, { name: string; icon: string; impact: 'High' | 'Medium' | 'Low' }> = {
  'oversized-component': { name: 'Oversized Components', icon: 'layout', impact: 'High' },
  'any-type': { name: 'Any Types', icon: 'code2', impact: 'High' },
  'dead-state': { name: 'Dead useState', icon: 'zap-off', impact: 'Medium' },
  'missing-docs': { name: 'Missing Docs', icon: 'file-text', impact: 'Low' },
  'console-log': { name: 'Console Logs', icon: 'terminal', impact: 'Low' },
  'effect-no-deps': { name: 'Effect No Deps', icon: 'zap', impact: 'High' },
  'prop-drilling': { name: 'Prop Drilling', icon: 'branch', impact: 'Medium' },
  'generic-naming': { name: 'Generic Naming', icon: 'tag', impact: 'Low' },
  'circular-dep': { name: 'Circular Deps', icon: 'refresh-cw', impact: 'High' },
  'state-explosion': { name: 'State Explosion', icon: 'layers', impact: 'High' },
  'api-in-component': { name: 'API in Component', icon: 'globe', impact: 'High' },
  'missing-error-boundary': { name: 'Missing Error Boundary', icon: 'shield', impact: 'Medium' },
  'memory-leak': { name: 'Memory Leak', icon: 'activity', impact: 'High' },
  'duplicate-logic': { name: 'Duplicate Logic', icon: 'copy', impact: 'Medium' },
  'unsafe-cast': { name: 'Unsafe Cast', icon: 'alert', impact: 'High' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const CategoryIcon: React.FC<{ name: string; color?: string }> = ({ name, color = C.muted }) => {
  const props = { size: 14, color }
  switch (name) {
    case 'layout': return <Layout     {...props} />
    case 'code2': return <Code2      {...props} />
    case 'zap-off': return <ZapOff     {...props} />
    case 'file-text': return <FileText   {...props} />
    case 'terminal': return <Terminal   {...props} />
    case 'zap': return <Zap        {...props} />
    case 'branch': return <GitBranch  {...props} />
    case 'tag': return <Tag        {...props} />
    case 'refresh-cw': return <RefreshCw  {...props} />
    case 'layers': return <Layers     {...props} />
    case 'globe': return <Globe      {...props} />
    case 'shield': return <Shield     {...props} />
    case 'activity': return <Activity   {...props} />
    case 'copy': return <Copy       {...props} />
    case 'alert': return <AlertTriangle {...props} />
    default: return <FileText   {...props} />
  }
}

const ImpactBadge: React.FC<{ level: 'High' | 'Medium' | 'Low' }> = ({ level }) => {
  const styles: Record<string, React.CSSProperties> = {
    High: { background: 'var(--foreground)', color: 'var(--background)' },
    Medium: { background: 'var(--accent)', color: 'var(--foreground)' },
    Low: { background: 'var(--background)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' },
  }
  return (
    <span style={{ ...styles[level], fontSize: 10, borderRadius: 9999, padding: '2px 8px', fontWeight: 600, boxShadow: 'var(--shadow-border)', letterSpacing: '-0.02em' }}>
      {level} impact
    </span>
  )
}

const SideBySideDiff: React.FC<{
  issue: AnalysisIssue
  loading: boolean
}> = ({ issue, loading }) => {
  const { t } = useTranslation()
  const beforeLines = issue.lines.before || []
  // Prefer explicit after-lines; fall back to the precomputed patch when the
  // detector only populated `patch.after` (keeps the right column from rendering blank).
  const patchAfter = issue.patch?.after
  const afterLines = (issue.lines.after && issue.lines.after.length > 0)
    ? issue.lines.after
    : (patchAfter ? patchAfter.split('\n') : [])

  const isDeletion =
    afterLines.length === 0 && (beforeLines.length > 0 || patchAfter === '')
  // Advisory: no applicable fix at all (no after content and not a deletion).
  const isAdvisory = afterLines.length === 0 && !isDeletion

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minHeight: 0 }}>
      {/* Diff headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.08em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red }} />
          {t('projectView.original')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.08em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
            {t('projectView.refactored')}
          </div>
        </div>
      </div>

      {/* Code columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Left Column (Before) */}
        <div style={{ background: 'color-mix(in srgb, var(--semantic-error) 4%, transparent)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, position: 'relative' }}>
          {beforeLines.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 12, padding: '2px 4px', borderRadius: 4, background: 'color-mix(in srgb, var(--semantic-error) 6%, transparent)', marginBottom: 2 }}>
              <span style={{ color: 'color-mix(in srgb, var(--semantic-error) 50%, transparent)', userSelect: 'none', width: 24, textAlign: 'right', fontSize: 10, paddingTop: 2 }}>
                {issue.lineStart + idx}
              </span>
              <pre style={{ margin: 0, color: 'var(--semantic-error)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</pre>
            </div>
          ))}
        </div>

        {/* Right Column (After) */}
        <div style={{ background: 'color-mix(in srgb, var(--semantic-success) 4%, transparent)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, position: 'relative', display: (loading || isDeletion || isAdvisory) ? 'flex' : 'block', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? (
            <span style={{ color: C.muted, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} className="animate-spin" />
              {t('projectView.refactored')}…
            </span>
          ) : isDeletion ? (
            <span style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' }}>
              {t('projectView.diffLineRemoved')}
            </span>
          ) : isAdvisory ? (
            <span style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: '0 8px' }}>
              {t('projectView.diffNoAutoFix')}
            </span>
          ) : (
            afterLines.map((line, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 12, padding: '2px 4px', borderRadius: 4, background: 'color-mix(in srgb, var(--semantic-success) 6%, transparent)', marginBottom: 2 }}>
                <span style={{ color: 'color-mix(in srgb, var(--semantic-success) 50%, transparent)', userSelect: 'none', width: 24, textAlign: 'right', fontSize: 10, paddingTop: 2 }}>
                  {idx + 1}
                </span>
                <pre style={{ margin: 0, color: 'var(--semantic-success)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

const normalizeProjectPath = (path: string) => path.replace(/\\/g, '/').replace(/^\/+/, '')

const getFileContentForIssue = (filePath: string, fileMap: Map<string, string>) => {
  const normalizedFilePath = normalizeProjectPath(filePath)

  for (const [key, value] of fileMap.entries()) {
    const normalizedKey = normalizeProjectPath(key)
    if (normalizedKey === normalizedFilePath || normalizedKey.endsWith(`/${normalizedFilePath}`)) {
      return { filePath: normalizedKey, content: value }
    }
  }

  return null
}

// ─── Analysing panel ──────────────────────────────────────────────────────────
const AnalysingPanel: React.FC<{ files: any[]; scannedFiles: string[]; activeFile: string | null }> = ({ files, scannedFiles, activeFile }) => {
  const { t } = useTranslation()

  return (
    <div style={{ padding: '24px', width: '100%' }}>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>{t('projectView.analysingFiles')}</p>
      <style>{'@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }'}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {files.filter(f => !f.isDirectory).map(f => {
          const done = scannedFiles.includes(f.path)
          const active = activeFile === f.path
          return (
            <div key={f.path} style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 'var(--radius)', background: active ? 'var(--accent)' : done ? 'var(--background)' : 'transparent', boxShadow: active ? '0 0 0 1px var(--ring)' : done ? 'var(--shadow-border)' : 'none', transition: 'all 0.15s ease' }}>
              <span style={{ fontSize: 11, color: done ? 'var(--foreground)' : 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', flex: 1 }}>
                {f.name}
              </span>
              {active && <span style={{ fontSize: 9, color: C.blue, letterSpacing: '0.8px' }}>SCANNING</span>}
              {done && !active && <Check size={10} color={C.blue} />}
              {!done && !active && (
                <div style={{ height: 6, width: 60, borderRadius: 3, background: 'linear-gradient(90deg, var(--border) 25%, var(--muted-foreground) 50%, var(--border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Applying panel ───────────────────────────────────────────────────────────
const ApplyingPanel: React.FC = () => {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const messages = [
    'Analysing refactoring opportunities...',
    'Extracting sub-components...',
    'Consolidating state...',
    'Cleaning imports...',
    'Centralising API calls...',
    'Running safety checks...',
    'Almost there...',
  ]

  const messageIndex = Math.min(Math.floor(elapsed / 4), messages.length - 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
      <Loader2 size={28} color={C.muted} className="animate-spin" />
      <p style={{ fontSize: 14, color: C.muted, transition: 'all 0.3s ease' }}>
        {messages[messageIndex]}
      </p>
      <p style={{ fontSize: 11, color: C.muted, opacity: 0.5 }}>
        {elapsed}s
      </p>
    </div>
  )
}

// ─── Briefing panel ───────────────────────────────────────────────────────────
const BriefingPanel: React.FC<{ text: string; onStart: () => void }> = ({ text, onStart }) => {
  const { t } = useTranslation()
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(interval)
        setDone(true)
      }
    }, 18)
    return () => clearInterval(interval)
  }, [text])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 48px', gap: 28 }}>
      <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)' }}>
        <LogoMark size={32} />
      </div>
      <p style={{ fontSize: 16, color: 'var(--foreground)', lineHeight: 1.6, textAlign: 'center', maxWidth: 600, minHeight: 80, letterSpacing: '-0.02em' }}>
        {displayed}
        {!done && <span style={{ opacity: 0.5, animation: 'blink 1s infinite' }}>|</span>}
      </p>
      <style>{'@keyframes blink { 0%,100% { opacity: 0 } 50% { opacity: 1 } }'}</style>
      {done && (
        <button
          onClick={onStart}
          className="btn btn-primary"
          style={{ letterSpacing: '-0.02em' }}
        >
          {t('projectView.startReview')}
        </button>
      )}
    </div>
  )
}

// ─── Success state ────────────────────────────────────────────────────────────
const SuccessState: React.FC<{
  summary: AnalysisResult['summary']
  decisions: Record<string, Decision>
  issues: AnalysisIssue[]
  result: AnalysisResult | null
  project: Project | null
  onReviewAgain: () => void
  onCreatePR?: () => void
  creatingPR?: boolean
  prUrl?: string | null
}> = ({ summary, decisions, issues, result, project, onReviewAgain, onCreatePR, creatingPR, prUrl }) => {
  const { t, lang } = useTranslation()

  const acceptedIssues = issues.filter((issue) => decisions[issue.id] === 'accepted')
  const acceptedCount = acceptedIssues.length
  const rejected = Object.entries(decisions).filter(([, d]) => d === 'rejected').length

  const handleExportReport = () => {
    if (!result) return
    const md = generateReport(result, {
      projectName: project?.name,
      branch: project?.branch ?? undefined,
      language: lang as 'en' | 'pt',
    })
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refract-report-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportChangelog = () => {
    const lines = [
      '# Refract Changelog',
      `> Generated: ${new Date().toISOString()}`,
      `> Project: ${project?.path ?? 'uploaded'}`,
      `> Branch: ${project?.branch ?? 'main'}`,
      '',
      '## Summary',
      `- **${acceptedIssues.length}** changes accepted`,
      `- **${summary.high}** high impact · **${summary.medium}** medium · **${summary.low}** low`,
      '',
      '---',
      '',
      '## Changes',
      '',
      ...acceptedIssues.map(issue => [
        `### \`${issue.file}\` — ${CATEGORY_META[issue.category]?.name ?? issue.category}`,
        `**Impact:** ${issue.impact} | **Effort:** ${issue.effort ?? 'unknown'}`,
        '',
        `**Problem:** ${issue.problem}`,
        '',
        '**Before:**',
        '```typescript',
        issue.patch?.before || issue.lines.before.join('\n'),
        '```',
        '',
        '**After:**',
        '```typescript',
        issue.patch?.after || issue.lines.after.join('\n'),
        '```',
        '',
        '---',
        '',
      ].join('\n'))
    ].join('\n')

    const blob = new Blob([lines], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refract-changelog-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const metrics = [
    { label: lang === 'pt' ? 'Issues encontrados' : 'Issues found', value: summary.total },
    { label: lang === 'pt' ? 'Aceites' : 'Accepted', value: acceptedCount },
    { label: lang === 'pt' ? 'Rejeitados' : 'Rejected', value: rejected },
    { label: 'High impact', value: summary.high },
  ]

  return (
    <div style={{ padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <CheckCircle2 size={32} color="var(--primary)" style={{ marginBottom: 16 }} />
      <h2 className="page-title" style={{ marginBottom: 6 }}>{t('projectView.completeTitle')}</h2>
      <p style={{ fontSize: 16, color: 'var(--muted-foreground)', marginBottom: 32 }}>
        {t('projectView.completeSubtitle', { count: String(Object.keys(decisions).length) })}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, width: '100%', marginBottom: 36 }}>
        {metrics.map(m => (
          <div key={m.label} className="card" style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4, letterSpacing: '-0.06em' }}>{m.value}</div>
            <div className="section-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {acceptedCount > 0 && !prUrl && (
          <button onClick={onCreatePR} className="btn btn-primary" style={{ gap: 8 }} disabled={creatingPR}>
            {creatingPR ? (
              <>
                <Loader2 size={14} className="animate-spin" /> {lang === 'pt' ? 'A criar PR...' : 'Creating PR...'}
              </>
            ) : (
              <>
                <GitBranch size={14} /> {lang === 'pt' ? 'Criar PR' : 'Create PR'}
              </>
            )}
          </button>
        )}
        {prUrl && (
          <a href={prUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ gap: 8 }}>
            <GitBranch size={14} /> {lang === 'pt' ? 'Abrir PR no GitHub' : 'Open PR on GitHub'}
          </a>
        )}
        {result && (
          <button onClick={handleExportReport} className="btn btn-ghost" style={{ gap: 8 }}>
            <Download size={14} /> {t('projectView.exportReport')}
          </button>
        )}
        {acceptedCount > 0 && (
          <button onClick={handleExportChangelog} className="btn btn-ghost" style={{ gap: 8 }}>
            <Download size={14} /> {lang === 'pt' ? 'Exportar changelog' : 'Export Changelog'}
          </button>
        )}
        <button onClick={onReviewAgain} className="btn btn-ghost">
          {lang === 'pt' ? 'Rever novamente' : 'Review again'}
        </button>
      </div>
    </div>
  )
}

const RefactorProposalList: React.FC<{
  proposals: TransformProposal[]
  loading: boolean
  onApply: (proposal: TransformProposal) => void
  onSkip: (proposal: TransformProposal) => void
  validatingProposals: Record<string, boolean>
  safetyResults: Record<string, SafetyResult>
  onVerifySafety: (proposal: TransformProposal) => void
  projectPath?: string
}> = ({ proposals, loading, onApply, onSkip, validatingProposals, safetyResults, onVerifySafety, projectPath }) => {
  const { t } = useTranslation()
  const [expandedLogs, setExpandedLogs] = useState<Record<string, string | null>>({})

  const toggleLog = (proposalId: string, type: string, logContent: string) => {
    const key = `${proposalId}-${type}`
    setExpandedLogs(prev => ({
      ...prev,
      [key]: prev[key] ? null : logContent
    }))
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <Sparkles size={26} color={C.muted} />
        <p style={{ fontSize: 14, color: C.muted }}>{t('projectView.preparingRefactor')}</p>
      </div>
    )
  }

  if (proposals.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <Sparkles size={26} color={C.muted} />
        <p style={{ fontSize: 14, color: C.muted }}>{t('projectView.noSafeProposals')}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {proposals.map((proposal) => {
        const safety = safetyResults[proposal.id] || proposal.safetyResult
        const validating = validatingProposals[proposal.id]

        const reduced = safety?.warnings.some((warning) => warning.includes('Reduced to conservative version'))
        const safetyLabel = !safety?.passed ? 'Failed' : reduced ? 'Reduced' : 'Safe'
        const safetyTone = !safety?.passed ? 'color-mix(in srgb, var(--semantic-error) 15%, transparent)' : reduced ? 'color-mix(in srgb, var(--semantic-warning) 15%, transparent)' : 'color-mix(in srgb, var(--semantic-success) 12%, transparent)'

        return (
          <div key={proposal.id} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 15, color: C.text, marginBottom: 6 }}>{proposal.title}</p>
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{proposal.description}</p>
              </div>
              <span style={{ fontSize: 10, color: C.text, background: safetyTone, borderRadius: 9999, padding: '4px 8px', height: 'fit-content' }}>
                {safetyLabel}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 9999, padding: '4px 8px' }}>
                {proposal.filePath}
              </span>
              <span style={{ fontSize: 11, color: C.text, background: 'var(--accent)', borderRadius: 9999, padding: '4px 8px' }}>
                blast {proposal.blastRadius.breakageSurface}%
              </span>
              <span style={{ fontSize: 11, color: C.text, background: 'var(--accent)', borderRadius: 9999, padding: '4px 8px' }}>
                risk {proposal.blastRadius.testRisk}
              </span>
            </div>

            {validating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 6, border: '1px dashed rgba(59, 130, 246, 0.3)' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ring)' }} />
                <span style={{ fontSize: 12, color: C.muted }}>{t('projectView.validationLoading')}</span>
              </div>
            )}

            {/* Diff real: before vs after do motor AST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, marginBottom: 12 }}>
              {proposal.movedTo && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.18)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--ring)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <GitBranch size={14} />
                  <span>Rename/Move: {proposal.filePath} → {proposal.movedTo}</span>
                </div>
              )}

              {proposal.before !== proposal.after && (
                <UnifiedDiffView
                  before={proposal.before}
                  after={proposal.after}
                  fileName={proposal.filePath}
                  maxHeight="300px"
                />
              )}

              {proposal.newFiles && proposal.newFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {proposal.newFiles.map((newFile, fIdx) => (
                    <UnifiedDiffView
                      key={fIdx}
                      before=""
                      after={newFile.content}
                      fileName={newFile.path}
                      maxHeight="300px"
                    />
                  ))}
                </div>
              )}
            </div>

            {!validating && safety && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 12, padding: 12, background: 'var(--accent)', borderRadius: 6, border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Shield size={14} style={{ color: safety.passed ? C.green : C.red }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>Safety Gate Pipeline</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: C.bg, borderRadius: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>Syntax Check</span>
                    <span style={{ fontSize: 11, color: safety.syntaxOk !== false ? C.green : C.red, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {safety.syntaxOk !== false ? <Check size={12} /> : <X size={12} />}
                      {safety.syntaxOk !== false ? 'Passed' : 'Error'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: C.bg, borderRadius: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>TypeScript</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: safety.typecheck ? C.green : C.red, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {safety.typecheck ? <Check size={12} /> : <X size={12} />}
                        {safety.typecheck ? 'Type-Safe' : 'Type Error'}
                      </span>
                      {!safety.typecheck && safety.details?.typecheckLogs && safety.details.typecheckLogs.length > 0 && (
                        <button
                          onClick={() => toggleLog(proposal.id, 'typecheck', safety.details?.typecheckLogs?.join('\n') || '')}
                          style={{ background: 'none', border: 'none', color: 'var(--ring)', fontSize: 10, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Logs
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: C.bg, borderRadius: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>Build Integrity</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 11,
                        color: safety.buildOk === undefined ? '#eab308' : safety.buildOk ? C.green : C.red,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {safety.buildOk === undefined ? <AlertTriangle size={12} /> : safety.buildOk ? <Check size={12} /> : <X size={12} />}
                        {safety.buildOk === undefined ? 'Ignored' : safety.buildOk ? 'Build OK' : 'Failed'}
                      </span>
                      {safety.buildOk === false && safety.details?.buildLogs && safety.details.buildLogs.length > 0 && (
                        <button
                          onClick={() => toggleLog(proposal.id, 'build', safety.details?.buildLogs?.join('\n') || '')}
                          style={{ background: 'none', border: 'none', color: 'var(--ring)', fontSize: 10, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Logs
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: C.bg, borderRadius: 4 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>Unit Tests</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 11,
                        color: safety.testsOk === undefined ? '#eab308' : safety.testsOk ? C.green : C.red,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {safety.testsOk === undefined ? <AlertTriangle size={12} /> : safety.testsOk ? <Check size={12} /> : <X size={12} />}
                        {safety.testsOk === undefined ? 'Ignored' : safety.testsOk ? 'Passed' : 'Failed'}
                      </span>
                      {safety.testsOk === false && safety.details?.testLogs && safety.details.testLogs.length > 0 && (
                        <button
                          onClick={() => toggleLog(proposal.id, 'test', safety.details?.testLogs?.join('\n') || '')}
                          style={{ background: 'none', border: 'none', color: 'var(--ring)', fontSize: 10, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Logs
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {['typecheck', 'build', 'test'].map((type) => {
                  const key = `${proposal.id}-${type}`
                  const logContent = expandedLogs[key]
                  if (!logContent) return null
                  return (
                    <div key={type} style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{type} Logs</span>
                        <button
                          onClick={() => toggleLog(proposal.id, type, '')}
                          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {t('common.close')}
                        </button>
                      </div>
                      <pre style={{
                        margin: 0,
                        padding: '10px 12px',
                        background: 'var(--surface-strong)',
                        color: 'var(--semantic-error)',
                        border: '1px solid color-mix(in srgb, var(--semantic-error) 20%, transparent)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        whiteSpace: 'pre-wrap',
                        maxHeight: 180,
                        overflowY: 'auto'
                      }}>
                        {logContent}
                      </pre>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={() => onApply(proposal)}
                className="btn btn-primary btn-sm"
                disabled={safety?.passed === false}
              >
                Apply
              </button>
              <button onClick={() => onSkip(proposal)} className="btn btn-ghost btn-sm">
                Skip
              </button>
              {safety?.passed === false && (
                <span style={{ fontSize: 11, color: C.red, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={12} /> Safety check failed
                </span>
              )}

              {!safetyResults[proposal.id] && !validating && (
                <button
                  onClick={() => onVerifySafety(proposal)}
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}
                >
                  <Shield size={13} style={{ color: 'var(--ring)' }} />
                  Verify Safety
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export interface ProjectViewProps { projectId: string | null; onBack: () => void }

export const ProjectView: React.FC<ProjectViewProps> = ({ projectId, onBack }) => {
  const { t, lang } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const { fileMap, setFileMap, loadFilesForProject } = useFiles()
  const workerRef = useRef<Worker | null>(null)
  const refactorWorkerRef = useRef<Worker | null>(null)

  const [validatingProposals, setValidatingProposals] = useState<Record<string, boolean>>({})
  const [safetyResults, setSafetyResults] = useState<Record<string, SafetyResult>>({})

  const [recloning, setRecloning] = useState(false)
  const [recloneError, setRecloneError] = useState<string | null>(null)

  const handleReclone = async () => {
    if (!project || !project.repo) return
    setRecloning(true)
    setRecloneError(null)
    try {
      const result = await cloneGitHubRepo(project.repo, project.branch ?? 'main')
      setFileMap(new Map(Object.entries(result.files)))
    } catch (err) {
      console.error('Failed to re-clone repository:', err)
      setRecloneError(err instanceof Error ? err.message : 'Failed to re-clone repository.')
    } finally {
      setRecloning(false)
    }
  }

  const files = React.useMemo(() =>
    Array.from(fileMap.keys()).map(path => ({
      path,
      name: path.split('/').pop() || path,
      isDirectory: false,
    })),
    [fileMap]
  )

  const [project, setProject] = useState<Project | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [briefingText, setBriefingText] = useState('')
  const [selectedCat, setSelectedCat] = useState<IssueCategory | null>(null)
  const [currentIssueIdx, setCurrentIssueIdx] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [flashId, setFlashId] = useState<string | null>(null)
  const [flashType, setFlashType] = useState<Decision | null>(null)
  const [viewingFile, setViewingFile] = useState<string | null>(null)
  const [scannedFiles, setScannedFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [issueExplanation, setIssueExplanation] = useState<string | null>(null)
  const [loadingExplanation, setLoadingExplanation] = useState(false)
  const [fileExplanation, setFileExplanation] = useState<string | null>(null)
  const [loadingFileExplanation, setLoadingFileExplanation] = useState(false)
  const [explanationCache, setExplanationCache] = useState<Record<string, string>>({})
  // Tracks the issue id whose explanation request is currently in flight, so we
  // don't fire duplicate Groq calls (e.g. StrictMode double-invoke or rapid nav).
  const explainInFlightRef = useRef<string | null>(null)
  const [decisionHistory, setDecisionHistory] = useState<Record<string, { decision: string; created_at: string }>>({})
  const [currentSig, setCurrentSig] = useState<string | null>(null)
  const [loadingRefactor, setLoadingRefactor] = useState(false)
  const [loadingRefactorEngine, setLoadingRefactorEngine] = useState(false)
  const [refactorProposals, setRefactorProposals] = useState<TransformProposal[]>([])
  const [requestError, setRequestError] = useState<string | null>(null)
  const [combinedGuidelines, setCombinedGuidelines] = useState('')
  const [activeTab, setActiveTab] = useState<'issues' | 'map'>('issues')
  const [creatingPR, setCreatingPR] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const autoRunSmokeTestRef = useRef<string | null>(null)

  const persistProjectAnalysis = async (summary: AnalysisResult['summary']) => {
    if (!project?.id || project.id.startsWith('local-')) return

    try {
      await persistProjectHealth(project.id, summary, 'Refracted')
      setProject((current) => current ? { ...current, last_run: new Date().toISOString(), status: 'Refracted' } : current)
    } catch (err) {
      console.error('Failed to persist project analysis health:', err)
    }
  }

  const computeScore = (summary: AnalysisResult['summary']) =>
    Math.max(0, Math.min(100, 100 - (summary.high * 10) - (summary.medium * 4) - (summary.low * 1)))

  // Derived
  const allIssues = result?.issues ?? []
  const visibleIssues = selectedCat ? allIssues.filter(i => i.category === selectedCat) : allIssues
  const currentIssue = visibleIssues[currentIssueIdx] ?? null

  const categories = result
    ? (Object.keys(CATEGORY_META) as IssueCategory[]).map(cat => {
      const catIssues = allIssues.filter(i => i.category === cat)
      const accepted = catIssues.filter(i => decisions[i.id] === 'accepted').length
      const rejected = catIssues.filter(i => decisions[i.id] === 'rejected').length
      return { cat, meta: CATEGORY_META[cat], count: catIssues.length, accepted, rejected }
    }).filter(c => c.count > 0)
    : []



  useEffect(() => {
    if (!currentIssue) { setCurrentSig(null); return }
    computeSignature(currentIssue).then(setCurrentSig)
  }, [currentIssue?.id])

  const currentHistory = currentSig ? decisionHistory[currentSig] : null

  useEffect(() => {
    if (!currentIssue) return;

    if (explanationCache[currentIssue.id]) {
      setIssueExplanation(explanationCache[currentIssue.id]);
      setLoadingExplanation(false);
      setLoadingRefactor(false)
      return;
    }

    const issueId = currentIssue.id;
    const issueProblem = currentIssue.problem;

    // Guard against duplicate in-flight requests for the same issue
    // (React StrictMode double-invokes effects in development).
    if (explainInFlightRef.current === issueId) return;
    explainInFlightRef.current = issueId;

    setIssueExplanation(null);
    setLoadingExplanation(true);

    const controller = new AbortController();

    async function getExplanation() {
      try {
        setLoadingRefactor(true)
        // Read file from uploaded files
        const fileContent = getFileContentForIssue(currentIssue.filePath, fileMap);
        const fileSource = fileContent ? fileContent.content : '';
        const explanation = await explainIssue(currentIssue, fileSource, combinedGuidelines, controller.signal);
        if (controller.signal.aborted) return;
        setRequestError(null)
        setIssueExplanation(explanation);
        setExplanationCache(prev => ({ ...prev, [issueId]: explanation }));
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('Failed to explain issue:', err)
        if (err instanceof RateLimitError) {
          setRequestError(err.message)
        }
        setIssueExplanation(issueProblem);
      } finally {
        if (explainInFlightRef.current === issueId) explainInFlightRef.current = null;
        if (!controller.signal.aborted) {
          setLoadingRefactor(false)
          setLoadingExplanation(false);
        }
      }
    }
    getExplanation();

    return () => {
      controller.abort();
      if (explainInFlightRef.current === issueId) explainInFlightRef.current = null;
    };
  }, [currentIssue?.id, combinedGuidelines])

  // Transition to 'complete' when all refactoring proposals are applied/skipped
  useEffect(() => {
    if (phase === 'refactoring' && !loadingRefactorEngine && refactorProposals.length === 0) {
      setPhase('complete')
    }
  }, [phase, loadingRefactorEngine, refactorProposals.length])

  useEffect(() => {
    async function load() {
      if (!projectId) return

      await loadFilesForProject(projectId)

      // Load guidelines
      try {
        const globalG = await getSetting('global_guidelines', '')
        const projectG = await getSetting(`guideline_${projectId}`, '')
        const combined = [
          globalG ? `Global Guidelines:\n${globalG}` : '',
          projectG ? `Project Guidelines:\n${projectG}` : '',
        ].filter(Boolean).join('\n\n')
        setCombinedGuidelines(combined)
      } catch (err) {
        console.error('Failed to load guidelines', err)
      }

      if (projectId.startsWith('local-')) {
        setProject({
          id: projectId,
          name: projectId.replace('local-', 'Project '),
          path: 'uploaded',
          repo: null,
          branch: 'main',
          status: 'Not analysed',
          last_run: null
        })
        return
      }

      try {
        const p = await getProject(projectId)
        setProject(p)
        if (p?.path) {
          const history = await getDecisionHistory(projectId)
          const historyMap: Record<string, { decision: string; created_at: string }> = {}
          for (const row of (history || [])) {
            historyMap[row.issue_signature] = { decision: row.decision, created_at: row.created_at }
          }
          setDecisionHistory(historyMap)
        }
      } catch (err) { console.error('Failed to load project', err) }
    }
    load()
  }, [projectId, loadFilesForProject])

  // Auto-run analysis when files are loaded and no result exists yet.
  // Covers both the smoke-test project and any GitHub-cloned project.
  useEffect(() => {
    if (!project?.id) return
    if (phase !== 'idle') return
    if (result) return
    if (fileMap.size === 0) return
    if (autoRunSmokeTestRef.current === project.id) return

    autoRunSmokeTestRef.current = project.id
    void runAnalysis()
  }, [project?.id, phase, result, fileMap.size])

  // Auto-clone GitHub repos whose files are not in IndexedDB yet.
  // Runs once per project when fileMap is empty and a repo URL is available.
  const autoCloneAttemptedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!project?.id) return
    if (!project.repo) return
    if (fileMap.size > 0) return
    if (recloning) return
    if (autoCloneAttemptedRef.current === project.id) return

    autoCloneAttemptedRef.current = project.id
    setRecloning(true)
    setRecloneError(null)
    cloneGitHubRepo(project.repo, project.branch ?? 'main')
      .then((cloneResult) => {
        setFileMap(new Map(Object.entries(cloneResult.files)))
      })
      .catch((err) => {
        console.error('[ProjectView] Auto-clone failed:', err)
        setRecloneError(err instanceof Error ? err.message : 'Failed to load repository files.')
      })
      .finally(() => {
        setRecloning(false)
      })
  }, [project?.id, project?.repo, project?.branch, fileMap.size, recloning])

  // Worker lifecycle
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../workers/analysis.worker.ts', import.meta.url),
      { type: 'module' }
    )
    return () => workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    refactorWorkerRef.current = new Worker(
      new URL('../../workers/refactor.worker.ts', import.meta.url),
      { type: 'module' }
    )
    return () => refactorWorkerRef.current?.terminate()
  }, [])


  // Flash animation helper
  const triggerFlash = (id: string, type: Decision) => {
    setFlashId(id)
    setFlashType(type)
    setTimeout(() => {
      setFlashId(null)
      setFlashType(null)
    }, 400)
  }

  // Navigate to next issue
  const advance = () => {
    const next = currentIssueIdx + 1
    if (next >= visibleIssues.length) setPhase('complete')
    else setCurrentIssueIdx(next)
  }

  const handleAccept = async () => {
    if (!currentIssue || !project?.id) return
    triggerFlash(currentIssue.id, 'accepted')
    setDecisions(prev => ({ ...prev, [currentIssue.id]: 'accepted' }))
    const sig = await computeSignature(currentIssue)
    await saveDecision(
      project.id,
      sig,
      currentIssue.category,
      currentIssue.file,
      currentIssue.problem,
      'accepted',
    )
    setDecisionHistory(prev => ({ ...prev, [sig]: { decision: 'accepted', created_at: new Date().toISOString() } }))
    setTimeout(advance, 350)
  }

  const handleReject = async () => {
    if (!currentIssue || !project?.id) return
    triggerFlash(currentIssue.id, 'rejected')
    setDecisions(prev => ({ ...prev, [currentIssue.id]: 'rejected' }))
    const sig = await computeSignature(currentIssue)
    await saveDecision(
      project.id,
      sig,
      currentIssue.category,
      currentIssue.file,
      currentIssue.problem,
      'rejected',
    )
    setDecisionHistory(prev => ({ ...prev, [sig]: { decision: 'rejected', created_at: new Date().toISOString() } }))
    setTimeout(advance, 350)
  }

  const handleAcceptIssue = async (issue: AnalysisIssue) => {
    if (!project?.id) return
    triggerFlash(issue.id, 'accepted')
    setDecisions(prev => ({ ...prev, [issue.id]: 'accepted' }))
    const sig = await computeSignature(issue)
    await saveDecision(
      project.id,
      sig,
      issue.category,
      issue.file,
      issue.problem,
      'accepted',
    )
    setDecisionHistory(prev => ({ ...prev, [sig]: { decision: 'accepted', created_at: new Date().toISOString() } }))
  }

  const handleRejectIssue = async (issue: AnalysisIssue) => {
    if (!project?.id) return
    triggerFlash(issue.id, 'rejected')
    setDecisions(prev => ({ ...prev, [issue.id]: 'rejected' }))
    const sig = await computeSignature(issue)
    await saveDecision(
      project.id,
      sig,
      issue.category,
      issue.file,
      issue.problem,
      'rejected',
    )
    setDecisionHistory(prev => ({ ...prev, [sig]: { decision: 'rejected', created_at: new Date().toISOString() } }))
  }

  const persistRefactorDecision = async (
    proposal: TransformProposal,
    decision: 'accepted' | 'rejected',
    score: number,
  ) => {
    if (!project?.id) return
    try {
      await saveDecision(project.id, proposal.id, proposal.type, proposal.filePath, proposal.title, decision, score)
    } catch (error) {
      console.error(`Failed to persist refactor ${decision} decision`, error)
    }
  }

  const applyProposalToMap = (baseMap: Map<string, string>, proposal: TransformProposal) => {
    const nextMap = new Map(baseMap)
    if (proposal.movedTo) nextMap.delete(proposal.filePath)
    nextMap.set(proposal.movedTo ?? proposal.filePath, proposal.after)
    for (const file of proposal.newFiles ?? []) {
      nextMap.set(file.path, file.content)
    }
    return nextMap
  }

  const batchApply = (baseMap: Map<string, string>, proposals: TransformProposal[]) => {
    const nextMap = new Map(baseMap)
    const byTarget = new Map<string, TransformProposal[]>()

    for (const p of proposals) {
      const target = p.movedTo ?? p.filePath
      const group = byTarget.get(target) ?? []
      group.push(p)
      byTarget.set(target, group)
    }

    for (const [, group] of byTarget) {
      if (group.length === 1) {
        const p = group[0]
        if (p.movedTo) nextMap.delete(p.filePath)
        nextMap.set(p.movedTo ?? p.filePath, p.after)
        for (const f of p.newFiles ?? []) nextMap.set(f.path, f.content)
      } else {
        const [winner, ...rest] = group
        console.warn(
          `batchApply: conflito em "${winner.movedTo ?? winner.filePath}" — ${rest.length} proposta(s) ignorada(s)`,
          rest.map(p => p.id),
        )
        if (winner.movedTo) nextMap.delete(winner.filePath)
        nextMap.set(winner.movedTo ?? winner.filePath, winner.after)
        for (const f of winner.newFiles ?? []) nextMap.set(f.path, f.content)
      }
    }

    return nextMap
  }

  const handleAcceptAll = () => {
    if (!project?.id) return

    // 1) Marcar localmente imediatamente
    const all: Record<string, Decision> = {}
    for (const issue of allIssues) {
      all[issue.id] = 'accepted'
    }
    setDecisions(all)

    // 2) Aplicar os patches estáticos dos detetores (AST) ao fileMap.
    // setFileMap é assíncrono, por isso passamos o mapa já corrigido ao motor.
    const patched = applyAcceptedPatches(fileMap, allIssues, all)
    setFileMap(patched)

    // 3) Feedback imediato ao utilizador
    setPhase('applying')
    setLoadingRefactor(true)

    // 4) Persistência em background (não bloqueia UI)
    void Promise.allSettled(
      allIssues.map(async (i) => {
        try {
          const sig = await computeSignature(i)
          await saveDecision(project.id, sig, i.category, i.file, i.problem, 'accepted')
        } catch (err) {
          console.error('Failed to save decision in batch accept', i.id, err)
        }
      })
    )

    // 5) Iniciar engine sobre o mapa já corrigido
    runRefactorEngine(true, patched)
  }

  // Re-run the AST analysis on an already-patched file map so the monitor,
  // health score and remaining issue count reflect the fixes just applied.
  // Unlike runAnalysis, this does NOT reset decisions or re-enter review.
  const recomputeAfterApply = async (map: Map<string, string>) => {
    const worker = workerRef.current
    if (!worker) {
      setLoadingRefactor(false)
      setPhase('complete')
      return
    }

    const serialized: Record<string, string> = {}
    for (const [key, value] of map.entries()) {
      serialized[key] = value
    }

    worker.onmessage = async (e: MessageEvent) => {
      const { type } = e.data
      if (type === 'progress') return
      if (type === 'success') {
        const analysisResult: AnalysisResult = e.data.result
        setResult(analysisResult)
        await persistProjectAnalysis(analysisResult.summary)
      } else if (type === 'error') {
        console.error('[recompute] analysis failed', e.data.error)
      }
      setLoadingRefactor(false)
      setPhase('complete')
    }

    worker.postMessage({ files: serialized })
  }

  const runRefactorEngine = async (autoApplyAll = false, baseMap: Map<string, string> = fileMap) => {
    if (!refactorWorkerRef.current) {
      setLoadingRefactor(false)
      setLoadingRefactorEngine(false)
      if (autoApplyAll) {
        void recomputeAfterApply(baseMap)
      } else {
        setPhase('complete')
      }
      return
    }
    setLoadingRefactorEngine(true)
    setRequestError(null)

    const serialized: Record<string, string> = {}
    for (const [key, value] of baseMap.entries()) {
      serialized[key] = value
    }

    let timeout: ReturnType<typeof setTimeout> | undefined

    refactorWorkerRef.current.onmessage = (event: MessageEvent) => {
      clearTimeout(timeout)
      const { type } = event.data

      if (type === 'success') {
        const proposals = event.data.proposals as TransformProposal[]

        if (autoApplyAll) {
          // High-risk transforms require explicit per-proposal review and PR — never bulk apply.
          const SAFE_FOR_BULK: TransformProposal['type'][] = ['import-cleanup', 'component-decomposition']
          const safeProposals = proposals.filter((p) => SAFE_FOR_BULK.includes(p.type))
          const reviewProposals = proposals.filter((p) => !SAFE_FOR_BULK.includes(p.type))

          // Start from the patched base map (detector fixes already applied).
          let finalMap = baseMap
          if (safeProposals.length > 0) {
            finalMap = batchApply(baseMap, safeProposals)
            setFileMap(finalMap)
            void trackEvent('refract_applied', {
              project_id: project?.id,
              changes_count: safeProposals.length,
              mode: 'bulk',
            })
            void (async () => {
              try {
                for (const proposal of safeProposals) {
                  await persistRefactorDecision(proposal, 'accepted', 1)
                }
              } catch (error) {
                console.error('[refactor] Failed to persist bulk decisions', error)
              }
            })()
          }

          if (reviewProposals.length > 0) {
            // Present risky proposals for manual review instead of auto-applying.
            // Health is recomputed once the user finishes reviewing them.
            setRefactorProposals(reviewProposals)
            setPhase('refactoring')
            setLoadingRefactor(false)
            setLoadingRefactorEngine(false)
          } else {
            setRefactorProposals([])
            setLoadingRefactorEngine(false)
            // Re-analyze the patched files so the monitor/health and issue
            // count reflect the fixes that were just applied.
            void recomputeAfterApply(finalMap)
          }
          return
        }

        setRefactorProposals(proposals)
        setPhase('refactoring')
        setLoadingRefactor(false)
        setLoadingRefactorEngine(false)
        return
      }

      if (type === 'error') {
        console.error('Refactor engine failed', event.data.error)
        setRequestError(event.data.error ?? 'Failed to analyze refactoring proposals.')
        setLoadingRefactorEngine(false)
        setLoadingRefactor(false)
        // Detector patches are already in baseMap — still recompute health.
        if (autoApplyAll) {
          void recomputeAfterApply(baseMap)
        } else {
          setPhase('complete')
        }
      }
    }

    refactorWorkerRef.current.postMessage({ files: serialized, options: { maxProposals: 12, guidelines: combinedGuidelines } })

    timeout = setTimeout(() => {
      console.warn('[refactor] Worker timeout — forcing complete')
      setLoadingRefactor(false)
      setLoadingRefactorEngine(false)
      if (autoApplyAll) {
        void recomputeAfterApply(baseMap)
      } else {
        setPhase('complete')
      }
    }, 30_000)
  }

  const applyProposalToFileMap = (proposal: TransformProposal) => {
    setFileMap(applyProposalToMap(fileMap, proposal))
  }

  const handleApplyProposal = async (proposal: TransformProposal) => {
    applyProposalToFileMap(proposal)
    setRefactorProposals((current) => current.filter((entry) => entry.id !== proposal.id))

    void trackEvent('refract_applied', {
      project_id: project?.id,
      proposal_id: proposal.id,
      file_path: proposal.filePath,
      mode: 'single',
    })

    await persistRefactorDecision(proposal, 'accepted', 1)
  }

  const handleSkipProposal = async (proposal: TransformProposal) => {
    setRefactorProposals((current) => current.filter((entry) => entry.id !== proposal.id))

    await persistRefactorDecision(proposal, 'rejected', 0)
  }

  const handleCreatePR = async () => {
    if (!project?.repo || !result) return
    setCreatingPR(true)
    setRequestError(null)

    try {
      // Apply accepted issue patches to a copy of the fileMap, then send only
      // the files that actually changed (vs. the current fileMap). Without this
      // the PR would contain identical blobs and open with zero file changes.
      const patchedMap = applyAcceptedPatches(fileMap, allIssues, decisions)

      const changes: Array<{ filePath: string; newContent: string }> = []
      for (const [path, content] of patchedMap.entries()) {
        if (content !== fileMap.get(path)) {
          changes.push({ filePath: path, newContent: content })
        }
      }

      if (changes.length === 0) {
        setRequestError(
          lang === 'pt'
            ? 'Nenhuma alteração para incluir no PR. Aceita issues com correção automática antes de criar o PR.'
            : 'No changes to include in the PR. Accept issues with an automatic fix before creating the PR.',
        )
        return
      }

      // Keep local state in sync with what we're sending to GitHub.
      setFileMap(patchedMap)

      const branchName = `refract/${Date.now()}`
      const title = lang === 'pt'
        ? `Refract: corrigir ${result.summary.total} issues de qualidade`
        : `Refract: fix ${result.summary.total} quality issues`
      const body = [
        lang === 'pt' ? '## Refract Refactoring' : '## Refract Refactoring',
        '',
        lang === 'pt'
          ? `Issues analisadas: ${result.summary.total}`
          : `Issues analyzed: ${result.summary.total}`,
        lang === 'pt'
          ? `Issues aceites: ${Object.keys(decisions).length}`
          : `Accepted issues: ${Object.keys(decisions).length}`,
        `High impact: ${result.summary.high} · Medium: ${result.summary.medium} · Low: ${result.summary.low}`,
        '',
        lang === 'pt' ? '### Mudanças' : '### Changes',
        ...changes.map(c => `- \`${c.filePath}\``),
      ].join('\n')

      const pr = await createGitHubPullRequest({
        repoUrl: project.repo,
        baseBranch: project.branch ?? 'main',
        headBranch: branchName,
        title,
        body,
        projectId: project.id,
        changes,
      })

      setPrUrl(pr.url)
    } catch (err: any) {
      console.error('Failed to create PR:', err)
      setRequestError(err.message || 'Failed to create pull request')
    } finally {
      setCreatingPR(false)
    }
  }

  const handleVerifySafety = async (proposal: TransformProposal) => {
    setValidatingProposals((prev) => ({ ...prev, [proposal.id]: true }))
    try {
      const serialized: Record<string, string> = {}
      for (const [k, v] of fileMap.entries()) {
        serialized[k] = v
      }

      const result = await validateProposalSafety({
        projectPath: project?.path || undefined,
        filePath: proposal.filePath,
        before: proposal.before,
        after: proposal.after,
        newFiles: proposal.newFiles?.map((f) => ({ path: f.path, content: f.content })),
        fileMap: serialized,
      })

      setSafetyResults((prev) => ({ ...prev, [proposal.id]: result }))

      setRefactorProposals((current) =>
        current.map((p) =>
          p.id === proposal.id
            ? { ...p, safetyResult: result }
            : p
        )
      )
    } catch (err: any) {
      console.error('Safety validation failed:', err)
    } finally {
      setValidatingProposals((prev) => ({ ...prev, [proposal.id]: false }))
    }
  }

  // Run analysis via Web Worker
  const runAnalysis = async () => {
    if (!project?.path || !workerRef.current) return
    if (fileMap.size === 0) return
    void trackEvent('analysis_started', {
      project_id: project.id,
      file_count: fileMap.size,
      trigger: 'project_view',
    })
    setPhase('analysing')
    setDecisions({})
    setScannedFiles([])
    setActiveFile(null)
    setRequestError(null)

    // Serialize Map to plain object for postMessage
    const serialized: Record<string, string> = {}
    for (const [k, v] of fileMap.entries()) {
      serialized[k] = v
    }

    const flatFiles = files.filter(f => !f.isDirectory)

    workerRef.current.onmessage = async (e: MessageEvent) => {
      const { type } = e.data

      if (type === 'progress') {
        setActiveFile(e.data.file)
        setScannedFiles(prev => [...prev, e.data.file])
        return
      }

      if (type === 'success') {
        const analysisResult: AnalysisResult = e.data.result
        setActiveFile(null)
        setResult(analysisResult)

        void trackEvent('analysis_completed', {
          project_id: project.id,
          score: computeScore(analysisResult.summary),
          issues_count: analysisResult.summary.total,
        })

        await persistProjectAnalysis(analysisResult.summary)

        try {
          const briefing = await generateBriefing(
            project.path,
            analysisResult.issues,
            analysisResult.scannedFiles,
            combinedGuidelines,
            lang,
          )
          setRequestError(null)
          setBriefingText(briefing ?? t('projectView.briefingFallback', {
            files: String(analysisResult.scannedFiles.length),
            issues: String(analysisResult.summary.total),
          }))
        } catch (err) {
          console.error('Failed to generate analysis briefing:', err)
          if (err instanceof RateLimitError) {
            setRequestError(err.message)
          }
          setBriefingText(t('projectView.briefingFallback', {
            files: String(analysisResult.scannedFiles.length),
            issues: String(analysisResult.summary.total),
          }))
        }
        setSelectedCat(analysisResult.issues[0]?.category ?? null)
        setCurrentIssueIdx(0)
        setPhase('briefing')
        return
      }

      if (type === 'error') {
        const msg = e.data.error ?? 'Analysis failed. Please try again.'
        setRequestError(typeof msg === 'string' ? msg : 'Analysis failed. Please try again.')
        setPhase('idle')
      }
    }

    // Start visual progress while worker runs
    flatFiles.forEach((f, i) => {
      setTimeout(() => {
        if (phase === 'analysing') {
          setActiveFile(f.path)
        }
      }, i * 80)
    })

    workerRef.current.postMessage({ files: serialized })
  }

  const updateIssueLines = (issueId: string, newPatch: any) => {
    if (!result) return
    const updatedIssues = result.issues.map(i => {
      if (i.id !== issueId) return i
      const patch = newPatch || { before: '', after: '' }

      // Desescapar \n literais que a AI pode devolver
      const afterStr = typeof patch.after === 'string'
        ? patch.after.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
        : ''
      const beforeStr = typeof patch.before === 'string'
        ? patch.before.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
        : ''

      const afterArray = Array.isArray(patch.after) ? patch.after : afterStr.split('\n')

      return {
        ...i,
        patch: { before: beforeStr, after: afterStr },
        lines: { ...i.lines, after: afterArray }
      }
    })
    setResult({ ...result, issues: updatedIssues })
  }

  // Flash overlay colour
  const flashBg = flashType === 'accepted' ? 'rgba(74,222,128,0.06)' : flashType === 'rejected' ? 'rgba(239,68,68,0.06)' : 'transparent'

  // ── Top bar ──────────────────────────────────────────────────────────────
  const TopBar = (
    <div style={{ height: 48, background: C.bg, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 16, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ padding: 0, width: 32, height: 32 }}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>{project?.name ?? 'Loading...'}</span>
        {/* Guest label removed for onboarding reset to original behavior */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>
          <GitBranch size={9} /> {project?.branch ?? 'main'}
        </span>
        {result && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{result.summary.total} issues</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {result && (
          <div style={{ display: 'flex', gap: 4, marginRight: 8 }}>
            <button
              onClick={() => setActiveTab('issues')}
              className={`btn btn-sm ${activeTab === 'issues' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11, padding: '4px 10px' }}
            >
              <Layers size={12} /> Issues
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`btn btn-sm ${activeTab === 'map' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11, padding: '4px 10px' }}
            >
              <GitBranch size={12} /> Map
            </button>
          </div>
        )}

        <button onClick={runAnalysis} className="btn btn-primary btn-sm">
          <Play size={12} /> Run Analysis
        </button>
      </div>
    </div>
  )

  // ── Left panel ────────────────────────────────────────────────────────────
  const LeftPanel = (
    <div style={{ width: 260, flexShrink: 0, background: C.bg, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: '16px 12px' }}>

      {phase === 'reviewing' && allIssues.length > 0 && (
        <>
          <p className="section-label" style={{ marginBottom: 12 }}>Fix Queue</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
            {[...allIssues]
              .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
              .map((issue) => {
                const isCurrent = issue.id === currentIssue?.id
                const decision = decisions[issue.id]
                return (
                  <div
                    key={issue.id}
                    onClick={() => {
                      setSelectedCat(null)
                      const idx = allIssues.findIndex(i => i.id === issue.id)
                      if (idx !== -1) setCurrentIssueIdx(idx)
                    }}
                    style={{
                      background: isCurrent ? C.surfaceHover : C.surface,
                      border: `1px solid ${isCurrent ? C.blue : decision ? 'var(--border)' : C.border}`,
                      borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                      opacity: decision ? 0.5 : 1,
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = C.surfaceHover }}
                    onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = C.surface }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {issue.file}
                      </span>
                      {decision === 'accepted' && <Check size={10} color={C.green} />}
                      {decision === 'rejected' && <X size={10} color={C.red} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <ImpactBadge level={issue.impact} />
                      {issue.effort && (
                        <span style={{ fontSize: 9, color: C.muted, background: C.subtle, borderRadius: 3, padding: '1px 5px' }}>
                          {issue.effort} effort
                        </span>
                      )}
                      {issue.blastRadius !== undefined && issue.blastRadius > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--foreground)', background: 'var(--accent)', borderRadius: 3, padding: '1px 5px' }}>
                          blast: {issue.blastRadius}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </>
      )}

      {/* File tree */}
      <div style={{ borderTop: phase === 'reviewing' ? '1px solid var(--border)' : 'none', paddingTop: phase === 'reviewing' ? 12 : 0 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>Project Files</p>
        {files.length === 0
          ? <span style={{ fontSize: 11, color: C.muted, paddingLeft: 6 }}>No files found.</span>
          : files.map(f => (
            <div key={f.path}
              onClick={() => { if (!f.isDirectory) setViewingFile(f.path) }}
              style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', borderRadius: 4, background: 'transparent', cursor: 'pointer', transition: 'background 0.12s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {f.isDirectory ? <Folder size={11} color={C.muted} /> : <FileIcon size={11} color={C.muted} />}
                <span style={{ fontSize: 11, color: f.isDirectory ? 'var(--ink)' : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )

  // ── Center panel ──────────────────────────────────────────────────────────
  const CenterPanel = (
    <div style={{ flex: 1, background: flashId ? flashBg : C.bg, overflowY: 'auto', padding: phase === 'idle' || phase === 'briefing' ? 0 : '20px 24px', display: 'flex', flexDirection: 'column', transition: 'background 0.3s ease' }}>
      {requestError && (
        <div
          style={{
            margin: phase === 'idle' || phase === 'briefing' ? '20px 24px 0' : '0 0 16px',
            padding: '12px 14px',
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--semantic-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--semantic-error) 20%, transparent)',
            color: 'var(--semantic-error)',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {requestError}
        </div>
      )}

      {phase === 'idle' && !viewingFile && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
          <Play size={28} color={C.muted} />
          <p style={{ fontSize: 14, color: C.muted }}>{lang === 'pt' ? 'Corre a analise para detectar problemas' : 'Run analysis to detect issues'}</p>
        </div>
      )}

      {phase === 'idle' && viewingFile && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: C.text }}>{viewingFile}</span>
            <button onClick={() => setViewingFile(null)} className="btn btn-ghost btn-sm">Close File</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--card)' }}>
            <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: C.muted, margin: 0, whiteSpace: 'pre-wrap' }}>
              {fileMap.get(viewingFile)}
            </pre>
          </div>
        </div>
      )}

      {phase === 'analysing' && (
        <AnalysingPanel files={files} scannedFiles={scannedFiles} activeFile={activeFile} />
      )}

      {phase === 'briefing' && result && (
        <BriefingPanel text={briefingText} onStart={() => setPhase('reviewing')} />
      )}

      {phase === 'applying' && (
        <ApplyingPanel />
      )}

      {phase === 'refactoring' && (
        <RefactorProposalList
          proposals={refactorProposals}
          loading={loadingRefactorEngine}
          onApply={handleApplyProposal}
          onSkip={handleSkipProposal}
          validatingProposals={validatingProposals}
          safetyResults={safetyResults}
          onVerifySafety={handleVerifySafety}
          projectPath={project?.path || undefined}
        />
      )}

      {phase === 'reviewing' && currentIssue && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16, minHeight: 0, height: '100%' }}>
          <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: C.muted, marginBottom: 6 }}>{currentIssue.filePath}</p>
              <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0, color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1.4 }}>
                {currentIssue.problem}
              </h2>
            </div>
            <button
              onClick={async () => {
                setLoadingFileExplanation(true)
                setFileExplanation(null)
                try {
                  const code = fileMap.get(currentIssue.filePath) ?? ''
                  const deps = Object.entries(result?.dependencies ?? {})
                    .filter(([k]) => k === currentIssue.filePath)
                    .flatMap(([, v]) => v)
                  const exp = await explainCode(currentIssue.filePath, code, {
                    dependencies: deps.slice(0, 8),
                    issues: result?.issues.filter(i => i.filePath === currentIssue.filePath).length,
                    category: currentIssue.category,
                  })
                  setFileExplanation(exp)
                } catch (err: any) {
                  setFileExplanation(err.message ?? 'Failed to explain code')
                } finally {
                  setLoadingFileExplanation(false)
                }
              }}
              className="btn btn-ghost btn-sm"
              style={{ gap: 6, flexShrink: 0, marginLeft: 16 }}
            >
              {loadingFileExplanation ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Code2 size={12} />
              )}
              {loadingFileExplanation ? t('projectView.explaining') : t('projectView.explainCode')}
            </button>
          </div>
          <SideBySideDiff issue={currentIssue} loading={loadingRefactor} />
          {fileExplanation && (
            <div style={{ background: 'var(--accent)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', fontSize: 12, lineHeight: 1.7, color: 'var(--muted-foreground)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <FileText size={13} color={C.muted} />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {lang === 'pt' ? 'Explicação do Código' : 'Code Explanation'}
                </span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{fileExplanation}</div>
            </div>
          )}
        </div>
      )}

      {(phase === 'reviewing' && !currentIssue && result) || (phase === 'complete' && result) ? (
        <SuccessState
          summary={result.summary}
          decisions={decisions}
          issues={allIssues}
          result={result}
          project={project}
          onReviewAgain={() => { setPhase('idle'); setResult(null); setDecisions({}); setPrUrl(null) }}
          onCreatePR={handleCreatePR}
          creatingPR={creatingPR}
          prUrl={prUrl}
        />
      ) : null}
    </div>
  )

  // ── Right panel ───────────────────────────────────────────────────────────
  const RightPanel = phase !== 'reviewing' ? null : (
    <div style={{ width: 280, flexShrink: 0, background: C.bg, borderLeft: `1px solid ${C.border}`, overflowY: 'auto', padding: '20px 16px' }}>
      {currentIssue && (
        <>
          <p className="section-label" style={{ marginBottom: 10 }}>{lang === 'pt' ? 'Porque' : 'Why'}</p>
          <p style={{ fontSize: 12, color: loadingExplanation ? C.muted : 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 20, fontStyle: loadingExplanation ? 'italic' : 'normal' }}>
            {loadingExplanation ? t('projectView.analyzingIssue') : (issueExplanation ?? currentIssue.problem)}
          </p>

          <p className="section-label" style={{ marginBottom: 12 }}>{lang === 'pt' ? 'Impacto' : 'Impact'}</p>
          {[
            { label: lang === 'pt' ? 'Severidade' : 'Severity', value: currentIssue.impact, valueColor: 'var(--foreground)' },
            { label: lang === 'pt' ? 'Linhas' : 'Lines', value: String(currentIssue.lineEnd - currentIssue.lineStart + 1), valueColor: C.muted },
            { label: lang === 'pt' ? 'Ficheiro' : 'File', value: currentIssue.file, valueColor: C.muted },
          ].map(({ label, value, valueColor }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
              <span style={{ fontSize: 11, color: valueColor, maxWidth: 140, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{value}</span>
            </div>
          ))}

          {currentHistory && (
            <div style={{ marginTop: 16, background: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
              <p style={{ fontSize: 11, color: 'var(--foreground)', fontWeight: 500, marginBottom: 2 }}>
                {currentHistory.decision === 'rejected' ? t('projectView.alreadyRejected') : t('projectView.alreadyAccepted')}
              </p>
              <p style={{ fontSize: 10, color: C.muted }}>
                {new Date(currentHistory.created_at).toLocaleDateString(lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US')}
              </p>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, margin: '20px 0' }} />

          <button onClick={handleAccept} className="btn btn-primary" style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}>
            <Check size={14} /> Accept
          </button>

          <button onClick={handleReject}
            style={{ width: '100%', height: 36, background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 100, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, transition: 'all 0.12s ease' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}>
            <X size={14} /> Reject
          </button>

          <button onClick={handleAcceptAll}
            style={{ width: '100%', height: 36, background: 'rgba(74, 222, 128, 0.08)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 100, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, transition: 'all 0.12s ease', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74, 222, 128, 0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(74, 222, 128, 0.08)' }}>
            <CheckCheck size={14} /> Accept All
          </button>

          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setCurrentIssueIdx(i => Math.max(0, i - 1))} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
              <ChevronLeft size={13} /> Prev
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{currentIssueIdx + 1} / {visibleIssues.length}</span>
            <button onClick={() => setCurrentIssueIdx(i => Math.min(visibleIssues.length - 1, i + 1))} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
              Next <ChevronRight size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  )

  async function computeSignature(issue: AnalysisIssue): Promise<string> {
    const raw = `${issue.category}|${issue.file}|${issue.problem}`
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  if (project && fileMap.size === 0) {
    // Still auto-cloning — show a loading state instead of the error screen
    if (recloning) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, gap: 16 }}>
          <Loader2 size={32} color={C.muted} className="animate-spin" />
          <p style={{ fontSize: 14, color: C.muted }}>
            {lang === 'pt' ? 'A carregar repositório...' : 'Loading repository…'}
          </p>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, gap: 20, padding: 24 }}>
        <ZapOff size={48} color={C.muted} style={{ marginBottom: 8 }} />
        <h2 style={{ fontSize: 20, color: 'var(--foreground)', fontWeight: 500, textAlign: 'center', margin: 0 }}>
          {lang === 'pt' ? 'Ficheiros do repositório não carregados' : 'Repository files not loaded'}
        </h2>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 400, margin: '0 0 8px', lineHeight: 1.5 }}>
          {lang === 'pt'
            ? 'Os ficheiros deste projecto não estão no armazenamento local. Volta a clonar o repositório para continuar.'
            : 'The files for this project are not in local storage. Re-clone the repository to continue.'}
        </p>

        {recloneError && (
          <div style={{
            background: 'color-mix(in srgb, var(--semantic-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--semantic-error) 20%, transparent)',
            borderRadius: '8px',
            color: 'var(--semantic-error)',
            fontSize: 13,
            lineHeight: 1.5,
            padding: '10px 14px',
            maxWidth: 400,
            textAlign: 'center',
            marginBottom: 8
          }}>
            {recloneError}
          </div>
        )}

        {project.repo ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleReclone}
              className="btn btn-primary"
              disabled={recloning}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 180, justifyContent: 'center' }}
            >
              {recloning ? (
                <>
                  <Loader2 size={14} className="spin" />
                  {lang === 'pt' ? 'A clonar novamente...' : 'Re-cloning...'}
                </>
              ) : (
                lang === 'pt' ? 'Voltar a clonar o repositório' : 'Re-clone Repository'
              )}
            </button>
            <button
              onClick={onBack}
              className="btn btn-secondary"
              disabled={recloning}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <ArrowLeft size={14} /> {lang === 'pt' ? 'Voltar' : 'Back'}
            </button>
          </div>
        ) : (
          <button onClick={onBack} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ArrowLeft size={14} /> {lang === 'pt' ? 'Voltar' : 'Back'}
          </button>
        )}
      </div>
    )
  }

  const navigateToIssue = (issueId: string) => {
    const idx = allIssues.findIndex(i => i.id === issueId)
    if (idx === -1) return
    setActiveTab('issues')
    setSelectedCat(null)
    setCurrentIssueIdx(idx)
    if (phase !== 'reviewing') setPhase('reviewing')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, overflow: 'hidden' }}>
      {TopBar}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {activeTab === 'map' && result ? (
          <CodeMap
            projectPath={result?.projectPath}
            issues={allIssues}
            dependencies={result?.dependencies}
            onNavigateToIssue={navigateToIssue}
            decisions={decisions}
            onAcceptIssue={handleAcceptIssue}
            onRejectIssue={handleRejectIssue}
          />
        ) : (
          <>
            {LeftPanel}
            {CenterPanel}
            {RightPanel}
          </>
        )}
      </div>
    </div>
  )
}
