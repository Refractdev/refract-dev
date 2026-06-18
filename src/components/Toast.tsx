import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

// ─── Single toast ─────────────────────────────────────────────────────────────

const DURATION_MS = 4000

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const showTimer = requestAnimationFrame(() => setVisible(true))
    const hideTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(item.id), 300)
    }, DURATION_MS)
    return () => {
      cancelAnimationFrame(showTimer)
      clearTimeout(hideTimer)
    }
  }, [item.id, onDismiss])

  const icons: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle size={16} color="var(--semantic-success)" />,
    error:   <XCircle    size={16} color="var(--semantic-error)"   />,
    info:    <Info       size={16} color="var(--ring)"             />,
  }

  const bg: Record<ToastVariant, string> = {
    success: 'var(--card)',
    error:   'var(--card)',
    info:    'var(--card)',
  }

  const border: Record<ToastVariant, string> = {
    success: 'var(--semantic-success)',
    error:   'var(--semantic-error)',
    info:    'var(--ring)',
  }

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 10,
        background: bg[item.variant],
        border: `1px solid ${border[item.variant]}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        minWidth: 240,
        maxWidth: 360,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        pointerEvents: 'all',
      }}
    >
      {icons[item.variant]}
      <span style={{ flex: 1, fontSize: 14, color: 'var(--foreground)', lineHeight: 1.4 }}>
        {item.message}
      </span>
      <button
        onClick={() => onDismiss(item.id)}
        style={{
          background: 'none',
          border: 'none',
          padding: 2,
          cursor: 'pointer',
          color: 'var(--muted-foreground)',
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = String(++counterRef.current)
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }])
  }, [])

  const success = useCallback((message: string) => toast(message, 'success'), [toast])
  const error   = useCallback((message: string) => toast(message, 'error'),   [toast])
  const info    = useCallback((message: string) => toast(message, 'info'),    [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
