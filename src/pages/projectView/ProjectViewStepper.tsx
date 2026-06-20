import React from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import type { Phase } from './types'

const STEPS = ['analyse', 'summary', 'review', 'apply', 'done'] as const
type StepId = (typeof STEPS)[number]

function phaseToStepIndex(phase: Phase): number {
  switch (phase) {
    case 'idle':
    case 'analysing':
      return 0
    case 'briefing':
      return 1
    case 'reviewing':
      return 2
    case 'applying':
    case 'refactoring':
      return 3
    case 'complete':
      return 4
    default:
      return 0
  }
}

interface Props {
  phase: Phase
}

export const ProjectViewStepper: React.FC<Props> = ({ phase }) => {
  const { t } = useTranslation()
  const activeIdx = phaseToStepIndex(phase)

  if (phase === 'idle') return null

  const labels: Record<StepId, string> = {
    analyse: t('projectView.stepAnalyse'),
    summary: t('projectView.stepSummary'),
    review: t('projectView.stepReview'),
    apply: t('projectView.stepApply'),
    done: t('projectView.stepDone'),
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--background)',
        flexShrink: 0,
      }}
    >
      {STEPS.map((step, idx) => {
        const done = idx < activeIdx
        const active = idx === activeIdx
        const label = labels[step]

        return (
          <React.Fragment key={step}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  background: done || active ? 'var(--foreground)' : 'var(--accent)',
                  color: done || active ? 'var(--background)' : 'var(--muted-foreground)',
                  border: active ? '2px solid var(--ring)' : '1px solid var(--border)',
                  boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--ring) 25%, transparent)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {done ? <Check size={12} strokeWidth={3} /> : idx + 1}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                  opacity: active || done ? 1 : 0.6,
                  letterSpacing: '-0.01em',
                }}
              >
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                style={{
                  width: 32,
                  height: 1,
                  margin: '0 12px',
                  background: idx < activeIdx ? 'var(--foreground)' : 'var(--border)',
                  transition: 'background 0.15s ease',
                }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
