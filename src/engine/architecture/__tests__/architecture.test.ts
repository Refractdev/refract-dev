import { describe, it, expect } from 'vitest'
import { profileArchitecture } from '../profiler'
import { recommendBlueprint, getBlueprint } from '../blueprints'
import { buildDeterministicPlan } from '../placement'
import { parseArchitecturePlan } from '../schema'

function flatProject(): Map<string, string> {
  return new Map([
    ['package.json', JSON.stringify({ dependencies: { react: '18', vite: '5' }, devDependencies: { typescript: '5' } })],
    ['src/App.tsx', 'export function App() { return null }'],
    ['src/helpers.ts', 'export const x = 1'],
    ['src/api.ts', 'export const get = () => fetch("/x")'],
  ])
}

describe('profileArchitecture', () => {
  it('detects react + vite + typescript on a flat project', () => {
    const profile = profileArchitecture(flatProject())
    expect(profile.framework).toBe('react')
    expect(profile.buildTool).toBe('vite')
    expect(profile.language).toBe('typescript')
    expect(profile.structure.kind).toBe('flat')
  })
})

describe('recommendBlueprint', () => {
  it('recommends clean-layered for a flat project', () => {
    const profile = profileArchitecture(flatProject())
    expect(recommendBlueprint(profile)).toBe('clean-layered')
  })
})

describe('buildDeterministicPlan', () => {
  it('produces moves into blueprint layers and leaves entrypoints unchanged', () => {
    const fileMap = new Map([
      ['src/main.tsx', 'render()'],
      ['src/components/Button.tsx', 'export const Button = () => null'],
      ['src/services/api.ts', 'export const api = {}'],
    ])
    const plan = buildDeterministicPlan(fileMap, getBlueprint('clean-layered'))
    expect(plan.moves.length).toBeGreaterThan(0)
    expect(plan.unchanged).toContain('src/main.tsx')
    const buttonMove = plan.moves.find((m) => m.from === 'src/components/Button.tsx')
    expect(buttonMove?.layer).toBe('presentation')
  })
})

describe('parseArchitecturePlan', () => {
  it('parses fenced JSON output from the LLM', () => {
    const raw = '```json\n{"blueprintId":"clean-layered","moves":[{"from":"src/a.ts","to":"src/domain/a.ts","layer":"domain"}]}\n```'
    const plan = parseArchitecturePlan(raw, 'clean-layered')
    expect(plan.blueprintId).toBe('clean-layered')
    expect(plan.moves[0].to).toBe('src/domain/a.ts')
    expect(plan.moves[0].needsRewrite).toBe(false)
  })

  it('throws on unrecoverable output', () => {
    expect(() => parseArchitecturePlan('not json at all', 'clean-layered')).toThrow()
  })
})
