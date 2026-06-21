import React from 'react'
import { GitBranch, Layers } from 'lucide-react'
import { C } from '../shared/constants'
import { IssuesReviewEmbed } from './IssuesReviewEmbed'
import { DEMO_PROJECT, DEMO_ISSUES } from '../mock/demoData'
import type { DemoIssue, DemoProject } from '../shared/types'

interface ProjectViewEmbedProps {
  project?: DemoProject
  issues?: DemoIssue[]
  issueCount?: number
  height?: number | string
}

export const ProjectViewEmbed: React.FC<ProjectViewEmbedProps> = ({
  project = DEMO_PROJECT,
  issues = DEMO_ISSUES,
  issueCount,
  height = 720,
}) => {
  const total = issueCount ?? issues.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, background: C.bg, overflow: 'hidden', border: `1px solid ${C.border}`, borderRadius: 12 }}>
      {/* Top bar */}
      <div style={{ height: 48, background: C.bg, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>{project.name}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>
            <GitBranch size={9} /> {project.branch}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{total} issues</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}>
              <Layers size={12} /> Issues
            </button>
            <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '4px 10px', opacity: 0.5, cursor: 'default' }} disabled>
              <GitBranch size={12} /> Map
            </button>
          </div>
        </div>
      </div>

      {/* Body — issues review layout */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <IssuesReviewEmbed issues={issues} height="100%" bare />
      </div>
    </div>
  )
}
