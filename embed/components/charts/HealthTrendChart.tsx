import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  date: string
  score: number
}

interface Props {
  data: DataPoint[]
  height?: number
}

const C = {
  green: 'var(--semantic-success)',
  red: 'var(--semantic-error)',
  yellow: 'var(--timeline-done)',
  muted: 'var(--ink-muted)',
  hairline: 'var(--hairline)',
}

function getScoreColor(score: number): string {
  if (score >= 80) return C.green
  if (score >= 55) return C.yellow
  return C.red
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const score = payload[0].value
  return (
    <div style={{
      background: 'var(--surface-card)', border: `1px solid ${C.hairline}`,
      borderRadius: 8, padding: '8px 12px', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <p style={{ color: C.muted, marginBottom: 4, fontSize: 12 }}>{label}</p>
      <p style={{ color: getScoreColor(score), fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
        Score: {score}/100
      </p>
    </div>
  )
}

export const HealthTrendChart: React.FC<Props> = ({ data, height = 200 }) => {
  if (data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 14 }}>
        Need at least 2 analyses to show trend
      </div>
    )
  }

  const scoreColor = getScoreColor(data[data.length - 1]?.score ?? 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={scoreColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={scoreColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.hairline} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: C.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: C.hairline }}
          tickFormatter={(v: string) => {
            const d = new Date(v)
            return `${d.getMonth() + 1}/${d.getDate()}`
          }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: C.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="score"
          stroke={scoreColor}
          strokeWidth={2}
          fill="url(#scoreGradient)"
          dot={{ r: 3, fill: scoreColor, stroke: 'var(--surface-card)', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: scoreColor, stroke: 'var(--surface-card)', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
