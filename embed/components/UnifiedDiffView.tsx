import React, { useMemo } from 'react'
import { buildDiffHunks, type DiffHunk } from '../lib/diff'
import { C } from '../shared/constants'

const GUTTER_WIDTH = 40

interface UnifiedDiffViewProps {
  before: string
  after: string
  fileName?: string
  maxHeight?: string
}

const DiffLine: React.FC<{
  hunk: DiffHunk
  line: DiffHunk['lines'][0]
  idx: number
}> = ({ hunk, line, idx }) => {
  const isFirst = idx === 0
  const isDelete = line.type === 'delete'
  const isInsert = line.type === 'insert'

  const bgColor = isDelete
    ? 'color-mix(in srgb, var(--semantic-error) 8%, transparent)'
    : isInsert
      ? 'color-mix(in srgb, var(--semantic-success) 8%, transparent)'
      : 'transparent'

  const textColor = isDelete
    ? 'var(--semantic-error)'
    : isInsert
      ? 'var(--semantic-success)'
      : 'var(--ink)'

  const gutterColor = isDelete
    ? 'color-mix(in srgb, var(--semantic-error) 50%, transparent)'
    : isInsert
      ? 'color-mix(in srgb, var(--semantic-success) 50%, transparent)'
      : 'var(--ink-muted)'

  const prefix = isDelete ? '-' : isInsert ? '+' : ' '
  const prefixColor = isDelete ? C.red : isInsert ? C.green : 'transparent'

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '1px 4px',
        background: bgColor,
        minHeight: 20,
        alignItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {isFirst && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -20,
            height: 20,
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            borderTop: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            fontSize: 10,
            color: 'var(--primary)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
          }}
        >
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </div>
      )}

      <div style={{ width: GUTTER_WIDTH, textAlign: 'right', color: gutterColor, fontSize: 10, userSelect: 'none', flexShrink: 0, paddingRight: 8 }}>
        {line.oldLineNo ?? ''}
      </div>
      <div style={{ width: GUTTER_WIDTH, textAlign: 'right', color: gutterColor, fontSize: 10, userSelect: 'none', flexShrink: 0, paddingRight: 8 }}>
        {line.newLineNo ?? ''}
      </div>
      <span style={{ width: 12, color: prefixColor, flexShrink: 0, textAlign: 'center', userSelect: 'none' }}>
        {prefix}
      </span>
      <pre style={{ margin: 0, color: textColor, whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1 }}>
        {line.content}
      </pre>
    </div>
  )
}

export const UnifiedDiffView: React.FC<UnifiedDiffViewProps> = ({
  before,
  after,
  fileName,
  maxHeight = '400px',
}) => {
  const hunks = useMemo(() => buildDiffHunks(before, after), [before, after])

  const totalChanges = useMemo(() => {
    let inserts = 0
    let deletes = 0
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'insert') inserts++
        if (line.type === 'delete') deletes++
      }
    }
    return { inserts, deletes }
  }, [hunks])

  if (hunks.length === 0 || (totalChanges.inserts === 0 && totalChanges.deletes === 0)) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 8, background: C.surface }}>
        No changes detected between original and refactored code.
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
          {fileName || 'Diff View'}
        </span>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.muted }}>
          {totalChanges.deletes > 0 && <span style={{ color: C.red }}>-{totalChanges.deletes}</span>}
          {totalChanges.inserts > 0 && <span style={{ color: C.green }}>+{totalChanges.inserts}</span>}
        </div>
      </div>
      <div style={{ overflowY: 'auto', maxHeight, padding: '8px 0' }}>
        {hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx} style={{ position: 'relative', marginBottom: 4 }}>
            {hunk.lines.map((line, lineIdx) => (
              <DiffLine key={lineIdx} hunk={hunk} line={line} idx={lineIdx} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
