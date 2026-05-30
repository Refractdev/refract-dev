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

  const { projectPath, issues, scannedFiles, guidelines } = req.body

  const total = issues.length
  const high = issues.filter((i: any) => i.impact === 'High').length
  const medium = issues.filter((i: any) => i.impact === 'Medium').length
  const low = issues.filter((i: any) => i.impact === 'Low').length

  const topIssues = issues
    .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 5)
    .map((i: any) => `- ${i.category}: ${i.problem}`)
    .join('\n')

  const systemPrompt = `És o Refract, um assistente de qualidade de código.
Gera um briefing curto (máximo 3 frases) sobre o estado do projeto analisado.
Menciona os problemas mais críticos encontrados e o impacto geral.
Responde sempre em português europeu. Tom direto, sem floreados.`

  const userPrompt = `Projeto: ${projectPath}
Ficheiros analisados: ${scannedFiles.length}
Issues: ${total} total (${high} high, ${medium} medium, ${low} low)

Top issues:
${topIssues}
${guidelines ? `\nGuidelines:\n${guidelines}` : ''}`

  try {
    const msg = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 256,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    })

    const briefing = msg.choices[0]?.message?.content ?? ''
    return res.status(200).json({ briefing })
  } catch (err: any) {
    console.error('Briefing error:', err)
    return res.status(500).json({ error: err.message || 'Failed to generate briefing' })
  }
}
