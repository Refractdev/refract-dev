import React from 'react'
import type { DemoIssue } from '../shared/types'
import { SideBySideDiff } from './SideBySideDiff'
import { UnifiedDiffView } from './UnifiedDiffView'
import { DEMO_ISSUES } from '../mock/demoData'

export type DiffViewVariant = 'side-by-side' | 'unified'

interface DiffViewEmbedProps {
  variant?: DiffViewVariant
  issue?: DemoIssue
  before?: string
  after?: string
  fileName?: string
  maxHeight?: string
}

export const DiffViewEmbed: React.FC<DiffViewEmbedProps> = ({
  variant = 'side-by-side',
  issue = DEMO_ISSUES[0],
  before,
  after,
  fileName,
  maxHeight,
}) => {
  const padding = { padding: 20, background: 'var(--background)', minHeight: 400 }

  if (variant === 'unified') {
    const b = before ?? issue.lines.before.join('\n')
    const a = after ?? issue.lines.after.join('\n')
    return (
      <div style={padding}>
        <UnifiedDiffView
          before={b}
          after={a}
          fileName={fileName ?? issue.filePath}
          maxHeight={maxHeight}
        />
      </div>
    )
  }

  return (
    <div style={{ ...padding, display: 'flex', flexDirection: 'column', height: 480 }}>
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 6 }}>
          {issue.filePath}
        </p>
        <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0, color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1.4 }}>
          {issue.problem}
        </h2>
      </div>
      <SideBySideDiff issue={issue} />
    </div>
  )
}
