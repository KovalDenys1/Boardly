'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PasswordInput from '@/components/PasswordInput'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Icon } from '@/components/icons'
import { showToast } from '@/lib/i18n-toast'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import { useTranslation } from '@/lib/i18n-helpers'
import AuthShell, { AuthShellLoading } from '@/components/auth/AuthShell'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const navigateToLogin = () => router.push(buildCurrentAuthUrl('login'))
  const navigateToForgotPassword = () => router.push('/auth/forgot-password')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('auth.register.passwordMismatch'))
      return
    }

    if (!token) {
      setError(t('auth.resetPassword.invalidToken'))
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || t('auth.resetPassword.error'))
      }

      showToast.success('auth.resetPassword.success')
      router.push(buildCurrentAuthUrl('login'))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('auth.resetPassword.error')
      setError(errorMessage)
      showToast.errorFrom(err, 'auth.resetPassword.error')
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

  if (!token) {
    return (
      <AuthShell kicker={kicker} title={t('auth.resetPassword.invalidTitle')} subtitle={t('auth.resetPassword.invalidHelp')}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="bd-avatar bd-avatar-coral" style={{ width: 56, height: 56, borderRadius: 18, color: 'var(--bd-ink-on-accent)' }}>
            <Icon name="warning" size={28} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={navigateToForgotPassword} className="bd-btn bd-btn-coral" style={{ justifyContent: 'center' }}>
            {t('auth.resetPassword.requestNewLink')}
          </button>
          <button type="button" onClick={navigateToLogin} className="bd-btn bd-btn-ghost" style={{ justifyContent: 'center' }}>
            {t('auth.resetPassword.loginLink')}
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell kicker={kicker} title={t('auth.resetPassword.title')} subtitle={t('auth.resetPassword.subtitle')}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PasswordInput
          value={password}
          onChange={setPassword}
          label={t('auth.resetPassword.password')}
          placeholder={t('auth.resetPassword.passwordPlaceholder')}
          autoComplete="new-password"
          showStrength={true}
          showRequirements={false}
          required={true}
        />

        <PasswordInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          label={t('auth.resetPassword.confirmPassword')}
          placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
          autoComplete="new-password"
          showStrength={false}
          required={true}
        />

        {error && (
          <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 12, fontSize: 14, color: 'var(--bd-coral-deep)', background: 'rgba(255,107,91,0.10)', border: '1.5px solid rgba(255,107,91,0.35)' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="bd-btn bd-btn-coral bd-btn-lg" style={{ justifyContent: 'center', marginTop: 4 }}>
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LoadingSpinner size="sm" />
              <span>{t('auth.resetPassword.resetting')}</span>
            </span>
          ) : (
            t('auth.resetPassword.submit')
          )}
        </button>

        <div style={{ borderTop: '1px solid var(--bd-line)', paddingTop: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', margin: 0 }}>{t('auth.resetPassword.remember')}</p>
          <button type="button" onClick={navigateToLogin} style={{ ...linkButtonStyle, marginTop: 6 }}>
            {t('auth.resetPassword.loginLink')}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShellLoading spinner={<LoadingSpinner />} />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
