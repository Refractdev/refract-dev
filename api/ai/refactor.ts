import Groq from 'groq-sdk'
import { getAuthenticatedUserWithOptionalGitHub } from '../_lib/auth'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

  const { issue, fileSource, guidelines } = req.body

  const systemPrompt = `És um especialista em mensagens de commit para TypeScript/React.
Gera uma mensagem de commit concisa (máximo 1 linha) em português europeu.
Formato: verbo no infinitivo + descrição curta do que foi feito.
Exemplo: "Corrigir componente UserCard para usar props tipadas"
Não incluas explicações. Não uses markdown. Apenas a mensagem.`

  const userPrompt = `Issue: ${issue.category} — ${issue.problem}
Ficheiro: ${issue.file}
Impacto: ${issue.impact}
Contexto:
${fileSource || issue.lines.before?.join('\n') || ''}
${guidelines ? `\nGuidelines:\n${guidelines}` : ''}`

  try {
    const msg = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 128,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    })

    const commitMessage = (msg.choices[0]?.message?.content ?? '').trim()
    return res.status(200).json({ commitMessage })
  } catch (err: any) {
    console.error('Commit message error:', err)
    return res.status(500).json({ error: err.message || 'Failed to generate commit message' })
  }
}
