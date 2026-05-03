'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

export default function NotFound() {
  const router = useRouter()
  const { t } = useTranslation()

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
          <span className="bd-kicker">Boardly · {t('notFoundPage.lostRoute')}</span>

          <p
            className="mt-2 text-[clamp(5rem,24vw,9rem)] font-black leading-none text-bd-ink"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            404
          </p>

          <p className="mx-auto mt-3 max-w-sm text-lg font-bold text-bd-ink">
            {t('notFoundPage.description')}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-bd-ink-soft">
            {t('notFoundPage.description2')}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/lobby" className="bd-btn bd-btn-primary justify-center">
              {t('notFoundPage.browseLobby')}
            </Link>
            <Link href="/" className="bd-btn bd-btn-ghost justify-center">
              {t('notFoundPage.goHome')}
            </Link>
            <button
              onClick={() => router.back()}
              className="bd-btn bd-btn-soft justify-center sm:col-span-2"
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
