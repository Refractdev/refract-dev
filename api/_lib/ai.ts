import Groq from 'groq-sdk'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AIAction =
  | 'briefing'
  | 'explain'
  | 'explain-code'
  | 'name'
  | 'refactor'
  | 'arch-plan'
  | 'arch-rewrite'
  | 'arch-repair'

export type AIProvider = 'groq' | 'openrouter'

export interface RouteStep {
  provider: AIProvider
  model: string
}

export interface ChatOptions {
  action: AIAction
  max_tokens?: number
  temperature?: number
  messages: ChatMessage[]
}

const GROQ_FAST = 'llama-3.1-8b-instant'
const GROQ_HEAVY = 'llama-3.3-70b-versatile'

export const MODEL_ROUTES: Record<AIAction, RouteStep[]> = {
  briefing: [
    { provider: 'groq', model: GROQ_FAST },
    { provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct:free' },
  ],
  explain: [
    { provider: 'groq', model: GROQ_FAST },
    { provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct:free' },
  ],
  'explain-code': [
    { provider: 'groq', model: GROQ_HEAVY },
    { provider: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free' },
  ],
  name: [
    { provider: 'groq', model: GROQ_FAST },
    { provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct:free' },
  ],
  refactor: [
    { provider: 'groq', model: GROQ_FAST },
    { provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct:free' },
  ],
  'arch-plan': [
    { provider: 'openrouter', model: 'qwen/qwen3-next-80b-a3b-instruct:free' },
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
    { provider: 'groq', model: GROQ_HEAVY },
  ],
  'arch-rewrite': [
    { provider: 'openrouter', model: 'qwen/qwen3-coder:free' },
    { provider: 'openrouter', model: 'cohere/north-mini-code:free' },
    { provider: 'openrouter', model: 'openrouter/free' },
  ],
  'arch-repair': [
    { provider: 'openrouter', model: 'cohere/north-mini-code:free' },
    { provider: 'openrouter', model: 'qwen/qwen3-coder:free' },
    { provider: 'groq', model: GROQ_HEAVY },
  ],
}

export function resolveRoute(action: AIAction): RouteStep[] {
  return MODEL_ROUTES[action]
}

const RETRY_DELAYS_MS = [1000, 2000]
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

async function callGroq(model: string, options: ChatOptions): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY?.trim()
  if (!groqKey) {
    throw new Error('GROQ_API_KEY is not defined')
  }

  const groq = new Groq({ apiKey: groqKey })
  const msg = await groq.chat.completions.create({
    model,
    max_tokens: options.max_tokens ?? 512,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
  })

  return msg.choices[0]?.message?.content ?? ''
}

async function callOpenRouter(model: string, options: ChatOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not defined')
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://refract.app',
      'X-Title': 'Refract',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.max_tokens ?? 512,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const err = new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`)
    ;(err as Error & { status?: number }).status = response.status
    throw err
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}

async function callProvider(step: RouteStep, options: ChatOptions): Promise<string> {
  if (step.provider === 'groq') {
    return callGroq(step.model, options)
  }
  return callOpenRouter(step.model, options)
}

function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}

function isRetryableError(err: unknown): boolean {
  const status = getErrorStatus(err)
  if (status !== undefined) return isRetryableStatus(status)

  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('timeout')
  }
  return false
}

async function callWithRetries(step: RouteStep, options: ChatOptions): Promise<string> {
  let lastError: unknown

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callProvider(step, options)
    } catch (err) {
      lastError = err
      const retryable = isRetryableError(err)
      const hasMoreAttempts = attempt < RETRY_DELAYS_MS.length
      if (!retryable || !hasMoreAttempts) break
      await sleep(RETRY_DELAYS_MS[attempt] ?? 2000)
    }
  }

  throw lastError
}

export async function runAIChat(options: ChatOptions): Promise<string> {
  const route = resolveRoute(options.action)
  const errors: string[] = []

  for (const step of route) {
    console.log(
      `[ai] action=${options.action} provider=${step.provider} model=${step.model}`,
    )
    try {
      return await callWithRetries(step, options)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${step.provider}/${step.model}: ${message}`)
      console.warn(`[ai] fallback action=${options.action} failed ${step.provider}/${step.model}: ${message}`)
    }
  }

  throw new Error(`All AI providers failed for action: ${options.action} — ${errors.join('; ')}`)
}
