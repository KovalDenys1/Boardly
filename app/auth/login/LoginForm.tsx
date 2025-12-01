'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { loginSchema } from '@/lib/validation/auth'
import PasswordInput from '@/components/PasswordInput'
import LoadingSpinner from '@/components/LoadingSpinner'
import { showToast } from '@/lib/i18n-toast'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const returnUrl = searchParams.get('returnUrl') || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setFieldErrors({})

    try {
      // client-side validate
      const parsed = loginSchema.safeParse(formData)
      if (!parsed.success) {
        const errs: Record<string, string> = {}
        parsed.error.issues.forEach((i) => {
          const k = String(i.path[0] ?? 'form')
          if (!errs[k]) errs[k] = i.message
        })
        setFieldErrors(errs)
        throw new Error('Please fix the highlighted fields')
      }

      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (result?.error) {
        setError(t('auth.login.error'))
        showToast.error('auth.login.error')
      } else {
        showToast.success('auth.login.success')
        router.push(returnUrl)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
      showToast.error('errors.generic', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: string) => {
    setLoading(true)
    try {
      await signIn(provider, { callbackUrl: returnUrl })
    } catch (err: any) {
      setError(err.message)
      showToast.error('errors.generic', `Failed to sign in with ${provider}`)
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
                  {t('auth.login.invited', "You've been invited to a game!")}
                </p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  {t('auth.login.loginToJoin', 'Login to join the lobby')}
                </p>
              </div>
            </div>
          </div>
        )}
        
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-900 dark:text-white">
          {t('auth.login.title')}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('auth.login.email')}</label>
            <input
              type="email"
              required
              disabled={loading}
              className="input"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('auth.login.emailPlaceholder')}
              autoComplete="email"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <PasswordInput
              value={formData.password}
              onChange={(value) => setFormData({ ...formData, password: value })}
              placeholder={t('auth.login.passwordPlaceholder')}
              autoComplete="current-password"
              showStrength={false}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                {t('auth.login.rememberMe', 'Remember me')}
              </span>
            </label>
            <Link 
              href="/auth/forgot-password" 
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('auth.login.forgotPassword')}
            </Link>
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
              <>
                <LoadingSpinner />
                <span className="ml-2">{t('auth.login.loggingIn', 'Logging in...')}</span>
              </>
            ) : (
              t('auth.login.submit')
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
            {t('auth.login.withGoogle')}
          </button>

          <button
            onClick={() => handleOAuthSignIn('github')}
            disabled={loading}
            className="oauth-btn oauth-btn-github"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {t('auth.login.withGitHub', 'Continue with GitHub')}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          {t('auth.login.noAccount')}{' '}
          <Link 
            href={`/auth/register${returnUrl !== '/' ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            {t('auth.login.register')}
          </Link>
        </p>
      </div>
    </div>
  )
}
