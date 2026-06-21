import type { AnalysisIssue } from '../shared/types'
import { normalizePath } from '../engine/path'

export type Decision = 'accepted' | 'rejected'

/**
 * Resolve the fileMap key that matches an issue's filePath, tolerating
 * differences in leading slashes / nested prefixes (same logic the UI uses).
 */
export function resolveFileKey(filePath: string, fileMap: Map<string, string>): string | null {
  const normalizedFilePath = normalizePath(filePath)
  for (const key of fileMap.keys()) {
    const normalizedKey = normalizePath(key)
    if (normalizedKey === normalizedFilePath) {
      return key
    }
  }
  return null
}

/**
 * True when the issue carries a real, applicable code change (a fix or a
 * deletion), as opposed to advisory-only issues with no `after` content.
 */
export function hasApplicablePatch(issue: AnalysisIssue): boolean {
  const after = issue.patch?.after
  if (after === undefined) {
    // No precomputed patch: fall back to lines. A deletion is applicable.
    const beforeLines = issue.lines?.before ?? []
    const afterLines = issue.lines?.after ?? []
    if (afterLines.length === 0 && beforeLines.length > 0) return true
    return afterLines.length > 0
  }
  // Deletion (after === '') is applicable as long as we have something to remove.
  if (after === '') return (issue.lines?.before ?? []).length > 0 || Boolean(issue.patch?.before)
  return after.trim().length > 0
}

/** The text we expect to replace (original) for this issue. */
function patchBefore(issue: AnalysisIssue): string {
  if (issue.patch?.before !== undefined) return issue.patch.before
  return (issue.lines?.before ?? []).join('\n')
}

/** The replacement text for this issue ('' means delete the matched lines). */
function patchAfter(issue: AnalysisIssue): string {
  if (issue.patch?.after !== undefined) return issue.patch.after
  return (issue.lines?.after ?? []).join('\n')
}

/**
 * Apply a single issue's patch to a file's content.
 *
 * Strategy:
 *  1. Try a precise line-range splice using `lineStart`/`lineEnd`, validated
 *     against the expected `before` text.
 *  2. Fall back to a single string replacement of `before` -> `after`.
 *
 * Returns the new content, or the original content unchanged if the patch
 * couldn't be located (so callers can detect "no change").
 */
export function applyIssuePatchToContent(content: string, issue: AnalysisIssue): string {
  if (!hasApplicablePatch(issue)) return content

  const before = patchBefore(issue)
  const after = patchAfter(issue)
  if (before === after) return content

  const lines = content.split('\n')
  const start = issue.lineStart
  const end = issue.lineEnd

  // 1) Precise line-range splice, validated against expected `before`.
  if (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 1 &&
    end >= start &&
    end <= lines.length
  ) {
    const slice = lines.slice(start - 1, end).join('\n')
    if (slice.trim() === before.trim()) {
      const replacement = after === '' ? [] : after.split('\n')
      const next = [...lines.slice(0, start - 1), ...replacement, ...lines.slice(end)]
      return next.join('\n')
    }
  }

  // 2) Fallback: replace the first exact occurrence of `before`.
  if (before && content.includes(before)) {
    return content.replace(before, after)
  }

  return content
}

/**
 * Apply every accepted issue that carries an applicable patch to a copy of the
 * provided fileMap. Patches are grouped per file and applied bottom-up (largest
 * `lineStart` first) so earlier edits don't invalidate later line offsets.
 *
 * Returns a new Map; the input map is never mutated.
 */
export function applyAcceptedPatches(
  fileMap: Map<string, string>,
  issues: AnalysisIssue[],
  decisions: Record<string, Decision>,
): Map<string, string> {
  const nextMap = new Map(fileMap)

  const accepted = issues.filter(
    (issue) => decisions[issue.id] === 'accepted' && hasApplicablePatch(issue),
  )
  if (accepted.length === 0) return nextMap

  const byFile = new Map<string, AnalysisIssue[]>()
  for (const issue of accepted) {
    const key = resolveFileKey(issue.filePath, nextMap)
    if (!key) continue
    const group = byFile.get(key) ?? []
    group.push(issue)
    byFile.set(key, group)
  }

  for (const [key, group] of byFile) {
    let content = nextMap.get(key)
    if (content === undefined) continue
    const ordered = [...group].sort((a, b) => b.lineStart - a.lineStart)
    for (const issue of ordered) {
      content = applyIssuePatchToContent(content, issue)
    }
    nextMap.set(key, content)
  }

  return nextMap
}
