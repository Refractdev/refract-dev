import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAIChat } from '../_lib/ai'
import { getAuthenticatedUserWithOptionalGitHub } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

  const { issue, fileSource, guidelines } = req.body

  const systemPrompt = `És um especialista em qualidade de código TypeScript/React.
Explica de forma clara e concisa (máximo 2 frases) porque o problema detetado é importante e qual o impacto real no projeto.
Responde sempre em português europeu.
Sê direto — sem introduções nem conclusões genéricas.`

  const userPrompt = `Problema: ${issue.category} — ${issue.problem}
Impacto: ${issue.impact}
Contexto do ficheiro:
${fileSource || issue.lines.before?.join('\n') || ''}
${guidelines ? `\nGuidelines:\n${guidelines}` : ''}`

  try {
    const explanation = await runAIChat({
      max_tokens: 256,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    })

    return res.status(200).json({ explanation })
  } catch (err: any) {
    console.error('Explain error:', err)
    return res.status(500).json({ error: err.message || 'Failed to generate explanation' })
  }
}
