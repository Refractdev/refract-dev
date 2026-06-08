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

export async function runAIChat(options: ChatOptions): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    throw new Error('GROQ_API_KEY is not defined')
  }

  const groq = new Groq({ apiKey: groqKey })
  const model = options.model ?? 'llama-3.3-70b-versatile'

  const msg = await groq.chat.completions.create({
    model: model,
    max_tokens: options.max_tokens ?? 512,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
  })

  return msg.choices[0]?.message?.content ?? ''
}