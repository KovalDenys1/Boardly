'use client'

import React from 'react'
import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import Modal from './Modal'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  icon?: React.ReactNode
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  icon
}: ConfirmModalProps) {
  const { t } = useTranslation()
  // Resolved here, not defaulted in the signature: a default parameter value is
  // not JSX, so `confirmText = 'Confirm'` rendered English buttons to every
  // non-English viewer who did not pass the props (#889).
  const confirmLabel = confirmText ?? t('common.confirm')
  const cancelLabel = cancelText ?? t('common.cancel')

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const variantStyles = {
    danger: {
      buttonBg: 'var(--bd-coral)',
      buttonHoverBg: '#e85a4b',
      icon: <Icon name="warning" size={26} />
    },
    warning: {
      buttonBg: 'var(--bd-sun)',
      buttonHoverBg: '#e6b040',
      icon: <Icon name="bolt" size={26} />
    },
    info: {
      buttonBg: 'var(--bd-ink)',
      buttonHoverBg: '#352F26',
      icon: <Icon name="info" size={26} />
    }
  }

  const style = variantStyles[variant]
  const displayIcon = icon || style.icon

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="text-center py-4">
        {displayIcon && (
          <div className="mb-4 flex justify-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-4xl animate-scale-in"
              style={{ background: 'var(--bd-bg2)' }}
            >
              {displayIcon}
            </div>
          </div>
        )}

        {title && (
          <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--bd-ink)' }}>
            {title}
          </h3>
        )}

        <p className="mb-6 px-2" style={{ color: 'var(--bd-ink-soft)' }}>
          {message}
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-medium transition-all"
            style={{
              background: 'var(--bd-bg2)',
              color: 'var(--bd-ink)',
              border: '1.5px solid var(--bd-line)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 rounded-xl font-medium transition-all text-white"
            style={{ background: style.buttonBg }}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
