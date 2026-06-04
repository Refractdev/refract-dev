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

const hfModel = 'meta-llama/Llama-3.3-70B-Instruct'

async function runHF(options: ChatOptions): Promise<string> {
  const hfKey = process.env.HUGGINGFACE_API_KEY
  if (!hfKey) {
    throw new Error('HUGGINGFACE_API_KEY is not defined')
  }

  const url = `https://api-inference.huggingface.co/models/${hfModel}/v1/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${hfKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: hfModel,
      messages: options.messages,
      max_tokens: options.max_tokens ?? 512,
      temperature: options.temperature ?? 0.2,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Hugging Face API error (status ${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function runGroq(options: ChatOptions): Promise<string> {
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

export async function runAIChat(options: ChatOptions): Promise<string> {
  const hasHF = !!process.env.HUGGINGFACE_API_KEY
  const hasGroq = !!process.env.GROQ_API_KEY

  if (!hasHF && !hasGroq) {
    throw new Error('Neither HUGGINGFACE_API_KEY nor GROQ_API_KEY is defined')
  }

  const errors: Error[] = []
  const tryHFFirst = hasHF && (!hasGroq || Math.random() < 0.5)
  const order = tryHFFirst ? ['hf', 'groq'] : ['groq', 'hf']

  for (const provider of order) {
    try {
      if (provider === 'hf' && hasHF) {
        console.log('[AI] Trying Hugging Face inference...')
        return await runHF(options)
      }
      if (provider === 'groq' && hasGroq) {
        console.log('[AI] Trying Groq SDK...')
        return await runGroq(options)
      }
    } catch (err: any) {
      console.warn(`[AI] Provider ${provider} failed:`, err)
      errors.push(err)
    }
  }

  throw new Error(`All AI providers failed: ${errors.map((e) => e.message).join('; ')}`)
}
