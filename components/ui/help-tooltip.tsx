'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

interface HelpTooltipProps {
  content: ReactNode
  label: string
  panelClassName?: string
}

export default function HelpTooltip({
  content,
  label,
  panelClassName = 'w-64',
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-(--bd-input-border) bg-(--bd-input-bg) text-bd-ink-soft transition-colors hover:border-bd-lav-deep hover:text-bd-lav-deep focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-bd-lav-deep/30"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10A8 8 0 112 10a8 8 0 0116 0zM9 8a1 1 0 112 0v4a1 1 0 11-2 0V8zm1-3a1.25 1.25 0 100 2.5A1.25 1.25 0 0010 5z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="tooltip"
          className={`absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 rounded-2xl border border-bd-line bg-(--bd-input-bg) p-3 text-left text-xs leading-5 text-bd-ink-soft shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl ${panelClassName}`}
        >
          {content}
        </div>
      )}
    </div>
  )
}
