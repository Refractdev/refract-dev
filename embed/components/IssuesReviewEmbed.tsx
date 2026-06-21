import React, { useState } from 'react'
import {
  Check, X, ChevronLeft, ChevronRight, CheckCheck, Folder, File as FileIcon,
} from 'lucide-react'
import type { DemoIssue, Decision } from '../shared/types'
import { C } from '../shared/constants'
import { ImpactBadge } from '../shared/ImpactBadge'
import { SideBySideDiff } from './SideBySideDiff'
import { DEMO_ISSUES, DEMO_FILES } from '../mock/demoData'

interface IssuesReviewEmbedProps {
  issues?: DemoIssue[]
  showFileTree?: boolean
  height?: number | string
  bare?: boolean
}

export const IssuesReviewEmbed: React.FC<IssuesReviewEmbedProps> = ({
  issues = DEMO_ISSUES,
  showFileTree = true,
  height = 640,
  bare = false,
}) => {
  const [currentIssueIdx, setCurrentIssueIdx] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})

  const sortedIssues = [...issues].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  const currentIssue = sortedIssues[currentIssueIdx]

  const handleAccept = () => {
    if (!currentIssue) return
    setDecisions(prev => ({ ...prev, [currentIssue.id]: 'accepted' }))
    if (currentIssueIdx < sortedIssues.length - 1) {
      setCurrentIssueIdx(i => i + 1)
    }
  }

  const handleReject = () => {
    if (!currentIssue) return
    setDecisions(prev => ({ ...prev, [currentIssue.id]: 'rejected' }))
    if (currentIssueIdx < sortedIssues.length - 1) {
      setCurrentIssueIdx(i => i + 1)
    }
  }

  const handleAcceptAll = () => {
    const all: Record<string, Decision> = {}
    for (const issue of sortedIssues) all[issue.id] = 'accepted'
    setDecisions(all)
  }

  const navigateToIssue = (issueId: string) => {
    const idx = sortedIssues.findIndex(i => i.id === issueId)
    if (idx !== -1) setCurrentIssueIdx(idx)
  }

  return (
    <div style={{
      display: 'flex',
      height,
      background: C.bg,
      overflow: 'hidden',
      ...(bare ? {} : { border: `1px solid ${C.border}`, borderRadius: 12 }),
    }}>
      {/* Left panel — Fix Queue + file tree */}
      <div style={{ width: 260, flexShrink: 0, background: C.bg, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: '16px 12px' }}>
        <p className="section-label" style={{ marginBottom: 12 }}>Fix Queue</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {sortedIssues.map((issue) => {
            const isCurrent = issue.id === currentIssue?.id
            const decision = decisions[issue.id]
            return (
              <div
                key={issue.id}
                onClick={() => navigateToIssue(issue.id)}
                style={{
                  background: isCurrent ? C.surfaceHover : C.surface,
                  border: `1px solid ${isCurrent ? C.blue : decision ? 'var(--border)' : C.border}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  opacity: decision ? 0.5 : 1,
                  transition: 'all 0.12s ease',
                }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = C.surfaceHover }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = C.surface }}
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

        {showFileTree && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p className="section-label" style={{ marginBottom: 12 }}>Project Files</p>
            {DEMO_FILES.map(f => (
              <div key={f.path} style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 6px', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {f.isDirectory ? <Folder size={11} color={C.muted} /> : <FileIcon size={11} color={C.muted} />}
                  <span style={{ fontSize: 11, color: f.isDirectory ? 'var(--ink)' : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Center panel — issue detail + diff */}
      <div style={{ flex: 1, background: C.bg, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {currentIssue && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16, minHeight: 0, height: '100%' }}>
            <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: C.muted, marginBottom: 6 }}>{currentIssue.filePath}</p>
              <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0, color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1.4 }}>
                {currentIssue.problem}
              </h2>
            </div>
            <SideBySideDiff issue={currentIssue} />
          </div>
        )}
      </div>

      {/* Right panel — Why / Impact / Actions */}
      <div style={{ width: 280, flexShrink: 0, background: C.bg, borderLeft: `1px solid ${C.border}`, overflowY: 'auto', padding: '20px 16px' }}>
        {currentIssue && (
          <>
            <p className="section-label" style={{ marginBottom: 10 }}>Why</p>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 20 }}>
              {currentIssue.explanation}
            </p>

            <p className="section-label" style={{ marginBottom: 12 }}>Impact</p>
            {[
              { label: 'Severity', value: currentIssue.impact, valueColor: 'var(--foreground)' },
              { label: 'Lines', value: String(currentIssue.lineEnd - currentIssue.lineStart + 1), valueColor: C.muted },
              { label: 'File', value: currentIssue.file, valueColor: C.muted },
            ].map(({ label, value, valueColor }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                <span style={{ fontSize: 11, color: valueColor, maxWidth: 140, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{value}</span>
              </div>
            ))}

            <div style={{ borderTop: `1px solid ${C.border}`, margin: '20px 0' }} />

            <button onClick={handleAccept} className="btn btn-primary" style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}>
              <Check size={14} /> Accept
            </button>

            <button
              onClick={handleReject}
              style={{ width: '100%', height: 36, background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 100, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, transition: 'all 0.12s ease' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}
            >
              <X size={14} /> Reject
            </button>

            <button
              onClick={handleAcceptAll}
              style={{ width: '100%', height: 36, background: 'rgba(74, 222, 128, 0.08)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 100, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, transition: 'all 0.12s ease', fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74, 222, 128, 0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(74, 222, 128, 0.08)' }}
            >
              <CheckCheck size={14} /> Accept All
            </button>

            <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={() => setCurrentIssueIdx(i => Math.max(0, i - 1))} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                <ChevronLeft size={13} /> Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{currentIssueIdx + 1} / {sortedIssues.length}</span>
              <button onClick={() => setCurrentIssueIdx(i => Math.min(sortedIssues.length - 1, i + 1))} className="btn btn-ghost btn-sm" style={{ padding: 4 }}>
                Next <ChevronRight size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
