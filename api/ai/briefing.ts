import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAIChat } from '../_lib/ai'
import { getAuthenticatedUserWithOptionalGitHub } from '../_lib/auth'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

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
