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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  buildAuthUrl,
  resolveReturnUrlFromSearchParams,
} from '@/lib/auth-redirect'

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
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const returnUrl = resolveReturnUrlFromSearchParams(searchParams)
  const isLobbyInviteFlow =
    returnUrl.startsWith('/lobby/') && !returnUrl.startsWith('/lobby/create')
  const passwordChecks = [
    {
      met: formData.password.length >= 8,
      text: t('auth.password.requirement.length', 'At least 8 characters'),
    },
    {
      met: /[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password),
      text: t('auth.password.requirement.case', 'Upper & lowercase letters'),
    },
    {
      met: /\d/.test(formData.password),
      text: t('auth.password.requirement.number', 'At least one number'),
    },
  ]
  const passwordScore = Math.min(
    Number(formData.password.length >= 8) +
      Number(formData.password.length >= 12) +
      Number(/[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password)) +
      Number(/\d/.test(formData.password)),
    3
  )
  const passwordStrengthLevels = [
    { label: t('auth.password.weak', 'Weak'), color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
    { label: t('auth.password.fair', 'Fair'), color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400' },
    { label: t('auth.password.good', 'Good'), color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' },
    { label: t('auth.password.strong', 'Strong'), color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
  ] as const
  const passwordStrength = passwordStrengthLevels[passwordScore]
  const passwordTooltip = (
    <div className="space-y-2">
      <p className="font-semibold text-slate-700 dark:text-slate-100">
        {t('auth.password.requirements', 'Password requirements')}
      </p>
      <div className="space-y-1.5">
        {passwordChecks.map((check) => (
          <div key={check.text} className="flex items-center gap-2">
            {check.met ? (
              <svg className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className={check.met ? 'text-slate-700 dark:text-slate-200' : undefined}>{check.text}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setFieldErrors({})
    try {
      if (!agreedToTerms) {
        showToast.error('auth.register.mustAgreeToTerms')
        throw new Error(t('auth.register.mustAgreeToTerms'))
      }
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

      const sanitizedInput = parsed.data

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedInput),
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
        userId: sanitizedInput.email,
      })
      trackFunnelStep('register')
      // Auto-login after registration
      const loginResult = await signIn('credentials', {
        email: sanitizedInput.email,
        password: sanitizedInput.password,
        rememberMe: rememberMe ? 'true' : 'false',
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

  const renderInviteBanner = () => (
    <div className="rounded-2xl border border-emerald-300/90 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4 shadow-sm dark:border-emerald-600/70 dark:from-emerald-900/20 dark:via-slate-900/60 dark:to-sky-900/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-2xl shadow-sm dark:bg-slate-900/60">
          🎮
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-green-700 dark:text-green-300">
            {t('auth.register.inviteBanner')}
          </p>
          <p className="mt-1 text-sm leading-6 text-green-600 dark:text-green-400">
            {t('auth.register.inviteSubtitle')}
          </p>
        </div>
      </div>
    </div>
  )

  const renderProviderButtons = () => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <button
        onClick={() => handleOAuthSignIn('google')}
        disabled={loading}
        className="oauth-btn oauth-btn-google min-h-[44px] rounded-2xl text-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Google
      </button>

      <button
        onClick={() => handleOAuthSignIn('github')}
        disabled={loading}
        className="oauth-btn oauth-btn-github min-h-[44px] rounded-2xl text-sm"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        GitHub
      </button>

      <button
        onClick={() => handleOAuthSignIn('discord')}
        disabled={loading}
        className="oauth-btn oauth-btn-discord min-h-[44px] rounded-2xl text-sm"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        Discord
      </button>
    </div>
  )

  return (
    <div className="relative min-h-[100svh] overflow-x-hidden overflow-y-auto bg-[#070b18]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.26),transparent_32%),radial-gradient(circle_at_top_right,rgba(217,70,239,0.24),transparent_34%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.18),transparent_28%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="relative mx-auto flex min-h-[100svh] w-full box-border items-center justify-center px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="w-full max-w-5xl">
          <div className="overflow-hidden rounded-[32px] border border-white/30 bg-white/[0.94] text-gray-900 shadow-[0_32px_120px_rgba(2,6,23,0.65)] backdrop-blur-2xl md:min-h-[28rem] dark:border-white/10 dark:bg-slate-900/[0.94] dark:text-gray-100">
            <div className="px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
              <div className="mx-auto max-w-3xl text-center">
                <Link
                  href="/"
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600/80 hover:text-blue-600 dark:text-blue-300/80 dark:hover:text-blue-300 transition-colors"
                >
                  Boardly
                </Link>
                <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                  {t('auth.register.title')}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                  {t('auth.register.haveAccount')}{' '}
                  <Link
                    href={buildAuthUrl('login', returnUrl)}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Login
                  </Link>
                </p>
              </div>

              {isLobbyInviteFlow && (
                <div className="mx-auto mt-5 max-w-2xl">
                  {renderInviteBanner()}
                </div>
              )}

              <div className="mx-auto mt-4 max-w-3xl space-y-3">
                <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/82 p-2 shadow-sm dark:border-white/10 dark:bg-slate-800/72 sm:p-2.5">
                  {renderProviderButtons()}
                </div>

                <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400 dark:text-slate-500">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-white/10"></div>
                  <span>{t('common.or')}</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-white/10"></div>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="space-y-3 rounded-[30px] border border-slate-200/80 bg-white/85 p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-950/35"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label">{t('auth.register.email')}</label>
                      <input
                        type="email"
                        required
                        disabled={loading}
                        className="input text-base sm:text-sm"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder={t('auth.register.emailPlaceholder')}
                        autoComplete="email"
                      />
                      {fieldErrors.email && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
                      )}
                    </div>

                    <div className="[&_input]:text-base sm:[&_input]:text-sm">
                      <UsernameInput
                        value={formData.username}
                        onChange={(username) => setFormData({ ...formData, username })}
                        error={fieldErrors.username}
                        disabled={loading}
                        required={true}
                        onAvailabilityChange={setUsernameAvailable}
                      />
                    </div>

                    <div className="[&_input]:text-base sm:[&_input]:text-sm">
                      <PasswordInput
                        value={formData.password}
                        onChange={(value) => setFormData({ ...formData, password: value })}
                        placeholder={t('auth.register.passwordPlaceholder')}
                        autoComplete="new-password"
                        showStrength={false}
                        statusText={formData.password ? passwordStrength.label : undefined}
                        statusClassName={passwordStrength.textColor}
                        hint={passwordTooltip}
                        hintLabel={t('auth.password.requirements', 'Password requirements')}
                        required={true}
                      />
                      {fieldErrors.password && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
                      )}
                    </div>

                    <div className="[&_input]:text-base sm:[&_input]:text-sm">
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
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-700 dark:bg-slate-800/70 md:grid md:grid-cols-[minmax(0,1fr)_170px] md:items-center md:gap-4">
                    <Label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={agreedToTerms}
                        onCheckedChange={setAgreedToTerms}
                        disabled={loading}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="min-w-0 text-sm leading-5 text-gray-700 dark:text-gray-300">
                        {t('auth.register.agreeToTerms')}{' '}
                        <Link href="/terms" target="_blank" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                          {t('auth.register.termsOfService')}
                        </Link>
                        {' '}{t('common.and')}{' '}
                        <Link href="/privacy" target="_blank" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                          {t('auth.register.privacyPolicy')}
                        </Link>
                      </span>
                    </Label>

                    <Label className="mt-3 flex cursor-pointer items-center gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-700/80 md:mt-0 md:justify-self-end md:border-t-0 md:pt-0">
                      <Checkbox
                        checked={rememberMe}
                        onCheckedChange={setRememberMe}
                        disabled={loading}
                        className="shrink-0"
                      />
                      <span className="min-w-0 text-sm leading-5 text-gray-700 dark:text-gray-300">
                        {t('auth.login.rememberMe')}
                      </span>
                    </Label>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-full text-sm sm:text-base"
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
