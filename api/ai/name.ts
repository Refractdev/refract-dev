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

  const { kind, filePath, currentName, ownerName, symbols, guidelines } = req.body ?? {}
  const systemPrompt = `És um especialista em naming semântico para TypeScript e React.
Devolve apenas um nome em PascalCase.
Sem markdown. Sem explicações. Sem prefixos extra.`

  const userPrompt = [
    `Tipo: ${kind === 'hook' ? 'custom hook' : 'React component'}`,
    `Ficheiro: ${filePath}`,
    `Componente dono: ${ownerName}`,
    `Nome atual: ${currentName}`,
    `Símbolos usados: ${Array.isArray(symbols) ? symbols.join(', ') : ''}`,
    guidelines ? `Guidelines de Naming:\n${guidelines}` : '',
    'Responde apenas com um nome curto e concreto em PascalCase.',
  ].filter(Boolean).join('\n')

  try {
    const msg = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 32,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const name = (msg.choices[0]?.message?.content ?? '').trim().replace(/[^a-zA-Z0-9]/g, '')
    return res.status(200).json({ name: name || currentName || 'RefactorCandidate' })
  } catch (error: any) {
    console.error('Name suggestion error:', error)
    return res.status(500).json({ error: error.message || 'Failed to suggest name' })
  }
}
