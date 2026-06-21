import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAIChat, AIRateLimitError } from './_lib/ai'
import { getAuthenticatedUserWithOptionalGitHub } from './_lib/auth'
import { checkRateLimit, applyRateLimitHeaders } from './_lib/ratelimit'

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
      action: 'briefing',
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

/**
 * Extract a small window of source around the issue instead of sending the
 * whole file. This keeps each explain request well under the Groq TPM budget.
 */
function buildIssueContext(issue: any, fileSource: string | undefined): string {
  // Prefer the detector's `before` lines — they're already the relevant snippet.
  const beforeSnippet = issue?.lines?.before?.join('\n')
  if (beforeSnippet && beforeSnippet.trim()) return beforeSnippet.slice(0, 1500)

  if (!fileSource) return ''

  const lines = fileSource.split('\n')
  const start = Math.max(0, (issue?.lineStart ?? 1) - 1 - 25)
  const end = Math.min(lines.length, (issue?.lineEnd ?? issue?.lineStart ?? 1) + 25)
  return lines.slice(start, end).join('\n').slice(0, 1500)
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
${buildIssueContext(issue, fileSource)}
${guidelines ? `\nGuidelines:\n${guidelines}` : ''}`

  try {
    const explanation = await runAIChat({
      action: 'explain',
      max_tokens: 256,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    })

    return res.status(200).json({ explanation })
  } catch (err: any) {
    if (err instanceof AIRateLimitError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds))
      return res.status(429).json({ error: err.message, reset: err.retryAfterSeconds })
    }
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
      action: 'explain-code',
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
      action: 'name',
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
      action: 'refactor',
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

// ─── Architecture refactor handlers ────────────────────────────────────────────

async function handleArchPlan(req: VercelRequest, res: VercelResponse) {
  const { profile, blueprint, tree, signals } = req.body ?? {}

  if (!blueprint || !tree) {
    return res.status(400).json({ error: 'Missing required parameters (blueprint, tree)' })
  }

  const layerList = (blueprint.layers ?? [])
    .map((l: any) => `- ${l.id}: ${l.description} (pode importar de: ${(l.canImportFrom ?? []).join(', ') || 'nada'})`)
    .join('\n')
  const hints = (blueprint.placementHints ?? [])
    .map((h: any) => `- pasta/papel "${h.match}" -> camada "${h.layer}"`)
    .join('\n')

  const systemPrompt = `És um arquiteto de software especialista em TypeScript/React.
Recebes a estrutura atual de um projeto e um blueprint de arquitetura alvo.
Produzes um PLANO de reestruturação que move cada ficheiro para a camada correta do blueprint, SEM quebrar o código.

Regras:
- Responde APENAS com JSON válido, sem markdown, sem comentários.
- Não inventes ficheiros que não existem na árvore.
- Os caminhos "to" devem começar pela root do blueprint e respeitar as camadas.
- Marca needsRewrite=true só quando o conteúdo precisa de mudar (ex.: imports internos que mudam de forma não trivial); movimentos simples são needsRewrite=false.
- Usa "newFiles" para barrels (index.ts) que exponham a API pública de cada camada/módulo.
- Inclui em "unchanged" ficheiros de config/entrypoints que não devem mover.

Schema de resposta:
{
  "blueprintId": "${blueprint.id}",
  "summary": "string curta",
  "moves": [{"from":"src/x.ts","to":"src/domain/x.ts","layer":"domain","needsRewrite":false,"reason":"..."}],
  "newFiles": [{"path":"src/domain/index.ts","kind":"barrel","description":"..."}],
  "unchanged": ["src/main.tsx"],
  "warnings": ["..."]
}`

  const userPrompt = `Blueprint alvo: ${blueprint.name} (${blueprint.id})
${blueprint.summary}

Camadas:
${layerList}

Hints de colocação:
${hints}

Perfil detetado: framework=${profile?.framework ?? 'unknown'}, estrutura=${profile?.structure?.kind ?? 'unknown'}, ficheiros=${profile?.structure?.codeFileCount ?? '?'}

${signals ? `Sinais da análise (problemas detetados):\n${signals}\n` : ''}
Árvore de ficheiros (caminhos):
${tree}

Devolve o plano JSON.`

  try {
    const responseText = await runAIChat({
      action: 'arch-plan',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    return res.status(200).json({ plan: responseText })
  } catch (err: any) {
    console.error('Arch plan error:', err)
    return res.status(500).json({ error: err.message || 'Failed to generate architecture plan' })
  }
}

async function handleArchRewrite(req: VercelRequest, res: VercelResponse) {
  const { filePath, targetPath, source, layer, importRewrites, guidelines } = req.body ?? {}

  if (!filePath || source === undefined) {
    return res.status(400).json({ error: 'Missing required parameters (filePath, source)' })
  }

  const systemPrompt = `És um especialista em refactoring TypeScript/React.
Reescreves UM ficheiro para se adequar à nova arquitetura, preservando exatamente o comportamento.

Regras:
- Responde APENAS com o código final do ficheiro, sem markdown, sem fences, sem explicações.
- Mantém a mesma lógica e exports públicos.
- Atualiza apenas imports internos/relativos para os novos caminhos indicados.
- Não adiciones dependências novas. Não mudes a API pública.`

  const rewriteList = Array.isArray(importRewrites) && importRewrites.length > 0
    ? importRewrites.map((r: any) => `- "${r.from}" -> "${r.to}"`).join('\n')
    : '(sem mudanças de import conhecidas — ajusta só se necessário)'

  const userPrompt = `Ficheiro atual: ${filePath}
Novo caminho: ${targetPath ?? filePath}
Camada alvo: ${layer ?? 'n/a'}

Reescritas de import a aplicar:
${rewriteList}
${guidelines ? `\nGuidelines:\n${guidelines}\n` : ''}
Código original:
${source}

Devolve o código final do ficheiro.`

  try {
    const responseText = await runAIChat({
      action: 'arch-rewrite',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    return res.status(200).json({ content: stripCodeFences(responseText) })
  } catch (err: any) {
    console.error('Arch rewrite error:', err)
    return res.status(500).json({ error: err.message || 'Failed to rewrite file' })
  }
}

async function handleArchRepair(req: VercelRequest, res: VercelResponse) {
  const { filePath, source, errors } = req.body ?? {}

  if (!filePath || source === undefined) {
    return res.status(400).json({ error: 'Missing required parameters (filePath, source)' })
  }

  const errorList = Array.isArray(errors) ? errors.join('\n') : String(errors ?? '')

  const systemPrompt = `És um especialista em TypeScript.
Corriges erros de compilação num ficheiro, mudando o MÍNIMO possível e preservando o comportamento.

Regras:
- Responde APENAS com o código final do ficheiro, sem markdown, sem fences, sem explicações.
- Corrige só o que causa os erros indicados (tipicamente imports/typings).
- Não mudes a API pública nem a lógica.`

  const userPrompt = `Ficheiro: ${filePath}

Erros do typecheck:
${errorList}

Código atual:
${source}

Devolve o código corrigido do ficheiro.`

  try {
    const responseText = await runAIChat({
      action: 'arch-repair',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    return res.status(200).json({ content: stripCodeFences(responseText) })
  } catch (err: any) {
    console.error('Arch repair error:', err)
    return res.status(500).json({ error: err.message || 'Failed to repair file' })
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/)
  return (fenced ? fenced[1] : trimmed).trim()
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let userId: string
  let plan: string
  try {
    const auth = await getAuthenticatedUserWithOptionalGitHub(req.headers.authorization)
    userId = auth.user.id
    plan = auth.plan
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' })
  }

  const rateResult = await checkRateLimit(userId, plan, 'ai')
  applyRateLimitHeaders(res, rateResult)
  if (!rateResult.success) {
    return res.status(429).json({
      error: 'Too many requests. Please wait before trying again.',
      reset: rateResult.reset,
    })
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
    case 'arch-plan':
      return handleArchPlan(req, res)
    case 'arch-rewrite':
      return handleArchRewrite(req, res)
    case 'arch-repair':
      return handleArchRepair(req, res)
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` })
  }
}
