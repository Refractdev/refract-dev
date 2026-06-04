import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { formatDate, formatCurrency, formatNumber } from './helpers'

export function UserCard({ userId, theme, config, permissions, onNavigate, onDelete }: any) {
  const [profile, setProfile] = useState<any>(null)
  const [activity, setActivity] = useState<any>(null)
  const [billing, setBilling] = useState<any>(null)
  const [notifications, setNotifications] = useState<any>([])
  const [expanded, setExpanded] = useState<any>(false)
  const [tab, setTab] = useState<any>('profile')
  const [deadCard, setDeadCard] = useState<any>('never used')

  useEffect(() => {
    axios.get(`/api/profile/${userId}`).then(r => setProfile(r.data))
  })

  useEffect(() => {
    fetch(`/api/activity/${userId}`).then(r => r.json()).then(setActivity)
    fetch(`/api/billing/${userId}`).then(r => r.json()).then(setBilling)
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setExpanded(false)
    })
  }, [])

  function processActivity(items: any[]) {
    return items
      .filter((a) => a.active)
      .map((a) => ({ ...a, label: a.name.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .reduce((acc: any, a: any) => ({ ...acc, [a.id]: a }), {})
  }

  return (
    <div style={{ theme, config } as any}>
      <span>{profile?.name as string}</span>
      <span>{formatDate(profile?.createdAt)}</span>
      <span>{formatCurrency(profile?.balance)}</span>
      <button onClick={() => onNavigate('profile', permissions)}>View</button>
      <button onClick={() => onDelete(userId, permissions, theme, config)}>Delete</button>
    </div>
  )
}
