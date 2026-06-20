import { validateProposalSafety } from '../../lib/api'
import { normalizePath } from '../path'

export interface VirtualValidationResult {
  passed: boolean
  /** Typecheck errors grouped by file path. */
  errorsByFile: Map<string, string[]>
  /** Errors that could not be attributed to a specific file. */
  globalErrors: string[]
}

/** Parses "path:line:col: message" diagnostics into a path + message. */
function parseDiagnostic(line: string): { path: string | null; message: string } {
  const match = line.match(/^(.*?):(?:\d+:\d+:)?\s*(.*)$/)
  if (!match) return { path: null, message: line }
  const path = match[1]?.trim()
  // Heuristic: a real path contains a slash or a known extension.
  if (path && (/[\\/]/.test(path) || /\.(tsx?|jsx?)$/.test(path))) {
    return { path: normalizePath(path), message: match[2] ?? line }
  }
  return { path: null, message: line }
}

/**
 * Runs the in-memory TypeScript validation (api/safety) over the entire virtual
 * file map and returns errors grouped by file. The safety endpoint typechecks
 * every file in `fileMap`, so a single call validates the whole project.
 */
export async function validateVirtualMap(
  fileMap: Map<string, string>,
  projectPath?: string,
): Promise<VirtualValidationResult> {
  const fileObj: Record<string, string> = {}
  for (const [path, content] of fileMap.entries()) {
    fileObj[normalizePath(path)] = content
  }

  const anchor = Object.keys(fileObj)[0]
  if (!anchor) {
    return { passed: true, errorsByFile: new Map(), globalErrors: [] }
  }

  const result = await validateProposalSafety({
    projectPath,
    filePath: anchor,
    before: fileObj[anchor],
    after: fileObj[anchor],
    fileMap: fileObj,
  })

  const errorsByFile = new Map<string, string[]>()
  const globalErrors: string[] = []

  for (const err of result.errors ?? []) {
    const { path, message } = parseDiagnostic(err)
    if (path && fileObj[path] !== undefined) {
      const bucket = errorsByFile.get(path) ?? []
      bucket.push(message)
      errorsByFile.set(path, bucket)
    } else {
      globalErrors.push(message)
    }
  }

  return {
    passed: Boolean(result.passed) && errorsByFile.size === 0 && globalErrors.length === 0,
    errorsByFile,
    globalErrors,
  }
}
