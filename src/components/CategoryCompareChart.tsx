import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'

interface TrendEntry {
  category: string
  direction: 'worsening' | 'improving' | 'stable'
  averageCount: number
  currentCount: number
}

interface Props {
  trends: TrendEntry[]
  prevLabel?: string
  currentLabel?: string
  height?: number
}

const C = {
  muted: 'var(--ink-muted)',
  hairline: 'var(--hairline)',
  red: 'var(--semantic-error)',
  green: 'var(--semantic-success)',
  yellow: 'var(--timeline-done)',
  gray: 'var(--surface-strong)',
}

function trendColor(direction: string): string {
  if (direction === 'worsening') return C.red
  if (direction === 'improving') return C.green
  return C.yellow
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface-card)', border: `1px solid ${C.hairline}`,
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <p style={{ color: C.muted, marginBottom: 6, fontWeight: 600, fontSize: 11 }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.fill, flexShrink: 0 }} />
          <span style={{ color: 'var(--ink)', fontSize: 11 }}>{entry.name}</span>
          <span style={{ marginLeft: 'auto', paddingLeft: 12, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export const CategoryCompareChart: React.FC<Props> = ({
  trends,
  prevLabel = 'Previous avg',
  currentLabel = 'Current',
  height = 200,
}) => {
  if (!trends || trends.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>
        No category data available
      </div>
    )
  }

  const data = trends.map((t) => ({
    category: t.category,
    direction: t.direction,
    [prevLabel]: Math.round(t.averageCount),
    [currentLabel]: t.currentCount,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
        barCategoryGap="30%"
        barGap={3}
      >
        <CartesianGrid stroke={C.hairline} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: C.muted, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: C.hairline }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fill: C.muted, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={90}
          tickFormatter={(v: string) => v.length > 14 ? `${v.slice(0, 13)}…` : v}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--hairline)', opacity: 0.4 }} />
        <Legend
          wrapperStyle={{ fontSize: 10, color: 'var(--ink)' }}
          iconType="square"
          iconSize={7}
        />
        <Bar dataKey={prevLabel} fill={C.gray} radius={[0, 3, 3, 0]} maxBarSize={12} />
        <Bar dataKey={currentLabel} radius={[0, 3, 3, 0]} maxBarSize={12}>
          {data.map((entry, i) => (
            <Cell key={i} fill={trendColor(entry.direction)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
