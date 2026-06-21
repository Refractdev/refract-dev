import type { FormattingPrefs } from '../lib/engineSettings'

function normalizeIndent(source: string, indent: FormattingPrefs['indent']): string {
  const indentStr = indent === 'tabs' ? '\t' : ' '.repeat(Number(indent))
  const lines = source.split('\n')
  return lines
    .map(line => {
      const trimmed = line.replace(/^\s+/, '')
      if (!trimmed) return ''
      return indentStr + trimmed
    })
    .join('\n')
}

function normalizeQuotes(source: string, quotes: FormattingPrefs['quotes']): string {
  if (quotes === 'double') {
    return source.replace(/(?<!\\)'/g, '"')
  }
  return source.replace(/(?<!\\)"/g, "'")
}

function normalizeSemicolons(source: string, semicolons: FormattingPrefs['semicolons']): string {
  if (semicolons === 'always') {
    return source
      .split('\n')
      .map(line => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.endsWith(';') || trimmed.endsWith('{') || trimmed.endsWith('}')) return line
        if (/^(import|export|\/\/|\/\*|\*)/.test(trimmed)) return line
        return line.replace(/;?\s*$/, ';')
      })
      .join('\n')
  }
  return source
    .split('\n')
    .map(line => line.replace(/;\s*$/, ''))
    .join('\n')
}

export function applyFormatting(source: string, formatting: FormattingPrefs): string {
  let result = source
  result = normalizeQuotes(result, formatting.quotes)
  result = normalizeSemicolons(result, formatting.semicolons)
  result = normalizeIndent(result, formatting.indent)
  return result
}
