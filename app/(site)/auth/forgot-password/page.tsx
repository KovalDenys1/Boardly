'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Icon } from '@/components/icons'
import { showToast } from '@/lib/i18n-toast'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import AuthShell from '@/components/auth/AuthShell'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const navigateToLogin = () => router.push(buildCurrentAuthUrl('login'))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send reset email')
      }

      showToast.success('auth.forgotPassword.success')
      setSent(true)
    } catch (err: unknown) {
      showToast.errorFrom(err, 'auth.forgotPassword.error')
    } finally {
      setLoading(false)
    }
  }

  // i18n-allow: product name, spelled the same in every locale
  const kicker = 'Boardly'

  const linkButtonStyle = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--bd-coral-deep)', fontWeight: 600, textDecoration: 'underline', fontSize: 14,
  } as const

  if (sent) {
    return (
      <AuthShell kicker={kicker} title={t('auth.forgotPassword.checkEmail')} subtitle={t('auth.forgotPassword.emailSent', { email })}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <div className="bd-avatar bd-avatar-mint" style={{ width: 56, height: 56, borderRadius: 18, color: 'var(--bd-ink-on-accent)' }}>
            <Icon name="mail" size={28} />
          </div>
          <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', margin: 0 }}>{t('auth.forgotPassword.checkSpam')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setEmail('')
            }}
            className="bd-btn bd-btn-ghost"
            style={{ justifyContent: 'center' }}
          >
            {t('auth.forgotPassword.sendAnother')}
          </button>
          <button type="button" onClick={navigateToLogin} className="bd-btn bd-btn-coral" style={{ justifyContent: 'center' }}>
            {t('auth.forgotPassword.backToLogin')}
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell kicker={kicker} title={t('auth.forgotPassword.title')} subtitle={t('auth.forgotPassword.subtitle')}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="forgot-email" style={{ fontSize: 13, fontWeight: 600, color: 'var(--bd-ink-soft)' }}>
            {t('auth.forgotPassword.email')}
          </label>
          <input
            id="forgot-email"
            type="email"
            required
            disabled={loading}
            className="bd-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.forgotPassword.emailPlaceholder')}
            autoComplete="email"
          />
        </div>

        <button type="submit" disabled={loading} className="bd-btn bd-btn-coral bd-btn-lg" style={{ justifyContent: 'center', marginTop: 4 }}>
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LoadingSpinner size="sm" />
              <span>{t('auth.forgotPassword.sending')}</span>
            </span>
          ) : (
            t('auth.forgotPassword.submit')
          )}
        </button>

        <div style={{ borderTop: '1px solid var(--bd-line)', paddingTop: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', margin: 0 }}>{t('auth.forgotPassword.remember')}</p>
          <button type="button" onClick={navigateToLogin} style={{ ...linkButtonStyle, marginTop: 6 }}>
            {t('auth.forgotPassword.backToLogin')}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
