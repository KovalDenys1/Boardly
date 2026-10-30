'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

export default function NotFound() {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <div
      className="safe-bottom safe-left safe-right relative flex min-h-(--game-h) overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 15% 15%, rgba(255,196,77,0.22), transparent 38%), radial-gradient(circle at 85% 10%, rgba(155,140,255,0.18), transparent 38%), radial-gradient(circle at 50% 90%, rgba(79,201,166,0.16), transparent 42%), var(--bd-bg)',
      }}
    >
      <div className="relative mx-auto grid w-full max-w-4xl place-items-center p-4 sm:p-6">
        <div className="bd-card w-full max-w-xl px-6 py-8 text-center sm:px-10 sm:py-10">
          {/* i18n-allow: brand name, identical in all four locales */}
          <span className="bd-kicker">Boardly · {t('notFoundPage.lostRoute')}</span>

          <p
            aria-hidden="true"
            className="mt-2 text-[clamp(5rem,24vw,9rem)] font-black leading-none text-bd-ink"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            404
          </p>

          <h1
            className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-bd-ink sm:text-3xl"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            {t('notFoundPage.title')}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-base font-semibold text-bd-ink-soft">
            {t('notFoundPage.description')}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-bd-ink-soft">
            {t('notFoundPage.description2')}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/lobby" className="bd-btn bd-btn-primary h-12 justify-center">
              {t('notFoundPage.browseLobby')}
            </Link>
            <Link href="/" className="bd-btn bd-btn-ghost h-12 justify-center">
              {t('notFoundPage.goHome')}
            </Link>
            <button
              onClick={() => router.back()}
              className="bd-btn bd-btn-soft h-12 justify-center sm:col-span-2"
            >
              {t('notFoundPage.goBack')}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Link href="/lobby/create" className="bd-chip px-3 py-1.5 text-xs">
              {t('notFound.createLobby')}
            </Link>
            <Link href="/games" className="bd-chip px-3 py-1.5 text-xs">
              {t('header.games')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
