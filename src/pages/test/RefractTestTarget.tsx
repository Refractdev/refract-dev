// RefractTestTarget.tsx — intentionally broken for Refract pipeline testing
// DO NOT REFACTOR MANUALLY — let Refract handle it

import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { ThemeProvider } from '../../components/ThemeProvider'
import { formatDate } from '../../utils/formatDate'
import { logger } from '../../utils/logger'

// Props typed as `any` — kills all type safety immediately
export default function Dashboard({ userId, theme, config, onSave, onDelete, onRefresh }: any) {

  // State explosion: 8 independent useStates — should be consolidated
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState<any>(false)
  const [error, setError] = useState<any>(null)
  const [count, setCount] = useState<any>(0)
  const [filter, setFilter] = useState<any>('')
  const [sortBy, setSortBy] = useState<any>('name')
  const [page, setPage] = useState<any>(1)
  const [deadValue, setDeadValue] = useState<any>('i am never read or set again')

  // useEffect with NO dependency array — re-runs on every single render
  // also makes a fetch call with no cleanup function
  useEffect(() => {
    setLoading(true)
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((d: any) => {
        setData(d)
        setLoading(false)
      })
    // missing: return () => { ... } cleanup
    // missing: dependency array
  })

  // stale closure — empty deps [] but reads `filter` and `sortBy` from outer scope
  useEffect(() => {
    console.log('syncing filter:', filter, 'sort:', sortBy)
    setPage(1)
  }, [])

  // memory leak — addEventListener with no corresponding removeEventListener
  useEffect(() => {
    window.addEventListener('resize', () => {
      setCount((c: any) => c + 1)
    })
    document.addEventListener('click', () => {
      setFilter('')
    })
    // missing: return () => { window.removeEventListener(...); document.removeEventListener(...) }
  }, [])

  // direct API calls inside the component — should live in a service file
  const handleSave = async (item: any) => {
    const res = await fetch('/api/items', {
      method: 'POST',
      body: JSON.stringify(item),
    })
    const saved = await res.json()
    setData(saved)
  }

  const handleDelete = async (id: any) => {
    await axios.delete(`/api/items/${id}`)
    setData((prev: any) => prev.filter((i: any) => i.id !== id))
  }

  // duplicate logic — same map/filter/sort pattern repeated twice
  function processUsers(users: any[]) {
    return users
      .filter((u) => u.active)
      .map((u) => ({ ...u, label: u.name.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function processItems(items: any[]) {
    return items
      .filter((i) => i.active)
      .map((i) => ({ ...i, label: i.name.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // sub-renderer 1 — large enough to extract as its own component
  function renderHeader(title: any, subtitle: any) {
    return (
      <div className="header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <span>Loaded {count} resize events</span>
        <Button theme={theme} config={config} label="Refresh" onClick={onRefresh} />
      </div>
    )
  }

  // sub-renderer 2 — prop drilling: passes theme and config just to forward them
  function renderUserCard(user: any) {
    return (
      <div key={user.id} className="card">
        <img src={user.avatar as string} alt={user.name as string} />
        <h3>{user.name as string}</h3>
        <p>{user.email as string}</p>
        <span>{formatDate(user.createdAt)}</span>
        <Button
          theme={theme}
          config={config}
          label="Delete"
          onClick={() => onDelete(user.id)}
        />
      </div>
    )
  }

  // sub-renderer 3 — another extractable block
  function renderFilters(currentFilter: any, currentSort: any) {
    return (
      <div className="filters">
        <input
          value={currentFilter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter users..."
        />
        <select value={currentSort} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Name</option>
          <option value="date">Date</option>
          <option value="email">Email</option>
        </select>
        <Button
          theme={theme}
          config={config}
          label="Reset"
          onClick={() => { setFilter(''); setSortBy('name') }}
        />
      </div>
    )
  }

  // no error handling in JSX even though `error` state exists
  if (loading) return <div>Loading...</div>

  return (
    <div className="dashboard">
      {renderHeader('Dashboard', `Welcome back, user ${userId}`)}
      {renderFilters(filter, sortBy)}
      <div className="user-grid">
        {(data?.users ?? []).map((user: any) => renderUserCard(user))}
      </div>
      <div className="pagination">
        <button onClick={() => setPage((p: any) => p - 1)} disabled={page <= 1}>Prev</button>
        <span>Page {page}</span>
        <button onClick={() => setPage((p: any) => p + 1)}>Next</button>
      </div>
      <button onClick={() => handleSave({ name: 'test' as any })}>Save Test Item</button>
    </div>
  )
}
