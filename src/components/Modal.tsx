import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  /** Max-width of the dialog card. Default 480px */
  maxWidth?: number | string
  children: React.ReactNode
  /** Whether the backdrop click / Escape key should be blocked */
  locked?: boolean
  /** Tailwind / extra classNames forwarded to the card */
  className?: string
}

/**
 * Shared modal primitive.
 * - backdrop: bg-black/60 backdrop-blur-sm (matches SettingsPage standard)
 * - Escape key closes (unless locked)
 * - Focus trap via tabIndex on backdrop
 * - Animated scale + fade entrance
 */
export function Modal({ open, onClose, maxWidth = 480, children, locked = false, className = '' }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, locked, onClose])

  // Focus the card when opened so keyboard users can immediately interact
  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (!locked) onClose() }}
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`card relative w-full outline-none ${className}`}
        style={{
          maxWidth,
          animation: 'modalIn 0.25s cubic-bezier(0.16,1,0.3,1) both',
          boxShadow: 'var(--shadow-level-4)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

interface ModalHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onClose?: () => void
  icon?: React.ReactNode
}

export function ModalHeader({ title, subtitle, onClose, icon }: ModalHeaderProps) {
  return (
    <div className="mb-5 pr-8">
      {icon && <div className="mb-3">{icon}</div>}
      <h2 className="text-[17px] font-semibold tracking-tight text-[var(--ink)] leading-snug">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{subtitle}</p>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost absolute top-4 right-4 h-8 w-8 p-0 flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)]"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-[var(--hairline-soft)]">
      {children}
    </div>
  )
}
