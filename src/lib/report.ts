import type { AnalysisIssue, AnalysisResult } from '../shared/types'

interface ReportOptions {
  projectName?: string
  branch?: string
  language?: 'en' | 'pt'
}

const CATEGORY_LABELS: Record<string, { en: string; pt: string }> = {
  'oversized-component': { en: 'Oversized Component', pt: 'Componente Sobredimensionado' },
  'any-type': { en: 'Any Type', pt: 'Tipo Any' },
  'dead-state': { en: 'Dead State', pt: 'Estado Morto' },
  'missing-docs': { en: 'Missing Documentation', pt: 'Documentação em Falta' },
  'console-log': { en: 'Console Log', pt: 'Console Log' },
  'effect-no-deps': { en: 'Effect Missing Dependencies', pt: 'Effect sem Dependências' },
  'prop-drilling': { en: 'Prop Drilling', pt: 'Prop Drilling' },
  'generic-naming': { en: 'Generic Naming', pt: 'Nomenclatura Genérica' },
  'circular-dep': { en: 'Circular Dependency', pt: 'Dependência Circular' },
  'state-explosion': { en: 'State Explosion', pt: 'Explosão de Estado' },
  'api-in-component': { en: 'API Call in Component', pt: 'API no Componente' },
  'missing-error-boundary': { en: 'Missing Error Boundary', pt: 'Missing Error Boundary' },
  'memory-leak': { en: 'Memory Leak', pt: 'Memory Leak' },
  'duplicate-logic': { en: 'Duplicate Logic', pt: 'Lógica Duplicada' },
  'unsafe-cast': { en: 'Unsafe Cast', pt: 'Cast Inseguro' },
}

function catLabel(category: string, lang: 'en' | 'pt'): string {
  return CATEGORY_LABELS[category]?.[lang] ?? category
}

function scoreFromIssues(total: number, high: number, medium: number, low: number): number {
  return Math.max(0, Math.min(100, 100 - (high * 10 + medium * 4 + low * 1)))
}

function impactBadge(impact: 'High' | 'Medium' | 'Low'): string {
  if (impact === 'High') return '🔴'
  if (impact === 'Medium') return '🟡'
  return '🟢'
}

export function generateReport(result: AnalysisResult, options: ReportOptions = {}): string {
  const lang = options.language ?? 'en'
  const isPt = lang === 'pt'
  const score = scoreFromIssues(result.summary.total, result.summary.high, result.summary.medium, result.summary.low)

  const lines: string[] = []

  // Title
  lines.push(`# ${isPt ? 'Relatório de Análise' : 'Analysis Report'}${options.projectName ? `: ${options.projectName}` : ''}`)
  lines.push('')

  // Metadata
  lines.push(`> ${isPt ? 'Gerado em' : 'Generated'}: ${new Date().toISOString().split('T')[0]}`)
  if (options.projectName) lines.push(`> ${isPt ? 'Projeto' : 'Project'}: ${options.projectName}`)
  if (options.branch) lines.push(`> Branch: ${options.branch}`)
  lines.push(`> ${isPt ? 'Ficheiros analisados' : 'Files analyzed'}: ${result.scannedFiles.length}`)
  lines.push('')

  // Summary
  lines.push('## 📊 Summary')
  lines.push('')
  lines.push(`| ${isPt ? 'Métrica' : 'Metric'} | ${isPt ? 'Valor' : 'Value'} |`)
  lines.push('|---|---|')
  lines.push(`| **${isPt ? 'Pontuação de Saúde' : 'Health Score'}** | ${score}/100 |`)
  lines.push(`| **${isPt ? 'Total de Problemas' : 'Total Issues'}** | ${result.summary.total} |`)
  lines.push(`| 🔴 **${isPt ? 'Alto Impacto' : 'High Impact'}** | ${result.summary.high} |`)
  lines.push(`| 🟡 **${isPt ? 'Médio Impacto' : 'Medium Impact'}** | ${result.summary.medium} |`)
  lines.push(`| 🟢 **${isPt ? 'Baixo Impacto' : 'Low Impact'}** | ${result.summary.low} |`)
  lines.push('')

  // Score bar (visual)
  const barLen = 30
  const filled = Math.round((score / 100) * barLen)
  const empty = barLen - filled
  const barColor = score >= 80 ? '🟩' : score >= 50 ? '🟨' : '🟥'
  lines.push(`\`${barColor.repeat(filled)}⬜`.repeat(empty)}\` **${score}/100**`)
  lines.push('')

  // Issues by category
  const byCategory = new Map<string, AnalysisIssue[]>()
  for (const issue of result.issues) {
    const list = byCategory.get(issue.category) ?? []
    list.push(issue)
    byCategory.set(issue.category, list)
  }

  if (byCategory.size > 0) {
    lines.push('## 🔍 Issues Found')
    lines.push('')

    const sorted = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)

    for (const [category, issues] of sorted) {
      const high = issues.filter(i => i.impact === 'High').length
      const med = issues.filter(i => i.impact === 'Medium').length
      const low = issues.filter(i => i.impact === 'Low').length
      const badge = high > 0 ? '🔴' : med > 0 ? '🟡' : '🟢'

      lines.push(`### ${badge} ${catLabel(category, lang)} (${issues.length})`)
      lines.push('')

      for (const issue of issues) {
        lines.push(`- ${impactBadge(issue.impact)} \`${issue.file}:${issue.lineStart}\` — ${issue.problem}`)
        lines.push(`  - ${isPt ? 'Impacto' : 'Impact'}: **${issue.impact}**`)
        if (issue.lines.before.length > 0) {
          lines.push('  ```typescript')
          lines.push(...issue.lines.before.map(l => `  ${l}`))
          lines.push('  ```')
        }
        lines.push('')
      }
    }
  }

  // Files table
  const fileIssueCounts = new Map<string, number>()
  for (const issue of result.issues) {
    fileIssueCounts.set(issue.file, (fileIssueCounts.get(issue.file) ?? 0) + 1)
  }

  if (fileIssueCounts.size > 0) {
    lines.push('## 📁 Files')
    lines.push('')
    lines.push(`| ${isPt ? 'Ficheiro' : 'File'} | ${isPt ? 'Problemas' : 'Issues'} |`)
    lines.push('|---|---|')
    const sortedFiles = [...fileIssueCounts.entries()].sort((a, b) => b[1] - a[1])
    for (const [file, count] of sortedFiles) {
      lines.push(`| \`${file}\` | ${count} |`)
    }
    lines.push('')
  }

  // Dependencies
  if (result.dependencies && Object.keys(result.dependencies).length > 0) {
    lines.push('## 🔗 Dependencies')
    lines.push('')
    lines.push('```mermaid')
    lines.push('graph TD')
    for (const [source, deps] of Object.entries(result.dependencies)) {
      if (deps.length > 0) {
        const shortSource = source.split('/').pop() ?? source
        for (const dep of deps.slice(0, 3)) {
          const shortDep = dep.split('/').pop() ?? dep
          lines.push(`  ${shortSource} --> ${shortDep}`)
        }
      }
    }
    lines.push('```')
    lines.push('')
  }

  // Footer
  lines.push('---')
  lines.push(`> ${isPt ? 'Relatório gerado por Refract' : 'Report generated by Refract'} — [opencode.ai](https://opencode.ai)`)
  lines.push('')

  return lines.join('\n')
}
