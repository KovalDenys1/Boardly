'use client'

import type { ElementType } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

export interface BoardlyErrorCardProps {
  error?: Error & { digest?: string }
  onRetry: () => void
  /** `next/link` in the app; a plain anchor where the router may be what broke. */
  HomeLink?: ElementType
  homeHref?: string
  retryLabel?: string
  homeLabel?: string
  title?: string
  message?: string
  kicker?: string
  showDevDetails?: boolean
}

export default function BoardlyErrorCard({
  error,
  onRetry,
  HomeLink = 'a',
  homeHref = '/',
  retryLabel,
  homeLabel,
  title,
  message,
  kicker = 'Boardly',
  showDevDetails = true,
}: BoardlyErrorCardProps) {
  const { t } = useTranslation()
  const resolvedTitle = title || t('errorPage.title')
  const resolvedMessage =
    message ||
    (process.env.NODE_ENV === 'development'
      ? error?.message || t('errorPage.message')
      : t('errorPage.message'))
  const resolvedRetryLabel = retryLabel || t('errorPage.tryAgain')
  const resolvedHomeLabel = homeLabel || t('errorPage.goHome')

  return (
    <div
      className="mobile-vh-100 safe-top safe-bottom safe-left safe-right relative overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 15% 15%, rgba(255,196,77,0.22), transparent 38%), radial-gradient(circle at 85% 10%, rgba(155,140,255,0.18), transparent 38%), radial-gradient(circle at 50% 90%, rgba(79,201,166,0.16), transparent 42%), var(--bd-bg)',
      }}
    >
      <div className="relative mx-auto grid h-full w-full max-w-4xl place-items-center p-4 sm:p-6">
        <div className="bd-card w-full max-w-xl px-6 py-8 text-center sm:px-10 sm:py-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.25rem] border-2 border-bd-ink bg-bd-sun text-3xl shadow-[4px_4px_0_var(--bd-ink)]">
            !
          </div>

          <span className="bd-kicker mt-5 inline-block">{kicker}</span>

          <h1
            className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-black leading-none text-bd-ink"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            {resolvedTitle}
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-bd-ink-soft sm:text-base">
            {resolvedMessage}
          </p>

          {error?.digest && (
            <div className="mt-5 flex justify-center">
              <span className="bd-chip px-3 py-1.5 text-xs">{t('errorPage.errorId')}: {error.digest}</span>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button onClick={onRetry} className="bd-btn bd-btn-primary justify-center">
              {resolvedRetryLabel}
            </button>
            <HomeLink href={homeHref} className="bd-btn bd-btn-ghost justify-center">
              {resolvedHomeLabel}
            </HomeLink>
          </div>

          {showDevDetails && process.env.NODE_ENV === 'development' && error && (
            <details className="mt-6 rounded-2xl border border-bd-line bg-bd-card-warm p-4 text-left">
              <summary className="cursor-pointer text-sm font-semibold text-bd-ink-soft">
                {t('errorPage.devDetails')}
              </summary>
              <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap wrap-break-word text-xs leading-5 text-bd-ink-soft">
                {error.stack || error.message}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
