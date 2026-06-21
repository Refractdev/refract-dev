import { getSetting, setSetting } from './db'

export type EngineModel = 'flash' | 'pro' | 'ultra' | 'hybrid'
export type AnalysisRigor = 'safe' | 'balanced' | 'paranoid'
export type SandboxValidation = 'none' | 'standard' | 'strict'
export type FormattingIndent = '2' | '4' | 'tabs'
export type FormattingQuotes = 'single' | 'double'
export type FormattingSemicolons = 'always' | 'as-needed'

export interface FormattingPrefs {
  indent: FormattingIndent
  quotes: FormattingQuotes
  semicolons: FormattingSemicolons
}

export interface EngineSettings {
  model: EngineModel
  rigor: AnalysisRigor
  sandboxValidation: SandboxValidation
  formatting: FormattingPrefs
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  model: 'hybrid',
  rigor: 'balanced',
  sandboxValidation: 'standard',
  formatting: {
    indent: '2',
    quotes: 'single',
    semicolons: 'as-needed',
  },
}

function parseEnum<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export async function loadEngineSettings(): Promise<EngineSettings> {
  const [model, rigor, sandboxValidation, indent, quotes, semicolons] = await Promise.all([
    getSetting('engine_model', DEFAULT_ENGINE_SETTINGS.model),
    getSetting('analysis_rigor', DEFAULT_ENGINE_SETTINGS.rigor),
    getSetting('sandbox_validation', DEFAULT_ENGINE_SETTINGS.sandboxValidation),
    getSetting('formatting_indent', DEFAULT_ENGINE_SETTINGS.formatting.indent),
    getSetting('formatting_quotes', DEFAULT_ENGINE_SETTINGS.formatting.quotes),
    getSetting('formatting_semicolons', DEFAULT_ENGINE_SETTINGS.formatting.semicolons),
  ])

  return {
    model: parseEnum(model, ['flash', 'pro', 'ultra', 'hybrid'] as const, DEFAULT_ENGINE_SETTINGS.model),
    rigor: parseEnum(rigor, ['safe', 'balanced', 'paranoid'] as const, DEFAULT_ENGINE_SETTINGS.rigor),
    sandboxValidation: parseEnum(
      sandboxValidation,
      ['none', 'standard', 'strict'] as const,
      DEFAULT_ENGINE_SETTINGS.sandboxValidation,
    ),
    formatting: {
      indent: parseEnum(indent, ['2', '4', 'tabs'] as const, DEFAULT_ENGINE_SETTINGS.formatting.indent),
      quotes: parseEnum(quotes, ['single', 'double'] as const, DEFAULT_ENGINE_SETTINGS.formatting.quotes),
      semicolons: parseEnum(
        semicolons,
        ['always', 'as-needed'] as const,
        DEFAULT_ENGINE_SETTINGS.formatting.semicolons,
      ),
    },
  }
}

export async function saveEngineSettings(partial: Partial<EngineSettings>): Promise<void> {
  const tasks: Promise<void>[] = []

  if (partial.model !== undefined) {
    tasks.push(setSetting('engine_model', partial.model))
  }
  if (partial.rigor !== undefined) {
    tasks.push(setSetting('analysis_rigor', partial.rigor))
  }
  if (partial.sandboxValidation !== undefined) {
    tasks.push(setSetting('sandbox_validation', partial.sandboxValidation))
  }
  if (partial.formatting?.indent !== undefined) {
    tasks.push(setSetting('formatting_indent', partial.formatting.indent))
  }
  if (partial.formatting?.quotes !== undefined) {
    tasks.push(setSetting('formatting_quotes', partial.formatting.quotes))
  }
  if (partial.formatting?.semicolons !== undefined) {
    tasks.push(setSetting('formatting_semicolons', partial.formatting.semicolons))
  }

  await Promise.all(tasks)
}

export function getBlastRadiusThreshold(rigor: AnalysisRigor): number {
  switch (rigor) {
    case 'safe': return 3
    case 'paranoid': return 1
    default: return 5
  }
}

export function passesRigorGate(
  rigor: AnalysisRigor,
  breakageSurface: number,
  warnings: string[] = [],
): boolean {
  if (breakageSurface > getBlastRadiusThreshold(rigor)) return false
  if (rigor === 'paranoid' && warnings.length > 0) return false
  return true
}
