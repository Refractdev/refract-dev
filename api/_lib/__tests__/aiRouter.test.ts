import { describe, expect, it } from 'vitest'
import { MODEL_ROUTES, resolveRoute } from '../ai'

describe('resolveRoute', () => {
  it('routes briefing to Groq fast lane first', () => {
    const route = resolveRoute('briefing')
    expect(route[0]).toEqual({ provider: 'groq', model: 'llama-3.1-8b-instant' })
    expect(route[1]?.provider).toBe('openrouter')
  })

  it('routes explain-code to Groq 70B first with OpenRouter fallback', () => {
    const route = resolveRoute('explain-code')
    expect(route[0]).toEqual({ provider: 'groq', model: 'llama-3.3-70b-versatile' })
    expect(route[1]).toEqual({ provider: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free' })
  })

  it('routes arch-rewrite to OpenRouter code models', () => {
    const route = resolveRoute('arch-rewrite')
    expect(route[0]).toEqual({ provider: 'openrouter', model: 'qwen/qwen3-coder:free' })
    expect(route[1]).toEqual({ provider: 'openrouter', model: 'cohere/north-mini-code:free' })
    expect(route[2]).toEqual({ provider: 'openrouter', model: 'openrouter/free' })
  })

  it('routes arch-plan through OpenRouter then Groq fallback', () => {
    const route = resolveRoute('arch-plan')
    expect(route).toHaveLength(3)
    expect(route[0]?.provider).toBe('openrouter')
    expect(route[2]).toEqual({ provider: 'groq', model: 'llama-3.3-70b-versatile' })
  })

  it('routes arch-repair with Cohere code primary', () => {
    const route = resolveRoute('arch-repair')
    expect(route[0]).toEqual({ provider: 'openrouter', model: 'cohere/north-mini-code:free' })
    expect(route[2]?.provider).toBe('groq')
  })

  it('defines a route for every AI action', () => {
    const actions = [
      'briefing',
      'explain',
      'explain-code',
      'name',
      'refactor',
      'arch-plan',
      'arch-rewrite',
      'arch-repair',
    ] as const

    for (const action of actions) {
      expect(MODEL_ROUTES[action].length).toBeGreaterThan(0)
      expect(resolveRoute(action)).toEqual(MODEL_ROUTES[action])
    }
  })
})
