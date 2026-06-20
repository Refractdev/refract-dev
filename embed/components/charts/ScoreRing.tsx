import React from 'react'

const C = {
  green: 'var(--semantic-success)',
  red: 'var(--semantic-error)',
  yellow: 'var(--timeline-done)',
}

function getScoreColor(score: number): string {
  if (score >= 80) return C.green
  if (score >= 55) return C.yellow
  return C.red
}

interface Props {
  score: number
  size?: number
}

export const ScoreRing: React.FC<Props> = ({ score, size = 48 }) => {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = getScoreColor(score)

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={2} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        style={{ fill: color, fontSize: size * 0.32, fontWeight: 600, transform: 'rotate(90deg)', transformOrigin: '50% 50%', fontFamily: 'var(--font-mono)' }}>
        {score}
      </text>
    </svg>
  )
}
