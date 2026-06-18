// Refract regression test fixture.
// Intentionally contains code patterns that every detector should catch.
// NOT referenced by any app route — excluded from tsconfig and production bundle.

import React, { useState, useEffect } from 'react'

// ── any-type / unsafe-cast ────────────────────────────────────────────────────
function fetchData(): Promise<any> {
  return fetch('/api/data').then((r) => r.json() as any)
}

// ── api-in-component / missing-error-boundary ─────────────────────────────────
export default function Dashboard({ config, theme, locale, user, onUpdate, onDelete, onRefresh, onClose, onOpen, onToggle, onSelect }: any) {
  // ── state-explosion ───────────────────────────────────────────────────────
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

  // ── dead-state ─────────────────────────────────────────────────────────────
  const [unusedFlag, setUnusedFlag] = useState(false)

  // ── effect-no-deps ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setDataList(d))

    const timer = setInterval(() => setDataCount((c) => c + 1), 1000)
    // ── memory-leak: interval not cleared ────────────────────────────────────
  })

  // ── duplicate-logic (block 1) ────────────────────────────────────────────
  function formatUserName(first: string, last: string) {
    const trimmedFirst = first.trim()
    const trimmedLast = last.trim()
    return `${trimmedFirst} ${trimmedLast}`.toUpperCase()
  }

  // ── duplicate-logic (block 2) ────────────────────────────────────────────
  function formatContactName(first: string, last: string) {
    const trimmedFirst = first.trim()
    const trimmedLast = last.trim()
    return `${trimmedFirst} ${trimmedLast}`.toUpperCase()
  }

  // ── prop-drilling helper ──────────────────────────────────────────────────
  function renderCard(cardUser: any, cardConfig: any, cardTheme: any, cardLocale: any, cardOnUpdate: any) {
    return (
      <div style={{ background: cardTheme?.bg }}>
        <span>{cardUser?.name}</span>
        <span>{cardConfig?.title}</span>
        <span>{cardLocale?.lang}</span>
        <button onClick={() => cardOnUpdate(cardUser)}>Update</button>
      </div>
    )
  }

  // ── oversized-component: intentionally long render ────────────────────────
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
      <span>{dataLoading ? 'Loading…' : `${dataCount} items`}</span>
      <span>{sortField}</span>
      <span>{filterActive ? 'active' : 'inactive'}</span>
      <span style={{ display: 'none' }}>{String(unusedFlag)}</span>
    </div>
  )
}
