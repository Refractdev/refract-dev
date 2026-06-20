import React from 'react'
import {
  AlertTriangle, TrendingDown, Zap, FileWarning, Info, X,
} from 'lucide-react'
import type { DriftReport } from '../../shared/types'

const C = {
  red: 'var(--semantic-error)',
  yellow: 'var(--timeline-done)',
  muted: 'var(--ink-muted)',
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: C.red,
  warning: C.yellow,
  info: 'var(--ink-muted)',
}

const ALERT_ICONS: Record<string, React.ReactNode> = {
  score_drop: <TrendingDown size={13} />,
  category_spike: <AlertTriangle size={13} />,
  anomaly: <Zap size={13} />,
  decay_hotspot: <FileWarning size={13} />,
}

interface Props {
  report: DriftReport
  onDismiss?: (index: number) => void
}

export const DriftAlertsPanel: React.FC<Props> = ({ report, onDismiss }) => {
  if (report.alerts.length === 0) {
    return (
      <div style={{
        background: 'color-mix(in srgb, var(--semantic-success) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--semantic-success) 20%, transparent)',
        borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <Info size={13} color="var(--semantic-success)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 12, color: 'var(--semantic-success)', fontWeight: 500, marginBottom: 2 }}>
            All clear
          </p>
          <p style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            No degradation detected. {report.totalSnapshots} analysis snapshots recorded.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {report.alerts.map((alert, i) => {
        const color = SEVERITY_COLORS[alert.severity] ?? C.muted
        const icon = ALERT_ICONS[alert.alert_type] ?? <Info size={13} />

        return (
          <div
            key={i}
            style={{
              background: `${color}10`,
              border: `1px solid ${color}22`,
              borderRadius: 8,
              padding: '10px 12px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              position: 'relative',
            }}
          >
            <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontSize: 10, color, fontWeight: 600, textTransform: 'uppercase',
                  background: `${color}15`, borderRadius: 3, padding: '1px 5px',
                }}>
                  {alert.severity === 'critical' ? 'Critical' : alert.severity === 'warning' ? 'Warning' : 'Info'}
                </span>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: 'var(--font-mono)' }}>
                  {alert.alert_type.replace('_', ' ')}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>{alert.message}</p>
            </div>
            {onDismiss && (
              <button
                onClick={() => onDismiss(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 2, flexShrink: 0, marginTop: -2 }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
