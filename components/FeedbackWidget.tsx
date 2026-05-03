'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type FeedbackType = 'bug' | 'feature' | 'other'

const TYPE_LABELS: Record<FeedbackType, { label: string; shortLabel: string }> = {
  bug: { label: 'Bug Report', shortLabel: 'Bug' },
  feature: { label: 'Feature Request', shortLabel: 'Idea' },
  other: { label: 'Other', shortLabel: 'Note' },
}

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isFooterFeedbackVisible, setIsFooterFeedbackVisible] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pathname = usePathname()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const footerFeedbackButton = document.getElementById('footer-feedback-trigger')

    if (!footerFeedbackButton) {
      setIsFooterFeedbackVisible(false)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsFooterFeedbackVisible(entry.isIntersecting),
      { threshold: 0.15 },
    )

    observer.observe(footerFeedbackButton)
    return () => observer.disconnect()
  }, [pathname])

  useEffect(() => {
    const handler = () => setIsOpen(true)
    window.addEventListener('open-feedback', handler)
    return () => window.removeEventListener('open-feedback', handler)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50)
      return
    }

    setSubmitted(false)
    setError(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  const isGamePage = /^\/lobby\/[^/]+$/.test(pathname)
  const shouldHideFloatingButton = isGamePage || isFooterFeedbackVisible

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message: message.trim(),
          email: email.trim() || undefined,
          pageUrl: window.location.href,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong')
      }

      setSubmitted(true)
      setMessage('')
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-hidden={shouldHideFloatingButton}
        aria-label="Send feedback"
        tabIndex={shouldHideFloatingButton ? -1 : 0}
        className={`fixed bottom-[max(1.25rem,calc(1.25rem+env(safe-area-inset-bottom)))] right-5 z-40 inline-flex items-center gap-2 rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-4 py-3 text-sm font-bold text-white shadow-[0_4px_0_var(--bd-lav-deep)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)] ${
          shouldHideFloatingButton ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100'
        }`}
      >
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-md bg-white/20 text-[11px] font-black"
        >
          !
        </span>
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-bd-ink/45 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false)
          }}
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border-[1.5px] border-bd-line bg-white text-bd-ink shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <div className="dot-grid pointer-events-none absolute inset-0 opacity-30" />
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-bd-lav/20" />
            <div className="pointer-events-none absolute -bottom-14 left-10 h-28 w-28 rotate-12 rounded-[1.75rem] bg-bd-sun/20" />

            <div className="relative flex items-center justify-between border-b border-bd-line px-5 py-4 dark:border-slate-700">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-bd-ink-muted dark:text-slate-400">
                  Boardly
                </p>
                <h2 className="font-display text-2xl font-bold text-bd-ink dark:text-white">
                  Send Feedback
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-bd-line bg-bd-card-warm text-xl font-bold leading-none text-bd-ink-soft transition-colors hover:bg-bd-bg2 hover:text-bd-ink dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label="Close"
              >
                x
              </button>
            </div>

            {submitted ? (
              <div className="relative px-5 py-10 text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border-2 border-bd-lav-deep bg-bd-lav font-display text-xl font-black text-white shadow-[3px_3px_0_var(--bd-lav-deep)]">
                  OK
                </div>
                <p className="mb-1 font-display text-2xl font-bold text-bd-ink dark:text-white">
                  Thanks for the feedback!
                </p>
                <p className="text-sm leading-6 text-bd-ink-muted dark:text-slate-400">
                  We read every submission and use it to improve Boardly.
                </p>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-6 inline-flex items-center justify-center rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-6 py-3 text-sm font-bold text-white shadow-[0_4px_0_var(--bd-lav-deep)] transition-all hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)]"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="relative space-y-4 px-5 py-4">
                <div>
                  <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400">
                    Type
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(TYPE_LABELS) as FeedbackType[]).map((feedbackType) => (
                      <button
                        key={feedbackType}
                        type="button"
                        onClick={() => setType(feedbackType)}
                        aria-label={TYPE_LABELS[feedbackType].label}
                        className={`rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                          type === feedbackType
                            ? 'border-bd-lav-deep bg-bd-lav text-white shadow-[0_3px_0_var(--bd-lav-deep)]'
                            : 'border-bd-line bg-bd-card-warm text-bd-ink-soft hover:bg-white hover:text-bd-ink dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        {TYPE_LABELS[feedbackType].shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block font-mono text-xs font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400">
                    Message <span className="text-bd-coral-deep">*</span>
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe the issue or suggestion..."
                    required
                    maxLength={2000}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-bd-line bg-bd-card-warm px-3 py-2.5 text-sm text-bd-ink placeholder-bd-ink-muted/70 transition-colors focus:border-bd-lav-deep focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                  <p className="mt-1 text-right text-xs text-bd-ink-muted dark:text-slate-500">
                    {message.length}/2000
                  </p>
                </div>

                <div>
                  <label className="mb-2 block font-mono text-xs font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400">
                    Email{' '}
                    <span className="normal-case tracking-normal text-bd-ink-muted/70">
                      (optional, for follow-up)
                    </span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-2xl border border-bd-line bg-bd-card-warm px-3 py-2.5 text-sm text-bd-ink placeholder-bd-ink-muted/70 transition-colors focus:border-bd-lav-deep focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>

                {error && (
                  <p className="rounded-2xl border border-bd-coral/40 bg-bd-coral/10 px-3 py-2 text-sm font-semibold text-bd-coral-deep dark:text-red-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className="w-full rounded-2xl border-2 border-bd-lav-deep bg-bd-lav py-3 text-sm font-bold text-white shadow-[0_4px_0_var(--bd-lav-deep)] transition-all hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_0_var(--bd-lav-deep)]"
                >
                  {submitting ? 'Sending...' : 'Send Feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
