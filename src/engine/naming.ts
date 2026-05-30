import { suggestRefactorName } from '../lib/api'

function toPascalCase(input: string): string {
  const cleaned = input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()

  const transformed = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('')

  return transformed || 'RefactorCandidate'
}

export async function suggestSemanticComponentName(context: {
  filePath: string
  ownerName: string
  currentName: string
  symbols: string[]
  guidelines?: string
}): Promise<string> {
  const fallback = toPascalCase(context.currentName.replace(/^render/, '') || `${context.ownerName}Section`)

  try {
    const suggested = await suggestRefactorName({
      kind: 'component',
      filePath: context.filePath,
      currentName: context.currentName,
      ownerName: context.ownerName,
      symbols: context.symbols,
      guidelines: context.guidelines,
    })
    return toPascalCase(suggested)
  } catch {
    return fallback
  }
}

export async function suggestSemanticHookName(context: {
  filePath: string
  ownerName: string
  currentName: string
  symbols: string[]
  guidelines?: string
}): Promise<string> {
  const base = context.currentName || `${context.ownerName}State`

  try {
    const suggested = await suggestRefactorName({
      kind: 'hook',
      filePath: context.filePath,
      currentName: base,
      ownerName: context.ownerName,
      symbols: context.symbols,
      guidelines: context.guidelines,
    })
    return `use${toPascalCase(suggested).replace(/^Use/, '')}`
  } catch {
    return `use${toPascalCase(base).replace(/^Use/, '')}`
  }
}
