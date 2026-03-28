'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type FeedbackType = 'bug' | 'feature' | 'other'

const TYPE_LABELS: Record<FeedbackType, { label: string; icon: string }> = {
  bug: { label: 'Bug Report', icon: '🐛' },
  feature: { label: 'Feature Request', icon: '💡' },
  other: { label: 'Other', icon: '💬' },
}

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pathname = usePathname()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Listen for trigger from footer button
  useEffect(() => {
    const handler = () => setIsOpen(true)
    window.addEventListener('open-feedback', handler)
    return () => window.removeEventListener('open-feedback', handler)
  }, [])

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    } else {
      // Reset form on close
      setSubmitted(false)
      setError(null)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  // Don't show floating button during active gameplay (lobby/[code] route in game state)
  const isGamePage = /^\/lobby\/[^/]+$/.test(pathname)

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
      {/* Floating trigger button — hidden during gameplay */}
      {!isGamePage && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Send feedback"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold shadow-lg hover:shadow-purple-500/30 hover:scale-105 transition-all duration-200"
        >
          <span>💬</span>
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {/* Modal backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="text-white font-bold text-base">Send Feedback</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/40 hover:text-white transition-colors text-xl leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {submitted ? (
              /* Success state */
              <div className="px-5 py-10 text-center">
                <div className="text-4xl mb-3">🎉</div>
                <p className="text-white font-bold text-lg mb-1">Thanks for the feedback!</p>
                <p className="text-white/50 text-sm">We read every submission and use it to improve Boardly.</p>
                <button
                  onClick={() => setIsOpen(false)}
                  className="mt-6 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                {/* Type selector */}
                <div>
                  <p className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-2">Type</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(TYPE_LABELS) as FeedbackType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                          type === t
                            ? 'bg-blue-600/80 border-blue-400 text-white'
                            : 'bg-white/5 border-white/15 text-white/60 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="mr-1">{TYPE_LABELS[t].icon}</span>
                        {TYPE_LABELS[t].label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-2 block">
                    Message <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe the issue or suggestion…"
                    required
                    maxLength={2000}
                    rows={4}
                    className="w-full rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/30 text-sm px-3 py-2.5 resize-none focus:outline-none focus:border-blue-400 transition-colors"
                  />
                  <p className="text-white/25 text-xs text-right mt-1">{message.length}/2000</p>
                </div>

                {/* Email */}
                <div>
                  <label className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-2 block">
                    Email <span className="text-white/30">(optional, for follow-up)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/30 text-sm px-3 py-2.5 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-rose-400 text-sm">{error}</p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending…' : 'Send Feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
