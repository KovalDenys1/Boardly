'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import LoadingSpinner from '@/components/LoadingSpinner'
import { showToast } from '@/lib/i18n-toast'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'

const shellClassName = 'relative min-h-[100svh] overflow-x-hidden overflow-y-auto bg-[#070b18]'
const frameClassName = 'relative mx-auto flex min-h-[100svh] w-full box-border items-center justify-center px-4 py-3 sm:px-6 sm:py-4 lg:px-8'
const cardClassName = 'w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/30 bg-white/[0.94] text-gray-900 shadow-[0_32px_120px_rgba(2,6,23,0.65)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/[0.94] dark:text-gray-100'
const panelClassName = 'mx-auto mt-5 max-w-xl rounded-[30px] border border-slate-200/80 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/35 sm:p-5'

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

  const background = (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.26),transparent_32%),radial-gradient(circle_at_top_right,rgba(217,70,239,0.24),transparent_34%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.18),transparent_28%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
    </>
  )

  if (sent) {
    const sentDescription = t('auth.forgotPassword.emailSent', { email })

    return (
      <div className={shellClassName}>
        {background}
        <div className={frameClassName}>
          <div className={cardClassName}>
            <div className="px-5 py-5 sm:px-8 sm:py-6">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600/80 dark:text-blue-300/80">
                  Boardly
                </p>
                <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                  {t('auth.forgotPassword.checkEmail')}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                  {sentDescription}
                </p>
              </div>

              <div className={panelClassName}>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-emerald-50 text-3xl shadow-sm dark:bg-emerald-950/40">
                  📧
                </div>
                <p className="mt-4 text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {t('auth.forgotPassword.checkSpam')}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSent(false)
                      setEmail('')
                    }}
                    className="btn btn-secondary w-full text-sm sm:text-base"
                  >
                    {t('auth.forgotPassword.sendAnother')}
                  </button>
                  <button
                    type="button"
                    onClick={navigateToLogin}
                    className="btn btn-primary w-full text-sm sm:text-base"
                  >
                    {t('auth.forgotPassword.backToLogin')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={shellClassName}>
      {background}
      <div className={frameClassName}>
        <div className={cardClassName}>
          <div className="px-5 py-5 sm:px-8 sm:py-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600/80 dark:text-blue-300/80">
                Boardly
              </p>
              <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                {t('auth.forgotPassword.title')}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                {t('auth.forgotPassword.subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className={panelClassName}>
              <div>
                <label className="label">{t('auth.forgotPassword.email')}</label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  className="input text-base sm:text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.forgotPassword.emailPlaceholder')}
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-4 btn btn-primary w-full text-sm sm:text-base"
              >
                {loading ? (
                  <span className="flex flex-row items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span>{t('auth.forgotPassword.sending')}</span>
                  </span>
                ) : (
                  t('auth.forgotPassword.submit')
                )}
              </button>

              <div className="mt-4 border-t border-slate-200 pt-4 text-center dark:border-white/10">
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {t('auth.forgotPassword.remember')}
                </p>
                <button
                  type="button"
                  onClick={navigateToLogin}
                  className="mt-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {t('auth.forgotPassword.backToLogin')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
