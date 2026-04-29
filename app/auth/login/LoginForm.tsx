'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProviders, signIn } from 'next-auth/react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { loginSchema } from '@/lib/validation/auth'
import PasswordInput from '@/components/PasswordInput'
import LoadingSpinner from '@/components/LoadingSpinner'
import { showToast } from '@/lib/i18n-toast'
import { trackAuth, trackError } from '@/lib/analytics'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  buildAuthUrl,
  resolveReturnUrlFromSearchParams,
} from '@/lib/auth-redirect'
import { getLastAccount, saveLastAccount, type LastAccount } from '@/lib/last-account'
import { UserAvatar } from '@/components/Header/UserAvatar'

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
  const [lastAccount, setLastAccount] = useState<LastAccount | null>(null)
  const [showChip, setShowChip] = useState(false)
  const [oauthProviderIds, setOauthProviderIds] = useState<string[]>([])
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = getLastAccount()
    if (saved) {
      setLastAccount(saved)
      setShowChip(true)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    getProviders()
      .then((providers) => {
        if (!isMounted || !providers) return

        setOauthProviderIds(
          ['google', 'github', 'discord'].filter((providerId) => {
            const provider = providers[providerId]
            return provider && provider.type !== 'credentials'
          })
        )
      })
      .catch(() => {
        if (isMounted) {
          setOauthProviderIds([])
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const returnUrl = resolveReturnUrlFromSearchParams(searchParams)
  const isLobbyInviteFlow =
    returnUrl.startsWith('/lobby/') && !returnUrl.startsWith('/lobby/create')

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

      const normalizedEmail = parsed.data.email

      const result = await signIn('credentials', {
        email: normalizedEmail,
        password: parsed.data.password,
        rememberMe: rememberMe ? 'true' : 'false',
        redirect: false,
      })

      if (result?.error) {
        showToast.error('auth.login.error')
        // Track failed login
        trackAuth({
          event: 'login',
          method: 'email',
          success: false,
          userId: undefined,
        })
        trackError({
          errorType: 'auth',
          errorMessage: 'Login failed',
          component: 'LoginForm',
          severity: 'low',
        })
      } else {
        showToast.success('auth.login.success')
        
        // Track successful login
        trackAuth({
          event: 'login',
          method: 'email',
          success: true,
          userId: normalizedEmail, // Will be replaced with actual userId by session
        })
        
        saveLastAccount({
          email: normalizedEmail,
          name: null,
          image: null,
        })

        router.push(returnUrl)
        router.refresh()
      }
    } catch (err: unknown) {
      showToast.errorFrom(err, 'auth.login.error')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: string) => {
    setLoading(true)
    try {
      // Track OAuth attempt
      trackAuth({
        event: 'login',
        method: provider === 'google' ? 'google' : 'email', // Type-safe provider
        success: true, // We track attempt here, actual success is on callback
        userId: undefined,
      })
      
      await signIn(provider, { callbackUrl: returnUrl })
    } catch (err: unknown) {
      setError((err as Error).message)
      showToast.errorFrom(err, 'auth.login.oauthError')
      
      trackError({
        errorType: 'auth',
        errorMessage: `OAuth ${provider} failed: ${(err as Error).message}`,
        component: 'LoginForm',
        severity: 'medium',
      })
      
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
            {t('auth.login.invited', "You've been invited to a game!")}
          </p>
          <p className="mt-1 text-sm leading-6 text-green-600 dark:text-green-400">
            {t('auth.login.loginToJoin', 'Login to join the lobby')}
          </p>
        </div>
      </div>
    </div>
  )

  const renderProviderButtons = () => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {oauthProviderIds.includes('google') && (
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
      )}

      {oauthProviderIds.includes('github') && (
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
      )}

      {oauthProviderIds.includes('discord') && (
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
      )}
    </div>
  )

  const renderLastAccountChip = (tone: 'light' | 'dark' = 'light') => {
    if (!showChip || !lastAccount) return null

    const chipClassName = tone === 'dark'
      ? 'border-white/15 bg-white/8 hover:border-white/25 hover:bg-white/12'
      : 'border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 hover:border-blue-200 hover:bg-blue-50/70 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/90 dark:hover:border-blue-500/40 dark:hover:bg-slate-800/90'

    const primaryTextClassName = tone === 'dark'
      ? 'text-white'
      : 'text-slate-900 dark:text-white'

    const secondaryTextClassName = tone === 'dark'
      ? 'text-white/70'
      : 'text-slate-600 dark:text-slate-300'

    const dismissClassName = tone === 'dark'
      ? 'text-white/65 hover:text-white'
      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'

    const avatarClassName = tone === 'dark'
      ? 'h-10 w-10 shrink-0 bg-white/15 text-white'
      : 'h-10 w-10 shrink-0 bg-blue-600 text-white'

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setFormData((prev) => ({ ...prev, email: lastAccount.email }))
            setShowChip(false)
            setTimeout(() => passwordRef.current?.focus(), 0)
          }}
          className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition-colors ${chipClassName}`}
        >
          <UserAvatar
            image={lastAccount.image}
            userName={lastAccount.name}
            userEmail={lastAccount.email}
            className={avatarClassName}
            textClassName="text-sm font-bold"
          />
          <div className="min-w-0 flex-1">
            {lastAccount.name && (
              <p className={`truncate text-sm font-semibold ${primaryTextClassName}`}>{lastAccount.name}</p>
            )}
            <p className={`truncate text-sm ${secondaryTextClassName}`}>{lastAccount.email}</p>
          </div>
          <span className={`shrink-0 ${secondaryTextClassName}`}>→</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setShowChip(false)
            setFormData((prev) => ({ ...prev, email: '' }))
          }}
          className={`mt-2 w-full text-center text-xs transition-colors ${dismissClassName}`}
        >
          Sign in with a different account
        </button>
      </div>
    )
  }

  return (
    <div className="bd-screen" style={{
      minHeight: '100svh', overflowX: 'hidden', overflowY: 'auto',
      background: 'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14), transparent 50%), var(--bd-bg)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center', padding: '40px 32px', minHeight: '100svh', boxSizing: 'border-box' }}>

        {/* LEFT: form */}
        <div style={{ maxWidth: 460, justifySelf: 'center', width: '100%' }}>
          <span className="bd-kicker">{t('auth.login.title')}</span>
          <h1 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 52, lineHeight: 1, marginTop: 8, marginBottom: 12, letterSpacing: '-0.02em', color: 'var(--bd-ink)' }}>
            Welcome back 👋
          </h1>
          <p style={{ color: 'var(--bd-ink-soft)', fontSize: 16, marginBottom: 28 }}>
            {t('auth.login.noAccount')}{' '}
            <Link href={buildAuthUrl('register', returnUrl)} style={{ color: 'var(--bd-coral)', fontWeight: 600, textDecoration: 'underline' }}>
              {t('auth.login.register')}
            </Link>
          </p>

          {isLobbyInviteFlow && (
            <div style={{ marginBottom: 20, padding: 16, background: 'rgba(79,201,166,0.12)', border: '1.5px solid rgba(79,201,166,0.3)', borderRadius: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 24 }}>🎮</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--bd-mint-deep)', fontSize: 14 }}>{t('auth.login.invited', "You've been invited to a game!")}</div>
                <div style={{ fontSize: 13, color: 'var(--bd-ink-soft)', marginTop: 2 }}>{t('auth.login.loginToJoin', 'Login to join the lobby')}</div>
              </div>
            </div>
          )}

          <div className="bd-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {showChip && lastAccount && (
              <div style={{ marginBottom: 4 }}>
                {renderLastAccountChip()}
              </div>
            )}

            {oauthProviderIds.length > 0 && (
              <>
                {renderProviderButtons()}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--bd-ink-muted)', fontSize: 13 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--bd-line)' }} />
                  {t('common.or')}
                  <div style={{ flex: 1, height: 1, background: 'var(--bd-line)' }} />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--bd-ink-soft)' }}>{t('auth.login.email')}</label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  className="bd-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t('auth.login.emailPlaceholder')}
                  autoComplete="email"
                />
                {fieldErrors.email && <p style={{ fontSize: 13, color: 'var(--bd-coral-deep)', marginTop: 2 }}>{fieldErrors.email}</p>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div ref={(el) => {
                  if (el) {
                    const input = el.querySelector('input')
                    if (input) (passwordRef as React.MutableRefObject<HTMLInputElement>).current = input
                  }
                }}>
                  <PasswordInput
                    value={formData.password}
                    onChange={(value) => setFormData({ ...formData, password: value })}
                    placeholder={t('auth.login.passwordPlaceholder')}
                    autoComplete="current-password"
                    showStrength={false}
                  />
                </div>
                {fieldErrors.password && <p style={{ fontSize: 13, color: 'var(--bd-coral-deep)', marginTop: 2 }}>{fieldErrors.password}</p>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--bd-ink-soft)' }}>
                  <Checkbox checked={rememberMe} onCheckedChange={setRememberMe} disabled={loading} />
                  {t('auth.login.rememberMe', 'Remember me')}
                </Label>
                <Link
                  href={returnUrl === '/' ? '/auth/forgot-password' : `/auth/forgot-password?returnUrl=${encodeURIComponent(returnUrl)}`}
                  style={{ fontSize: 14, fontWeight: 500, color: 'var(--bd-coral)', textDecoration: 'underline' }}
                >
                  {t('auth.login.forgotPassword')}
                </Link>
              </div>

              {error && (
                <div style={{ padding: '12px 16px', background: 'rgba(255,107,91,0.1)', border: '1.5px solid rgba(255,107,91,0.3)', borderRadius: 12, fontSize: 14, color: 'var(--bd-coral-deep)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="bd-btn bd-btn-coral bd-btn-lg" style={{ justifyContent: 'center', marginTop: 4 }}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LoadingSpinner size="sm" />
                    {t('auth.login.loggingIn', 'Logging in...')}
                  </span>
                ) : t('auth.login.submit')}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT: illustrated panel */}
        <div style={{
          position: 'relative',
          background: 'linear-gradient(135deg, var(--bd-coral) 0%, var(--bd-sun) 100%)',
          borderRadius: 36, padding: 48, aspectRatio: '4 / 5', overflow: 'hidden',
          border: '3px solid var(--bd-ink)',
          boxShadow: '10px 10px 0 var(--bd-ink)',
        }} className="hidden lg:block">
          <div className="bd-dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 40, color: 'var(--bd-ink)', lineHeight: 0.95, marginBottom: 12 }}>
                &ldquo;Best<br />Friday<br />night&rdquo;
              </div>
              <div style={{ fontSize: 14, color: 'rgba(31,27,22,0.7)', maxWidth: 200 }}>
                — our players about boardly
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
              <div style={{ display: 'flex' }}>
                {[['A','bd-avatar-mint'],['L','bd-avatar-lav'],['M','bd-avatar-sky']].map(([l, cls], i) => (
                  <div key={l} className={`bd-avatar ${cls}`} style={{ width: 36, height: 36, marginLeft: i > 0 ? -10 : 0 }}>{l}</div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: 'var(--bd-ink)', fontWeight: 500 }}>180,000+ players already here</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
