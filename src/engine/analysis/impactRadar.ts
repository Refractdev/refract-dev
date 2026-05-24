import type { BlastRadius } from '../types'

export interface ImpactRadar {
  risk: 'low' | 'medium' | 'high'
  notes: string[]
}

export function evaluateImpactRadar(blastRadius: BlastRadius): ImpactRadar {
  const notes: string[] = []

  if (blastRadius.affectedFiles.length > 6) {
    notes.push('Touches a broad slice of the repo.')
  }

  if (blastRadius.dependentComponents.length > 0) {
    notes.push(`Impacts ${blastRadius.dependentComponents.length} dependent component(s).`)
  }

  if (blastRadius.testRisk === 'high') {
    notes.push('Imported by test files, so regressions are easier to surface.')
  }

  const risk =
    blastRadius.testRisk === 'high' || blastRadius.breakageSurface >= 45
      ? 'high'
      : blastRadius.breakageSurface >= 20
        ? 'medium'
        : 'low'

  return { risk, notes }
}
