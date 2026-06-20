import React from 'react'
import {
  AlertTriangle, TrendingDown, Zap, FileWarning, Info, Layout, X,
} from 'lucide-react'
import type { DriftReport } from '../lib/api'
import { useTranslation } from '../hooks/useTranslation'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--semantic-error)',
  warning: 'var(--timeline-done)',
  info: 'var(--ink-muted)',
}

function getAlertIcon(type: string): React.ReactNode {
  switch (type) {
    case 'score_drop': return <TrendingDown size={13} />
    case 'category_spike': return <AlertTriangle size={13} />
    case 'anomaly': return <Zap size={13} />
    case 'decay_hotspot': return <FileWarning size={13} />
    case 'architectural_drift': return <Layout size={13} />
    default: return <Info size={13} />
  }
}

interface Props {
  report: DriftReport
  onDismiss?: (index: number) => void
}

export const DriftAlertsPanel: React.FC<Props> = ({ report, onDismiss }) => {
  const { t } = useTranslation()
  const muted = 'var(--ink-muted)'

  if (report.alerts.length === 0) {
    const desc = t('projects.monitor.alertAllClearDesc').replace(
      '{count}',
      String(report.totalSnapshots),
    )
    return (
      <div style={{
        background: 'color-mix(in srgb, var(--semantic-success) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--semantic-success) 20%, transparent)',
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}>
        <Info size={13} color="var(--semantic-success)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 12, color: 'var(--semantic-success)', fontWeight: 500, marginBottom: 2 }}>
            {t('projects.monitor.alertAllClear')}
          </p>
          <p style={{ fontSize: 11, color: muted }}>{desc}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {report.alerts.map((alert, i) => {
        const color = SEVERITY_COLORS[alert.severity] ?? muted
        const icon = getAlertIcon(alert.alert_type)
        const filePath: string | undefined = (alert.metadata as any)?.file

        const severityLabel =
          alert.severity === 'critical'
            ? t('projects.monitor.critical')
            : alert.severity === 'warning'
            ? t('projects.monitor.warning')
            : t('projects.monitor.infoSeverity')

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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontSize: 10, color, fontWeight: 600, textTransform: 'uppercase',
                  background: `${color}15`, borderRadius: 3, padding: '1px 5px',
                }}>
                  {severityLabel}
                </span>
                <span style={{ fontSize: 10, color: muted, fontFamily: 'var(--font-mono)' }}>
                  {alert.alert_type.replace(/_/g, ' ')}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>{alert.message}</p>
              {filePath && (
                <button
                  onClick={() => { try { navigator.clipboard.writeText(filePath) } catch {} }}
                  title={filePath}
                  style={{
                    marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: 10, color: muted, fontFamily: 'var(--font-mono)',
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                  }}
                >
                  {filePath}
                </button>
              )}
            </div>
            {onDismiss && (
              <button
                onClick={() => onDismiss(i)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: muted, padding: 2, flexShrink: 0, marginTop: -2,
                }}
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
