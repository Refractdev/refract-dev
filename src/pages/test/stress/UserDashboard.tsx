import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { UserCard } from './UserCard'
import { StatsPanel } from './StatsPanel'
import { AdminTools } from './AdminTools'
import { formatDate, formatCurrency, formatNumber } from './helpers'
import { UnusedComponent } from './unused'
import { AnotherUnused } from './alsoUnused'

export default function UserDashboard({ userId, orgId, theme, config, permissions, onSave, onDelete, onExport, onRefresh, onNavigate }: any) {
  const [users, setUsers] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState<any>(false)
  const [error, setError] = useState<any>(null)
  const [filter, setFilter] = useState<any>('')
  const [sortBy, setSortBy] = useState<any>('name')
  const [page, setPage] = useState<any>(1)
  const [pageSize, setPageSize] = useState<any>(20)
  const [selected, setSelected] = useState<any>([])
  const [modalOpen, setModalOpen] = useState<any>(false)
  const [deadState, setDeadState] = useState<any>('unused')
  const [alsoDeadState, setAlsoDeadState] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/users?org=${orgId}`)
      .then(r => r.json())
      .then(d => { setUsers(d); setLoading(false) })
  })

  useEffect(() => {
    axios.get(`/api/stats?org=${orgId}&user=${userId}`)
      .then(r => setStats(r.data))
  })

  useEffect(() => {
    console.log('filter changed', filter, sortBy, page)
    setPage(1)
  }, [])

  useEffect(() => {
    window.addEventListener('resize', () => setPage(1))
    document.addEventListener('scroll', () => setFilter(''))
    window.addEventListener('focus', () => setSortBy('name'))
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setPage((p: any) => p + 1)
    }, 5000)
  }, [])

  const handleSave = async (user: any) => {
    const res = await fetch('/api/users', { method: 'POST', body: JSON.stringify(user) })
    const saved = await res.json()
    setUsers((prev: any) => [...prev, saved])
  }

  const handleDelete = async (id: any) => {
    await axios.delete(`/api/users/${id}`)
    setUsers((prev: any) => prev.filter((u: any) => u.id !== id))
  }

  const handleExport = async () => {
    const res = await fetch(`/api/export?org=${orgId}`)
    const data = await res.json()
    setStats(data)
  }

  function processUsers(items: any[]) {
    return items
      .filter((u) => u.active)
      .map((u) => ({ ...u, label: u.name.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .reduce((acc: any, u: any) => ({ ...acc, [u.id]: u }), {})
  }

  function processOrgs(items: any[]) {
    return items
      .filter((o) => o.active)
      .map((o) => ({ ...o, label: o.name.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .reduce((acc: any, o: any) => ({ ...acc, [o.id]: o }), {})
  }

  function renderHeader(title: any, subtitle: any, badge: any) {
    return (
      <div className="header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <span>{badge}</span>
        <UserCard theme={theme} config={config} permissions={permissions} onNavigate={onNavigate} />
      </div>
    )
  }

  function renderFilters(currentFilter: any, currentSort: any, currentPage: any) {
    return (
      <div className="filters">
        <input value={currentFilter} onChange={e => setFilter(e.target.value)} />
        <select value={currentSort} onChange={e => setSortBy(e.target.value)}>
          <option value="name">Name</option>
          <option value="date">Date</option>
          <option value="role">Role</option>
        </select>
        <button onClick={() => { setFilter(''); setSortBy('name'); setPage(1) }}>Reset</button>
        <StatsPanel theme={theme} config={config} permissions={permissions} onNavigate={onNavigate} />
      </div>
    )
  }

  function renderUserList(items: any) {
    return (
      <div className="list">
        {(items ?? []).map((u: any) => (
          <div key={u.id}>
            <span>{u.name as string}</span>
            <span>{formatDate(u.createdAt)}</span>
            <span>{formatCurrency(u.balance)}</span>
            <AdminTools theme={theme} config={config} permissions={permissions} onNavigate={onNavigate} onDelete={onDelete} onSave={onSave} />
          </div>
        ))}
      </div>
    )
  }

  function renderPagination(currentPage: any, total: any) {
    return (
      <div className="pagination">
        <button onClick={() => setPage((p: any) => p - 1)}>Prev</button>
        <span>{currentPage} / {Math.ceil(total / pageSize)}</span>
        <button onClick={() => setPage((p: any) => p + 1)}>Next</button>
      </div>
    )
  }

  if (loading) return <div>Loading...</div>

  return (
    <div>
      {renderHeader('Dashboard', `Org ${orgId}`, `User ${userId}`)}
      {renderFilters(filter, sortBy, page)}
      {renderUserList(users?.items)}
      {renderPagination(page, users?.total ?? 0)}
      <button onClick={() => handleSave({ name: 'new' as any })}>Add</button>
      <button onClick={handleExport}>Export</button>
    </div>
  )
}
