import { describe, it, expect } from 'vitest'
import { parseFile } from '../../../lib/analyze'
import { detectEffectNoDeps } from '../effectNoDeps'

function parse(src: string) {
  return parseFile('test.tsx', src)!
}

describe('detectEffectNoDeps', () => {
  it('flags useEffect with no dependency array', () => {
    const pf = parse(`
      import React, { useEffect } from 'react'
      export function Foo() {
        useEffect(() => { console.warn('effect') })
        return null
      }
    `)
    const issues = detectEffectNoDeps(pf)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].category).toBe('effect-no-deps')
  })

  it('does not flag useEffect with empty dep array', () => {
    const pf = parse(`
      import React, { useEffect } from 'react'
      export function Foo() {
        useEffect(() => { /* once */ }, [])
        return null
      }
    `)
    const issues = detectEffectNoDeps(pf)
    expect(issues.length).toBe(0)
  })
})
