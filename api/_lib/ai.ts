import Groq from 'groq-sdk'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  messages: ChatMessage[]
}

/** Thrown when Groq keeps returning 429 after exhausting retries. */
export class AIRateLimitError extends Error {
  retryAfterSeconds: number
  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.name = 'AIRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const MAX_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function parseRetryAfter(err: any): number | null {
  const header = err?.headers?.['retry-after']
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return seconds
  }
  // Groq also embeds "try again in 8.32s" in the message.
  const msg: string = err?.error?.error?.message ?? err?.message ?? ''
  const match = msg.match(/try again in ([\d.]+)s/i)
  if (match) {
    const seconds = Number(match[1])
    if (Number.isFinite(seconds)) return seconds
  }
  return null
}

export async function runAIChat(options: ChatOptions): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    throw new Error('GROQ_API_KEY is not defined')
  }

  const groq = new Groq({ apiKey: groqKey })
  const model = options.model ?? 'llama-3.3-70b-versatile'

  let lastError: any = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const msg = await groq.chat.completions.create({
        model: model,
        max_tokens: options.max_tokens ?? 512,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
      })
      return msg.choices[0]?.message?.content ?? ''
    } catch (err: any) {
      lastError = err
      if (err?.status !== 429 || attempt === MAX_RETRIES) break

      // Honor Groq's retry hint; otherwise exponential backoff (capped).
      const retryAfter = parseRetryAfter(err)
      const backoffMs = retryAfter != null
        ? Math.min(retryAfter * 1000, 15_000)
        : Math.min(1000 * 2 ** attempt, 8_000)
      console.warn(`[ai] Groq 429 — retrying in ${Math.round(backoffMs / 100) / 10}s (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await sleep(backoffMs)
    }
  }

  if (lastError?.status === 429) {
    const retryAfter = parseRetryAfter(lastError) ?? 10
    throw new AIRateLimitError(
      'AI rate limit reached. Please wait a moment and try again.',
      retryAfter,
    )
  }
  throw lastError
}