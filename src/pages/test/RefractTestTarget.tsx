// RefractTestTarget.tsx — intentionally broken for Refract pipeline testing

import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { ThemeProvider } from '../../components/ThemeProvider'
import { formatDate } from '../../utils/formatDate'
import { logger } from '../../utils/logger'

export default function Dashboard({ userId, theme, config, onSave, onDelete, onRefresh }: any) {

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState<any>(false)
  const [error, setError] = useState<any>(null)
  const [count, setCount] = useState<any>(0)
  const [filter, setFilter] = useState<any>('')
  const [sortBy, setSortBy] = useState<any>('name')
  const [page, setPage] = useState<any>(1)
  const [deadValue, setDeadValue] = useState<any>('never used again')

  // runs on every render — no dependency array
  useEffect(() => {
    setLoading(true)
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((d: any) => {
        setData(d)
        setLoading(false)
      })
  })

  // stale closure — reads filter and sortBy but deps array is empty
  useEffect(() => {
    console.log('syncing:', filter, sortBy)
    setPage(1)
  }, [])

  // second stale closure — reads page and count but deps array is empty
  useEffect(() => {
    console.log('page drift:', page, count)
    if (page > 1) {
      setCount(count + 1)
    }
  }, [])

  // memory leak — two event listeners with no cleanup
  useEffect(() => {
    window.addEventListener('resize', () => {
      setCount((c: any) => c + 1)
    })
    document.addEventListener('click', () => {
      setFilter('')
    })
  }, [])

  // api calls directly inside the component
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

  // duplicate logic — identical map/filter/sort in two functions
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

  function processArchivedUsers(users: any[]) {
    return users
      .filter((u) => u.active)
      .map((u) => ({ ...u, label: u.name.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function renderHeader(title: any, subtitle: any) {
    return (
      <div className="header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <span>{count}</span>
        <Button theme={theme} config={config} label="Refresh" onClick={onRefresh} />
      </div>
    )
  }

  function renderUserCard(user: any) {
    return (
      <div key={user.id} className="card">
        <img src={user.avatar as string} alt={user.name as string} />
        <h3>{user.name as string}</h3>
        <p>{user.email as string}</p>
        <span>{formatDate(user.createdAt)}</span>
        <Button theme={theme} config={config} label="Delete" onClick={() => onDelete(user.id)} />
      </div>
    )
  }

  function renderFilters(currentFilter: any, currentSort: any) {
    return (
      <div className="filters">
        <input value={currentFilter} onChange={(e) => setFilter(e.target.value)} />
        <select value={currentSort} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Name</option>
          <option value="date">Date</option>
        </select>
        <Button theme={theme} config={config} label="Reset" onClick={() => { setFilter(''); setSortBy('name') }} />
      </div>
    )
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="dashboard">
      {renderHeader('Dashboard', `Welcome ${userId}`)}
      {renderFilters(filter, sortBy)}
      <div className="grid">
        {(data?.users ?? []).map((user: any) => renderUserCard(user))}
      </div>
      <div className="pagination">
        <button onClick={() => setPage((p: any) => p - 1)}>Prev</button>
        <span>Page {page}</span>
        <button onClick={() => setPage((p: any) => p + 1)}>Next</button>
      </div>
      <button onClick={() => handleSave({ name: 'test' as any })}>Save</button>
    </div>
  )
}
