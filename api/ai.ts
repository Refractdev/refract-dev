import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAIChat } from './_lib/ai'
import { getAuthenticatedUserWithOptionalGitHub } from './_lib/auth'

// ─── Briefing prompts ─────────────────────────────────────────────────────────

const BRIEFING_PROMPTS: Record<string, { system: string; label: string }> = {
  en: {
    system: `You are Refract, a code quality assistant.
Generate a short briefing (max 3 sentences) about the analyzed project state.
Mention the most critical problems found and the overall impact.
Always respond in English. Direct tone, no fluff.`,
    label: 'English',
  },
  pt: {
    system: `És o Refract, um assistente de qualidade de código.
Gera um briefing curto (máximo 3 frases) sobre o estado do projeto analisado.
Mencionas os problemas mais críticos encontrados e o impacto geral.
Responde sempre em português europeu. Tom direto, sem floreados.`,
    label: 'Português europeu',
  },
  es: {
    system: `Eres Refract, un asistente de calidad de código.
Genera un briefing breve (máximo 3 frases) sobre el estado del proyecto analizado.
Menciona los problemas más críticos encontrados y el impacto general.
Responde siempre en español. Tono directo, sin adornos.`,
    label: 'Español',
  },
  fr: {
    system: `Vous êtes Refract, un assistant de qualité de code.
Générez un bref résumé (3 phrases maximum) sur l'état du projet analysé.
Mentionnez les problèmes les plus critiques et l'impact global.
Répondez toujours en français. Ton direct, sans fioritures.`,
    label: 'Français',
  },
  de: {
    system: `Du bist Refract, ein Assistent für Codequalität.
Erstelle ein kurzes Briefing (maximal 3 Sätze) über den Zustand des analysierten Projekts.
Nenne die kritischsten Probleme und die Gesamtauswirkungen.
Antworte immer auf Deutsch. Direkt, ohne Floskeln.`,
    label: 'Deutsch',
  },
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleBriefing(req: VercelRequest, res: VercelResponse) {
  const { projectPath, issues, scannedFiles, guidelines, language } = req.body

  const total = issues.length
  const high = issues.filter((i: any) => i.impact === 'High').length
  const medium = issues.filter((i: any) => i.impact === 'Medium').length
  const low = issues.filter((i: any) => i.impact === 'Low').length

  const topIssues = issues
    .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 5)
    .map((i: any) => `- ${i.category}: ${i.problem}`)
    .join('\n')

  const briefingLocale = typeof language === 'string' && BRIEFING_PROMPTS[language]
    ? language
    : 'en'
  const systemPrompt = BRIEFING_PROMPTS[briefingLocale].system

  const userPrompt = `Projeto: ${projectPath}
Ficheiros analisados: ${scannedFiles.length}
Issues: ${total} total (${high} high, ${medium} medium, ${low} low)

Top issues:
${topIssues}
${guidelines ? `\nGuidelines:\n${guidelines}` : ''}`

  try {
    const briefing = await runAIChat({
      max_tokens: 256,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    })

    return res.status(200).json({ briefing })
  } catch (err: any) {
    console.error('Briefing error:', err)
    return res.status(500).json({ error: err.message || 'Failed to generate briefing' })
  }
}

async function handleExplain(req: VercelRequest, res: VercelResponse) {
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

async function handleExplainCode(req: VercelRequest, res: VercelResponse) {
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

async function handleName(req: VercelRequest, res: VercelResponse) {
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
    const responseText = await runAIChat({
      max_tokens: 32,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const name = responseText.trim().replace(/[^a-zA-Z0-9]/g, '')
    return res.status(200).json({ name: name || currentName || 'RefactorCandidate' })
  } catch (error: any) {
    console.error('Name suggestion error:', error)
    return res.status(500).json({ error: error.message || 'Failed to suggest name' })
  }
}

async function handleRefactor(req: VercelRequest, res: VercelResponse) {
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
    const responseText = await runAIChat({
      max_tokens: 128,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    })

    const commitMessage = responseText.trim()
    return res.status(200).json({ commitMessage })
  } catch (err: any) {
    console.error('Commit message error:', err)
    return res.status(500).json({ error: err.message || 'Failed to generate commit message' })
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

  const action = req.query.action as string

  switch (action) {
    case 'briefing':
      return handleBriefing(req, res)
    case 'explain':
      return handleExplain(req, res)
    case 'explain-code':
      return handleExplainCode(req, res)
    case 'name':
      return handleName(req, res)
    case 'refactor':
      return handleRefactor(req, res)
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` })
  }
}
