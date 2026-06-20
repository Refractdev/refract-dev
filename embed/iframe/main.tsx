import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../tokens.css'
import { DiffViewEmbed } from '../components/DiffViewEmbed'
import { IssuesReviewEmbed } from '../components/IssuesReviewEmbed'
import { ProjectViewEmbed } from '../components/ProjectViewEmbed'
import { QualityDashboardEmbed } from '../components/QualityDashboardEmbed'

type Route = 'diff' | 'issues' | 'project' | 'quality'

const ROUTES: Route[] = ['diff', 'issues', 'project', 'quality']

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '') as Route
  return ROUTES.includes(hash) ? hash : 'issues'
}

const VIEWS: Record<Route, { label: string; component: React.ReactNode; minHeight: number }> = {
  diff: { label: 'Diff View', component: <DiffViewEmbed />, minHeight: 480 },
  issues: { label: 'Issues View', component: <IssuesReviewEmbed />, minHeight: 640 },
  project: { label: 'Project View', component: <ProjectViewEmbed />, minHeight: 720 },
  quality: { label: 'Quality Dashboard', component: <QualityDashboardEmbed />, minHeight: 860 },
}

function App() {
  const [route, setRoute] = useState<Route>(parseRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const view = VIEWS[route]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--canvas)' }}>
      {/* Dev nav — hidden when embedded (optional: add ?embed=1 to hide) */}
      {!new URLSearchParams(window.location.search).has('embed') && (
        <nav style={{
          display: 'flex', gap: 8, padding: '12px 16px',
          borderBottom: '1px solid var(--hairline)', background: 'var(--surface-card)',
          flexWrap: 'wrap',
        }}>
          {ROUTES.map(r => (
            <a
              key={r}
              href={`#${r}`}
              style={{
                fontSize: 12, fontWeight: route === r ? 600 : 400,
                color: route === r ? 'var(--primary)' : 'var(--ink-muted)',
                textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
                background: route === r ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
              }}
            >
              {VIEWS[r].label}
            </a>
          ))}
        </nav>
      )}
      <div style={{ padding: new URLSearchParams(window.location.search).has('embed') ? 0 : 16 }}>
        {view.component}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
