import { describe, it, expect } from 'vitest'
import { parseFile } from '../../../lib/analyze'
import { detectDeadState } from '../deadState'

function parse(src: string) {
  return parseFile('test.tsx', src)!
}

describe('detectDeadState', () => {
  it('flags state that is never read and setter is never called', () => {
    // Both var and setter appear only once (in the destructuring declaration)
    const pf = parse(`
import React, { useState } from 'react'
export function Foo() {
  const [ghost, setGhost] = useState(false)
  return <div />
}
    `)
    const issues = detectDeadState(pf)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.category === 'dead-state')).toBe(true)
  })

  it('does not flag state that is both read and has setter called', () => {
    const pf = parse(`
import React, { useState } from 'react'
export function Foo() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
    `)
    const issues = detectDeadState(pf)
    // count and setCount are both used
    expect(issues.every(i => !i.id.includes('dead-state-'))).toBe(true)
  })

  it('returns category dead-state for all flagged issues', () => {
    const pf = parse(`
import React, { useState } from 'react'
export function Foo() {
  const [unused, setUnused] = useState(0)
  return null
}
    `)
    const issues = detectDeadState(pf)
    for (const issue of issues) {
      expect(issue.category).toBe('dead-state')
    }
  })

  it('each issue has required fields', () => {
    const pf = parse(`
import React, { useState } from 'react'
export function Foo() {
  const [phantom, setPhantom] = useState(null)
  return null
}
    `)
    const issues = detectDeadState(pf)
    for (const issue of issues) {
      expect(issue.id).toBeTruthy()
      expect(issue.file).toBeTruthy()
      expect(issue.filePath).toBeTruthy()
      expect(issue.lineStart).toBeGreaterThan(0)
    }
  })
})
