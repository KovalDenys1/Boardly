'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import LoadingSpinner from '@/components/LoadingSpinner'
import { showToast } from '@/lib/i18n-toast'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

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

      showToast.success('auth.resetPasswordSuccess')
      setSent(true)
    } catch (err: any) {
      showToast.error('auth.resetPasswordError')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-6xl mb-4">📧</div>
          <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
            {t('auth.forgotPassword.checkEmail')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('auth.forgotPassword.emailSent', { email })}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
            {t('auth.forgotPassword.checkSpam')}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
              className="btn btn-secondary w-full"
            >
              {t('auth.forgotPassword.sendAnother')}
            </button>
            <Link href="/auth/login" className="btn btn-primary w-full block">
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="card max-w-md w-full">
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-900 dark:text-white">
          {t('auth.forgotPassword.title')}
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          {t('auth.forgotPassword.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('auth.forgotPassword.email')}</label>
            <input
              type="email"
              required
              disabled={loading}
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.forgotPassword.emailPlaceholder')}
              autoComplete="email"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">{t('auth.forgotPassword.sending')}</span>
              </>
            ) : (
              t('auth.forgotPassword.submit')
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          {t('auth.forgotPassword.remember')}{' '}
          <Link 
            href="/auth/login"
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            {t('auth.forgotPassword.loginLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
