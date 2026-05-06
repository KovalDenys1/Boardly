'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

export default function SuspendedPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const authBg: React.CSSProperties = {
    background:
      'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14), transparent 50%), var(--bd-bg)',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !message.trim()) {
      setError(t('suspended.appeal.errorRequired'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'appeal',
          message: message.trim(),
          email: email.trim(),
          pageUrl: '/suspended',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to submit')
      }

      setSubmitted(true)
    } catch {
      setError(t('suspended.appeal.errorFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center overflow-y-auto p-4"
      style={authBg}
    >
      <div className="bd-card w-full max-w-md p-8">
        {submitted ? (
          <div className="text-center">
            <div
              className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-mint-deep bg-bd-mint/15 text-3xl"
              style={{ boxShadow: '3px 3px 0 var(--bd-ink)' }}
            >
              ✅
            </div>
            <h1
              className="mb-3 text-2xl font-extrabold text-bd-ink"
              style={{ fontFamily: 'var(--bd-font-display)' }}
            >
              {t('suspended.appeal.successTitle')}
            </h1>
            <p className="mb-6 text-sm leading-6 text-bd-ink-soft">
              {t('suspended.appeal.successBody')}
            </p>
            <button
              onClick={() => router.push('/auth/login')}
              className="bd-btn bd-btn-ghost w-full justify-center"
            >
              {t('suspended.backToLogin')}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <div
                className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-coral-deep bg-bd-coral/15 text-3xl"
                style={{ boxShadow: '3px 3px 0 var(--bd-ink)' }}
              >
                🔒
              </div>
              <h1
                className="mb-2 text-2xl font-extrabold text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {t('suspended.title')}
              </h1>
              <p className="text-sm leading-6 text-bd-ink-soft">
                {t('suspended.description')}
              </p>
            </div>

            <div
              className="mb-6 rounded-xl p-4"
              style={{
                background: 'rgba(255,100,80,0.08)',
                border: '1px solid rgba(255,100,80,0.25)',
              }}
            >
              <p className="text-sm font-semibold text-bd-coral-deep">
                {t('suspended.reason')}
              </p>
            </div>

            <div className="mb-5">
              <h2
                className="mb-1 text-sm font-bold text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {t('suspended.appeal.title')}
              </h2>
              <p className="mb-4 text-xs text-bd-ink-soft">
                {t('suspended.appeal.subtitle')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-bd-ink-soft">
                    {t('suspended.appeal.emailLabel')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('suspended.appeal.emailPlaceholder')}
                    className="bd-input w-full"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-bd-ink-soft">
                    {t('suspended.appeal.messageLabel')}
                  </label>
                  <textarea
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('suspended.appeal.messagePlaceholder')}
                    rows={4}
                    maxLength={2000}
                    className="bd-input w-full resize-none"
                  />
                  <p className="mt-1 text-right text-xs text-bd-ink-muted">
                    {message.length}/2000
                  </p>
                </div>

                {error && (
                  <p className="text-xs text-bd-coral-deep">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="bd-btn bd-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? t('suspended.appeal.submitting')
                    : t('suspended.appeal.submit')}
                </button>
              </form>
            </div>

            <div className="border-t border-bd-line pt-4 text-center">
              <button
                onClick={() => router.push('/auth/login')}
                className="text-xs text-bd-ink-soft hover:text-bd-ink transition-colors"
              >
                {t('suspended.backToLogin')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
