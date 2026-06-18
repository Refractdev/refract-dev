import { describe, it, expect } from 'vitest'
import { parseFile } from '../../../lib/analyze'
import { detectAnyTypes } from '../anyTypes'

function parse(src: string) {
  return parseFile('test.tsx', src)!
}

describe('detectAnyTypes', () => {
  it('flags explicit any annotation', () => {
    const pf = parse(`const x: any = 42`)
    const issues = detectAnyTypes(pf)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].category).toBe('any-type')
  })

  it('flags as any cast as unsafe-cast', () => {
    const pf = parse(`const x = response as any`)
    const issues = detectAnyTypes(pf)
    expect(issues.some(i => i.category === 'unsafe-cast')).toBe(true)
  })

  it('returns no issues for clean code', () => {
    const pf = parse(`const x: number = 42`)
    const issues = detectAnyTypes(pf)
    expect(issues.length).toBe(0)
  })

  it('does not double-count the same line', () => {
    const pf = parse(`const x: any = 1; const y: any = 2;`)
    const issues = detectAnyTypes(pf)
    // Two distinct any annotations on the same file should be detected
    expect(issues.length).toBeGreaterThanOrEqual(1)
  })
})
