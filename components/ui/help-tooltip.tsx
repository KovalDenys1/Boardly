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
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-300"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10A8 8 0 112 10a8 8 0 0116 0zM9 8a1 1 0 112 0v4a1 1 0 11-2 0V8zm1-3a1.25 1.25 0 100 2.5A1.25 1.25 0 0010 5z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="tooltip"
          className={`absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-3 text-left text-xs leading-5 text-slate-600 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300 ${panelClassName}`}
        >
          {content}
        </div>
      )}
    </div>
  )
}
