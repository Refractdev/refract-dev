import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface DataPoint {
  date: string
  [category: string]: number | string
}

interface Props {
  data: DataPoint[]
  height?: number
}

const COLORS = [
  '#0070f3', '#7928ca', '#ff0080', '#50e3c2',
  '#f9cb28', '#ff4d4d', '#00dfd8', '#eb367f',
  '#007cf0', '#ab570a',
]

const C = {
  muted: 'var(--ink-muted)',
  hairline: 'var(--hairline)',
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface-card)', border: `1px solid ${C.hairline}`,
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      maxHeight: 200, overflowY: 'auto',
    }}>
      <p style={{ color: C.muted, marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--ink)' }}>{entry.name}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export const CategoryTrendChart: React.FC<Props> = ({ data, height = 220 }) => {
  if (data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 14 }}>
        Need at least 2 analyses to show category trends
      </div>
    )
  }

  const categories = data.length > 0
    ? Object.keys(data[data.length - 1] ?? {}).filter((k) => k !== 'date')
    : []

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          {categories.map((cat, i) => (
            <linearGradient key={cat} id={`catGradient${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={C.hairline} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: C.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: C.hairline }}
        />
        <YAxis
          tick={{ fill: C.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--ink)' }} iconType="circle" iconSize={8} />
        {categories.map((cat, i) => (
          <Area
            key={cat}
            type="monotone"
            dataKey={cat}
            stackId="1"
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={1}
            fill={`url(#catGradient${i})`}
            dot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
