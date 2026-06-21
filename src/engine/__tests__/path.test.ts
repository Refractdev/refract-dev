import { describe, expect, it } from 'vitest'
import { canonicalizeEntries, canonicalizePath, normalizePath } from '../path'
import { resolveFileKey } from '../../lib/applyIssuePatch'

describe('path canonicalization', () => {
  it('trims suspicious whitespace from path segments', () => {
    const result = canonicalizePath(' backend//README.md ')

    expect(result.path).toBe('backend/README.md')
    expect(result.suspicious).toBe(true)
  })

  it('deduplicates entries after canonicalization using canonical keys', () => {
    const { map, collisions } = canonicalizeEntries([
      [' backend/README.md', 'first'],
      ['backend/README.md', 'second'],
    ])

    expect(map.get('backend/README.md')).toBe('second')
    expect(collisions).toEqual([
      { canonicalPath: 'backend/README.md', discardedPath: 'backend/README.md' },
    ])
  })

  it('normalizes relative segments consistently', () => {
    expect(normalizePath('./src//components/../App.tsx')).toBe('src/App.tsx')
  })
})

describe('resolveFileKey', () => {
  it('matches only the exact canonical file path', () => {
    const fileMap = new Map<string, string>([
      ['backend/README.md', 'backend readme'],
      ['README.md', 'root readme'],
    ])

    expect(resolveFileKey('/README.md', fileMap)).toBe('README.md')
    expect(resolveFileKey('docs/README.md', fileMap)).toBeNull()
  })
})
