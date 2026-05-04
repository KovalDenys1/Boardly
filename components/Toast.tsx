'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])

  const typeStyles: Record<string, React.CSSProperties> = {
    success: { background: '#2D6A4F', color: 'white' },
    error: { background: 'var(--bd-coral)', color: 'white' },
    info: { background: 'var(--bd-ink)', color: 'white' },
    warning: { background: 'var(--bd-sun)', color: 'var(--bd-ink)' },
  }

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  }

  return (
    <div
      className="fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-slide-in-right"
      style={typeStyles[type]}
      role="alert"
    >
      <span className="text-xl font-bold">{icons[type]}</span>
      <p className="font-medium">{message}</p>
      <button
        onClick={onClose}
        className="ml-4 text-xl font-bold opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  )
}
