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

/** Open dialogs, oldest first. Escape and Tab belong to the last; the page stays locked until none is left. */
const openDialogs: object[] = []

/** Exactly one source for the dialog's accessible name; screen readers announce an unnamed one as just "dialog". */
type ModalName =
  | { title: string; 'aria-labelledby'?: never; 'aria-label'?: never }
  | { title?: never; 'aria-labelledby': string; 'aria-label'?: never }
  | { title?: never; 'aria-labelledby'?: never; 'aria-label': string }

export type ModalProps = ModalName & {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full'
  mobileFullscreen?: boolean
  bodyPadding?: 'default' | 'none'
  'aria-describedby'?: string
  /** false: Escape does nothing and the title row has no close button, for a dialog that is the page itself. A click on the scrim still calls onClose. */
  dismissible?: boolean
  /** `sheet` sits flush on the bottom edge below `sm` and centres from `sm` up. */
  placement?: 'center' | 'sheet'
  /** Replaces the default card surface (background, border, radius, shadow). */
  panelClassName?: string
  /** `dialog` for one that opens by itself: focus lands on the dialog, not on a control nobody chose. `[data-autofocus]` wins over both. */
  initialFocus?: 'first' | 'dialog'
}

export function ModalCloseButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('common.close')}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-bd-ink-muted transition-colors hover:bg-bd-bg2 hover:text-bd-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep ${className}`}
    >
      <svg className="h-5 w-5 fill-none stroke-current" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

export default function Modal({
  isOpen,
  onClose,
  title,
  'aria-labelledby': labelledBy,
  'aria-label': label,
  'aria-describedby': describedBy,
  children,
  maxWidth = 'lg',
  mobileFullscreen = false,
  bodyPadding = 'default',
  dismissible = true,
  placement = 'center',
  panelClassName,
  initialFocus = 'first',
}: ModalProps) {
  const [isMounted, setIsMounted] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [stackEntry] = useState(() => ({}))
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

  useEffect(() => {
    if (!isOpen) return

    openDialogs.push(stackEntry)
    document.body.style.overflow = 'hidden'

    return () => {
      openDialogs.splice(openDialogs.indexOf(stackEntry), 1)
      if (openDialogs.length === 0) document.body.style.overflow = 'unset'
    }
  }, [isOpen, stackEntry])

  // Close on Escape, and keep Tab inside the dialog while it's open. Without the
  // trap, tabbing past the last control landed on the page behind a scroll-locked
  // body, which is a dead end for keyboard and screen-reader users.
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== stackEntry) return

      if (e.key === 'Escape') {
        if (dismissible) onClose()
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, dismissible, getFocusableElements, stackEntry])

  // Move focus in on open and hand it back to the trigger on close, so keyboard
  // users don't get dropped at the top of the document.
  useEffect(() => {
    if (!isOpen || !isMounted) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const preferred = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')
    ;(preferred ?? (initialFocus === 'first' ? getFocusableElements()[0] : null) ?? dialogRef.current)?.focus()

    return () => {
      if (previouslyFocused && previouslyFocused !== document.body && previouslyFocused.isConnected) previouslyFocused.focus()
    }
  }, [isOpen, isMounted, initialFocus, getFocusableElements])

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

  const sheet = placement === 'sheet'
  // An inline max-width cannot wait for `sm`, so a sheet hands it to a utility through a variable.
  const width = sheet
    ? ({ '--modal-max-w': maxWidthStyles[maxWidth] } as React.CSSProperties)
    : { maxWidth: maxWidthStyles[maxWidth] }

  return createPortal(
    <div
      className={`fixed inset-0 z-dialog flex justify-center animate-fade-in ${
        mobileFullscreen ? 'items-stretch sm:items-center' : sheet ? 'items-end sm:items-center sm:p-[clamp(12px,1.2vw,20px)]' : 'items-center'
      }`}
      style={sheet ? undefined : { padding: mobileFullscreen ? '0px' : `clamp(12px, 1.2vw, 20px)` }}
    >
      {/* Backdrop — presentational; Escape and the close button are the
          keyboard-accessible ways out, so this isn't a focusable control. */}
      <div
        className="absolute inset-0 z-0 bg-bd-scrim backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : labelledBy}
        aria-label={title ? undefined : label}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative z-10 flex w-full flex-col animate-scale-in focus:outline-hidden ${
          sheet ? 'pb-[env(safe-area-inset-bottom)] sm:max-w-(--modal-max-w) sm:pb-0' : ''
        } ${
          panelClassName
            ? `max-h-[90dvh] ${panelClassName}`
            : `shadow-2xl ${
                mobileFullscreen
                  ? 'h-dvh max-h-dvh rounded-none border-0 sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl sm:border'
                  : 'max-h-[90dvh] rounded-2xl border'
              }`
        }`}
        style={
          panelClassName
            ? width
            : {
                background: 'var(--bd-card-warm)',
                borderColor: 'var(--bd-line)',
                ...width,
                borderWidth: `clamp(1px, 0.1vw, 2px)`,
              }
        }
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
            {dismissible && <ModalCloseButton onClick={onClose} />}
          </div>
        )}

        {/* Body */}
        <div
          className={`flex-1 overflow-y-auto overscroll-contain custom-scrollbar ${
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
