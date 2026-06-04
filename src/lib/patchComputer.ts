import type { Issue } from './analyze'

function isCommentOnly(lines: string[]): boolean {
  const text = lines.join('\n').trim()
  if (!text) return true
  return text
    .split('\n')
    .every((line) => line.trim().startsWith('//') || line.trim() === '')
}

function hasMeaningfulPatch(issue: Issue): boolean {
  const after = issue.patch?.after
  if (!after) return false
  if (after.trim().length === 0) return false
  if (after.trim().split('\n').every((l) => l.trim().startsWith('//'))) return false
  return true
}

/**
 * Promove para `issue.patch` somente quando o detector já gerou `lines.after`
 * com código real (não placeholders/comentários).
 */
export function preComputePatches(issues: Issue[]): Issue[] {
  return issues.map((issue) => {
    // Já tem patch válido: não altera
    if (hasMeaningfulPatch(issue)) return issue

    const afterLines = issue.lines.after ?? []
    if (afterLines.length === 0) {
      return { ...issue, patch: undefined }
    }

    if (isCommentOnly(afterLines)) {
      return { ...issue, patch: undefined }
    }

    const beforeText = (issue.lines.before ?? []).join('\n')
    const afterText = afterLines.join('\n')

    return {
      ...issue,
      patch: {
        before: beforeText,
        after: afterText,
      },
    }
  })
}

