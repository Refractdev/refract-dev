import { describe, it, expect } from 'vitest'
import { parseFile } from '../../../lib/analyze'
import { detectDuplicateLogic } from '../duplicateLogic'
import { preComputePatches } from '../../../lib/patchComputer'

const DASHBOARD_SNIPPET = `
function formatUserName(first: string, last: string) {
  const trimmedFirst = first.trim()
  const trimmedLast = last.trim()
  return \`\${trimmedFirst} \${trimmedLast}\`.toUpperCase()
}

function formatContactName(first: string, last: string) {
  const trimmedFirst = first.trim()
  const trimmedLast = last.trim()
  return \`\${trimmedFirst} \${trimmedLast}\`.toUpperCase()
}
`

describe('detectDuplicateLogic', () => {
  it('produces advisory suggestion with empty after lines and no patch', () => {
    const pf = parseFile('src/Dashboard.tsx', DASHBOARD_SNIPPET)!
    const cache = new Map([['src/Dashboard.tsx', pf]])
    const issues = detectDuplicateLogic(cache)
    expect(issues.length).toBeGreaterThan(0)

    const issue = issues[0]
    expect(issue.lines.before.length).toBeGreaterThan(1)
    expect(issue.lines.after).toEqual([])
    expect(issue.suggestion).toContain('Lógica duplicada')
    expect(issue.patch).toBeUndefined()

    const processed = preComputePatches([issue])[0]
    expect(processed.patch).toBeUndefined()
    expect(processed.lines.after).toEqual([])
    expect(processed.suggestion).toContain('Lógica duplicada')
  })
})
