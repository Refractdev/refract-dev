import { runAIChat } from '../_lib/ai'
import { getAuthenticatedUserWithOptionalGitHub } from '../_lib/auth'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

  const { filePath, code, context } = req.body

  const systemPrompt = `És um especialista em TypeScript/React.
Explica o código de forma clara, como se estivesses a fazer code review para um colega.
Destaca o propósito do ficheiro, padrões usados, e potenciais problemas.
Responde sempre em português europeu, a não ser que o código esteja em inglês (mantém termos técnicos em inglês).
Máximo 4 parágrafos. Sê direto — sem introduções genéricas.`

  const contextBlock = context
    ? `\n\nContexto:\n- Dependências: ${context.dependencies?.join(', ') ?? 'nenhumas'}\n- Issues conhecidos: ${context.issues ?? 0}\n- Categoria: ${context.category ?? 'desconhecida'}`
    : ''

  const userPrompt = `Ficheiro: ${filePath}\n\`\`\`typescript\n${code.slice(0, 4000)}\n\`\`\`${contextBlock}`

  try {
    const explanation = await runAIChat({
      max_tokens: 512,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    })

    return res.status(200).json({ explanation })
  } catch (err: any) {
    console.error('Explain code error:', err)
    return res.status(500).json({ error: err.message || 'Failed to generate explanation' })
  }
}

