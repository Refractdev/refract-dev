export const C = {
  bg: 'var(--canvas)', surface: 'var(--surface-card)', border: 'var(--hairline)',
  text: 'var(--ink)', muted: 'var(--ink-muted)', subtle: 'var(--surface-strong)',
  green: 'var(--semantic-success)', red: 'var(--semantic-error)',
  yellow: 'var(--timeline-done)',
}

export interface HealthSnapshot {
  score: number
  timestamp: string
  issueCount: number
  high: number
  medium: number
  low: number
}

export function getScoreColor(score: number): string {
  if (score >= 80) return C.green
  if (score >= 55) return C.yellow
  return C.red
}

export function getScoreBg(score: number): string {
  if (score >= 80) return 'rgba(31, 138, 101, 0.1)'
  if (score >= 55) return 'rgba(192, 133, 50, 0.1)'
  return 'rgba(207, 45, 86, 0.1)'
}

export function getDelta(current?: HealthSnapshot, prev?: HealthSnapshot): number | null {
  if (!current || !prev) return null
  return current.score - prev.score
}
