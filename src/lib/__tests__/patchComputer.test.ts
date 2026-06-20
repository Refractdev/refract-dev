import { describe, it, expect } from 'vitest'
import { preComputePatches, isCommentOnly } from '../patchComputer'

describe('preComputePatches', () => {
  it('normalizes legacy comment-only after lines into suggestion', () => {
    const issue = {
      id: 'test-1',
      file: 'a.ts',
      filePath: 'src/a.ts',
      category: 'duplicate-logic' as const,
      problem: 'duplicate',
      impact: 'Medium' as const,
      lineStart: 1,
      lineEnd: 3,
      lines: {
        before: ['function a() {}'],
        after: ['// comment line\n// another line'],
      },
    }

    const processed = preComputePatches([issue])[0]
    expect(processed.patch).toBeUndefined()
    expect(processed.lines.after).toEqual([])
    expect(processed.suggestion).toBe('comment line\nanother line')
    expect(isCommentOnly(['// only comments'])).toBe(true)
  })
})
