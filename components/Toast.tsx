'use client'

import { useEffect } from 'react'

import { Icon, type IconName } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
  const { t } = useTranslation()

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

  const icons: Record<NonNullable<ToastProps['type']>, IconName> = {
    success: 'check',
    error: 'close',
    info: 'info',
    warning: 'warning',
  }

  return (
    <div
      className="fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-slide-in-right"
      style={typeStyles[type]}
      role="alert"
    >
      <Icon name={icons[type]} size={22} />
      <p className="font-medium">{message}</p>
      <button
        onClick={onClose}
        className="ml-4 flex items-center opacity-70 hover:opacity-100 transition-opacity"
        aria-label={t('common.close')}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}
