'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { registerSchema, zodIssuesToFieldErrors } from '@/lib/validation/auth'
import PasswordInput from '@/components/PasswordInput'
import UsernameInput from '@/components/UsernameInput'
import LoadingSpinner from '@/components/LoadingSpinner'
import { showToast } from '@/lib/i18n-toast'
import { trackAuth, trackError, trackFunnelStep } from '@/lib/analytics'

export default function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; username?: string; password?: string; confirmPassword?: string }>({})
  const [loading, setLoading] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(false)
  const returnUrl = searchParams.get('returnUrl') || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setFieldErrors({})

    try {
      if (formData.password !== formData.confirmPassword) {
        setFieldErrors({ confirmPassword: t('auth.register.passwordMismatch') })
        throw new Error(t('auth.register.passwordMismatch'))
      }

      const parsed = registerSchema.safeParse(formData)
      if (!parsed.success) {
        const errs: Record<string, string> = {}
        parsed.error.issues.forEach((i) => {
          const k = String(i.path[0] ?? 'form')
          if (!errs[k]) errs[k] = i.message
        })
        setFieldErrors(errs)
        throw new Error(t('auth.register.fixFields'))
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        if (Array.isArray(data?.error)) {
          setFieldErrors(zodIssuesToFieldErrors(data.error))
          throw new Error(t('auth.register.fixFields'))
        }
        
        trackError({
          errorType: 'auth',
          errorMessage: data?.error || 'Registration failed',
          component: 'RegisterForm',
          severity: 'medium',
        })
        
        throw new Error(data?.error || t('auth.register.error'))
      }

      // Track successful registration
      trackAuth({
        event: 'register',
        method: 'email',
        success: true,
        userId: formData.email,
      })
      trackFunnelStep('register')

      // Auto-login after registration
      const loginResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (loginResult?.error) {
        showToast.error('auth.register.loginFailed')
        router.push(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`)
      } else {
        showToast.success('auth.register.success')
        router.push(returnUrl)
        router.refresh()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('auth.register.error')
      setError(errorMessage)
      showToast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: string) => {
    setLoading(true)
    try {
      await signIn(provider, { callbackUrl: returnUrl })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'OAuth sign in failed'
      setError(errorMessage)
      showToast.error('auth.register.oauthError')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="card max-w-md w-full">
        {/* Invite Banner */}
        {returnUrl.includes('/lobby/join/') && (
          <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-2 border-green-300 dark:border-green-600 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎮</span>
              <div>
                <p className="font-semibold text-green-700 dark:text-green-300">
                  {t('auth.register.inviteBanner')}
                </p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  {t('auth.register.inviteSubtitle')}
                </p>
              </div>
            </div>
          </div>
        )}
        
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-900 dark:text-white">
          {t('auth.register.title')}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('auth.register.email')}</label>
            <input
              type="email"
              required
              disabled={loading}
              className="input"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('auth.register.emailPlaceholder')}
              autoComplete="email"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <UsernameInput
              value={formData.username}
              onChange={(username) => setFormData({ ...formData, username })}
              error={fieldErrors.username}
              disabled={loading}
              required={true}
              onAvailabilityChange={setUsernameAvailable}
            />
          </div>

          <div>
            <PasswordInput
              value={formData.password}
              onChange={(value) => setFormData({ ...formData, password: value })}
              placeholder={t('auth.register.passwordPlaceholder')}
              autoComplete="new-password"
              showStrength={true}
              required={true}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <PasswordInput
              value={formData.confirmPassword}
              onChange={(value) => setFormData({ ...formData, confirmPassword: value })}
              placeholder={t('auth.register.confirmPasswordPlaceholder')}
              autoComplete="new-password"
              label={t('auth.register.confirmPassword')}
            />
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? (
              <span className="flex flex-row items-center justify-center gap-2">
                <LoadingSpinner size="sm" />
                <span>{t('auth.register.creating')}</span>
              </span>
            ) : (
              t('auth.register.submit')
            )}
          </button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('common.or')}</span>
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleOAuthSignIn('google')}
            disabled={loading}
            className="oauth-btn oauth-btn-google"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('auth.register.withGoogle')}
          </button>

          <button
            onClick={() => handleOAuthSignIn('github')}
            disabled={loading}
            className="oauth-btn oauth-btn-github"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {t('auth.register.withGitHub')}
          </button>

          <button
            onClick={() => handleOAuthSignIn('discord')}
            disabled={loading}
            className="oauth-btn oauth-btn-discord"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            {t('auth.register.withDiscord', 'Continue with Discord')}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          {t('auth.register.haveAccount')}{' '}
          <Link 
            href={`/auth/login${returnUrl !== '/' ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
