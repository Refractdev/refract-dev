import React from 'react'
import type { DemoIssue } from '../shared/types'
import { C } from '../shared/constants'

interface Props {
  issue: Pick<DemoIssue, 'lines' | 'lineStart'>
}

export const SideBySideDiff: React.FC<Props> = ({ issue }) => {
  const beforeLines = issue.lines.before || []
  const afterLines = issue.lines.after || []
  const isDeletion = afterLines.length === 0 && beforeLines.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.08em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red }} />
          Original
        </div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.08em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
          Refactored
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ background: 'color-mix(in srgb, var(--semantic-error) 4%, transparent)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6 }}>
          {beforeLines.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 12, padding: '2px 4px', borderRadius: 4, background: 'color-mix(in srgb, var(--semantic-error) 6%, transparent)', marginBottom: 2 }}>
              <span style={{ color: 'color-mix(in srgb, var(--semantic-error) 50%, transparent)', userSelect: 'none', width: 24, textAlign: 'right', fontSize: 10, paddingTop: 2 }}>
                {issue.lineStart + idx}
              </span>
              <pre style={{ margin: 0, color: 'var(--semantic-error)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</pre>
            </div>
          ))}
        </div>

        <div style={{ background: 'color-mix(in srgb, var(--semantic-success) 4%, transparent)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, display: (afterLines.length === 0) ? 'flex' : 'block', alignItems: 'center', justifyContent: 'center' }}>
          {afterLines.length === 0 ? (
            <span style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: '0 8px' }}>
              {isDeletion ? 'Line removed' : 'No automatic fix — manual review'}
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
