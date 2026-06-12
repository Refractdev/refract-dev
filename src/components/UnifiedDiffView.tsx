import React, { useMemo } from 'react'
import { buildDiffHunks, type DiffHunk } from '../lib/diff'

const C = {
    bg: 'var(--background)',
    surface: 'var(--card)',
    surfaceHover: 'var(--accent)',
    border: 'var(--border)',
    text: 'var(--foreground)',
    muted: 'var(--muted-foreground)',
    green: 'var(--semantic-success)',
    red: '#ff5577',
}

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
        ? 'rgba(255, 91, 79, 0.06)'
        : isInsert
            ? 'rgba(74, 222, 128, 0.06)'
            : 'transparent'

    const textColor = isDelete
        ? '#ff8f8a'
        : isInsert
            ? '#a3f3be'
            : 'var(--foreground)'

    const gutterColor = isDelete
        ? 'rgba(255, 91, 79, 0.4)'
        : isInsert
            ? 'rgba(74, 222, 128, 0.4)'
            : 'var(--muted-foreground)'

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
                fontFamily: 'Geist Mono, monospace',
                fontSize: 12,
                lineHeight: 1.6,
            }}
        >
            {/* Hunk header */}
            {isFirst && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: -20,
                        height: 20,
                        background: 'rgba(59, 130, 246, 0.08)',
                        borderTop: '1px solid rgba(59, 130, 246, 0.15)',
                        borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 12px',
                        fontSize: 10,
                        color: 'var(--ring)',
                        fontFamily: 'Geist Mono, monospace',
                        fontWeight: 500,
                    }}
                >
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </div>
            )}

            {/* Line numbers */}
            <div
                style={{
                    width: GUTTER_WIDTH,
                    textAlign: 'right',
                    color: gutterColor,
                    fontSize: 10,
                    userSelect: 'none',
                    flexShrink: 0,
                    paddingRight: 8,
                }}
            >
                {line.oldLineNo ?? ''}
            </div>
            <div
                style={{
                    width: GUTTER_WIDTH,
                    textAlign: 'right',
                    color: gutterColor,
                    fontSize: 10,
                    userSelect: 'none',
                    flexShrink: 0,
                    paddingRight: 8,
                }}
            >
                {line.newLineNo ?? ''}
            </div>

            {/* Prefix */}
            <span style={{ width: 12, color: prefixColor, flexShrink: 0, textAlign: 'center', userSelect: 'none' }}>
                {prefix}
            </span>

            {/* Content */}
            <pre
                style={{
                    margin: 0,
                    color: textColor,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    flex: 1,
                }}
            >
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
            <div
                style={{
                    padding: 24,
                    textAlign: 'center',
                    color: C.muted,
                    fontSize: 13,
                    border: `1px dashed ${C.border}`,
                    borderRadius: 8,
                    background: C.surface,
                }}
            >
                No changes detected between original and refactored code.
            </div>
        )
    }

    return (
        <div
            style={{
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: 'hidden',
                background: C.bg,
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: C.surface,
                    borderBottom: `1px solid ${C.border}`,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
                        {fileName || 'Diff View'}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.muted }}>
                    <span style={{ color: C.red }}>
                        -{totalChanges.deletes}
                    </span>
                    <span style={{ color: C.green }}>
                        +{totalChanges.inserts}
                    </span>
                </div>
            </div>

            {/* Diff content */}
            <div
                style={{
                    overflowY: 'auto',
                    maxHeight,
                    padding: '8px 0',
                }}
            >
                {hunks.map((hunk, hunkIdx) => (
                    <div key={hunkIdx} style={{ position: 'relative', marginBottom: 4 }}>
                        {hunk.lines.map((line, lineIdx) => (
                            <DiffLine
                                key={lineIdx}
                                hunk={hunk}
                                line={line}
                                idx={lineIdx}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}