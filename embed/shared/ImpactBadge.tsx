import React from 'react'

export const ImpactBadge: React.FC<{ level: 'High' | 'Medium' | 'Low' }> = ({ level }) => {
  const styles: Record<string, React.CSSProperties> = {
    High: { background: 'var(--foreground)', color: 'var(--background)' },
    Medium: { background: 'var(--accent)', color: 'var(--foreground)' },
    Low: { background: 'var(--background)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' },
  }
  return (
    <span style={{
      ...styles[level],
      fontSize: 10,
      borderRadius: 9999,
      padding: '2px 8px',
      fontWeight: 600,
      boxShadow: 'var(--shadow-border)',
      letterSpacing: '-0.02em',
    }}>
      {level} impact
    </span>
  )
}
