'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '@/lib/i18n-helpers'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full'
  mobileFullscreen?: boolean
  bodyPadding?: 'default' | 'none'
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'lg',
  mobileFullscreen = false,
  bodyPadding = 'default',
}: ModalProps) {
  const [isMounted, setIsMounted] = useState(false)
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    setIsMounted(true)
    return () => {
      setIsMounted(false)
    }
  }, [])

  const getFocusableElements = useCallback((): HTMLElement[] => {
    const dialog = dialogRef.current
    if (!dialog) return []
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement
    )
  }, [])

  // Close on Escape, and keep Tab inside the dialog while it's open. Without the
  // trap, tabbing past the last control landed on the page behind a scroll-locked
  // body, which is a dead end for keyboard and screen-reader users.
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = getFocusableElements()
      if (focusable.length === 0) {
        // Nothing to move to — keep focus on the dialog itself.
        e.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose, getFocusableElements])

  // Move focus in on open and hand it back to the trigger on close, so keyboard
  // users don't get dropped at the top of the document.
  useEffect(() => {
    if (!isOpen || !isMounted) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusable = getFocusableElements()
    ;(focusable[0] ?? dialogRef.current)?.focus()

    return () => {
      previouslyFocused?.focus?.()
    }
  }, [isOpen, isMounted, getFocusableElements])

  if (!isOpen || !isMounted) return null

  const maxWidthStyles = {
    sm: 'min(384px, 90vw)',
    md: 'min(448px, 90vw)',
    lg: 'min(512px, 90vw)',
    xl: 'min(576px, 90vw)',
    '2xl': 'min(672px, 90vw)',
    '3xl': 'min(896px, 92vw)',
    '4xl': 'min(1120px, 94vw)',
    full: '100%'
  }

  const portalTarget = document.getElementById('bd-lobby-portal') ?? document.body

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center animate-fade-in ${
        mobileFullscreen ? 'items-stretch sm:items-center' : 'items-center'
      }`}
      style={{ padding: mobileFullscreen ? '0px' : `clamp(12px, 1.2vw, 20px)` }}
    >
      {/* Backdrop — presentational; Escape and the close button are the
          keyboard-accessible ways out, so this isn't a focusable control. */}
      <div
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        {...(title ? { 'aria-labelledby': titleId } : {})}
        tabIndex={-1}
        className={`relative z-10 flex w-full flex-col shadow-2xl animate-scale-in ${
          mobileFullscreen
            ? 'h-dvh max-h-dvh rounded-none border-0 sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl sm:border'
            : 'max-h-[90dvh] rounded-2xl border'
        }`}
        style={{
          background: 'var(--bd-card-warm)',
          borderColor: 'var(--bd-line)',
          maxWidth: maxWidthStyles[maxWidth],
          borderWidth: `clamp(1px, 0.1vw, 2px)`,
        }}
      >
        {/* Header */}
        {title && (
          <div
            className={`flex shrink-0 items-center justify-between border-b ${
              mobileFullscreen ? 'px-4 py-4 sm:px-6 sm:py-5' : ''
            }`}
            style={mobileFullscreen ? { borderColor: 'var(--bd-line)' } : { padding: `clamp(12px, 1.2vh, 20px)`, borderColor: 'var(--bd-line)' }}
          >
            <h2
              id={titleId}
              className={`font-bold ${
                mobileFullscreen ? 'pr-4 text-lg sm:text-2xl' : ''
              }`}
              style={{ ...(mobileFullscreen ? {} : { fontSize: `clamp(16px, 1.6vw, 24px)` }), color: 'var(--bd-ink)' }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="transition-colors rounded-xl"
              style={{ padding: `clamp(3px, 0.3vh, 5px)`, color: 'var(--bd-ink-muted)' }}
              aria-label={t('common.close')}
            >
              <svg
                className="fill-none stroke-current"
                viewBox="0 0 24 24"
                style={{
                  width: `clamp(20px, 2vw, 28px)`,
                  height: `clamp(20px, 2vw, 28px)`,
                }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div
          className={`flex-1 overflow-y-auto custom-scrollbar ${
            bodyPadding === 'default' && mobileFullscreen ? 'px-4 py-4 sm:px-6 sm:py-6' : ''
          }`}
          style={
            bodyPadding === 'none'
              ? undefined
              : mobileFullscreen
                ? undefined
                : { padding: `clamp(12px, 1.2vh, 20px)` }
          }
        >
          {children}
        </div>
      </div>
    </div>,
    portalTarget
  )
}
