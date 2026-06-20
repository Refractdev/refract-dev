import { createProject, getProjectByPath } from './db'
import { saveProjectFiles } from './fileStore'
import type { Project } from '../shared/types'

export const SAMPLE_PROJECT_PATH = '~/code/sample-app'
export const SAMPLE_PROJECT_NAME = 'sample-app'

/** Minimal fixture with intentional anti-patterns for instant demo value. */
export const SAMPLE_FILES: Record<string, string> = {
  'src/Dashboard.tsx': `import React, { useState, useEffect } from 'react'

function fetchData(): Promise<any> {
  return fetch('/api/data').then((r) => r.json() as any)
}

export default function Dashboard({ config, theme, locale, user, onUpdate, onDelete, onRefresh, onClose, onOpen, onToggle, onSelect }: any) {
  const [dataList, setDataList] = useState<any[]>([])
  const [dataCount, setDataCount] = useState(0)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<any>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  const [filterActive, setFilterActive] = useState(false)
  const [sortField, setSortField] = useState('')
  const [unusedFlag, setUnusedFlag] = useState(false)

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setDataList(d))
    setInterval(() => setDataCount((c) => c + 1), 1000)
  })

  function formatUserName(first: string, last: string) {
    const trimmedFirst = first.trim()
    const trimmedLast = last.trim()
    return \`\${trimmedFirst} \${trimmedLast}\`.toUpperCase()
  }

  function formatContactName(first: string, last: string) {
    const trimmedFirst = first.trim()
    const trimmedLast = last.trim()
    return \`\${trimmedFirst} \${trimmedLast}\`.toUpperCase()
  }

  function renderCard(cardUser: any, cardConfig: any, cardTheme: any, cardLocale: any, cardOnUpdate: any) {
    return (
      <div style={{ background: cardTheme?.bg }}>
        <span>{cardUser?.name}</span>
        <span>{cardConfig?.title}</span>
        <button onClick={() => cardOnUpdate(cardUser)}>Update</button>
      </div>
    )
  }

  return (
    <div>
      <h1>{formatUserName('John', 'Doe')}</h1>
      <p>{formatContactName('Jane', 'Smith')}</p>
      {renderCard(user, config, theme, locale, onUpdate)}
      <ul>
        {dataList.map((item: any) => (
          <li key={item.id}>
            <span>{item.name}</span>
            <button onClick={() => onDelete(item.id)}>Delete</button>
            <button onClick={() => onRefresh(item.id)}>Refresh</button>
            <button onClick={() => onClose(item.id)}>Close</button>
            <button onClick={() => onOpen(item.id)}>Open</button>
            <button onClick={() => onToggle(item.id)}>Toggle</button>
            <button onClick={() => onSelect(item.id)}>Select</button>
          </li>
        ))}
      </ul>
      <input value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} />
      <input value={userName} onChange={(e) => setUserName(e.target.value)} />
      <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
      <input value={userRole} onChange={(e) => setUserRole(e.target.value)} />
      <span>{dataError?.message}</span>
      <span>{dataLoading ? 'Loading…' : \`\${dataCount} items\`}</span>
      <span>{sortField}</span>
      <span>{filterActive ? 'active' : 'inactive'}</span>
      <span style={{ display: 'none' }}>{String(unusedFlag)}</span>
    </div>
  )
}
`,
  'src/utils/helpers.ts': `export function parseConfig(raw: any): any {
  return JSON.parse(raw) as any
}

export function unusedHelper() {
  return 42
}
`,
}

export function getSampleFileMap(): Map<string, string> {
  return new Map(Object.entries(SAMPLE_FILES))
}

export function isSampleProject(project: Pick<Project, 'path' | 'name'> | null | undefined): boolean {
  if (!project) return false
  return project.path === SAMPLE_PROJECT_PATH || project.name === SAMPLE_PROJECT_NAME
}

async function seedSampleFiles(projectId: string): Promise<void> {
  const fileMap = getSampleFileMap()
  await saveProjectFiles(projectId, fileMap)
}

export async function createSampleProject(userId: string): Promise<Project> {
  const project = await createProject(
    {
      name: SAMPLE_PROJECT_NAME,
      path: SAMPLE_PROJECT_PATH,
      repo: null,
      branch: 'main',
      status: 'Not analysed',
    },
    userId,
  )

  await seedSampleFiles(project.id)
  return project
}

export async function findOrCreateSampleProject(userId: string): Promise<Project> {
  const existing = await getProjectByPath(userId, SAMPLE_PROJECT_PATH)
  if (existing) {
    await seedSampleFiles(existing.id)
    return existing
  }
  return createSampleProject(userId)
}
