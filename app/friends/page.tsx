'use client'

import { Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Friends from '@/components/Friends'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useTranslation } from '@/lib/i18n-helpers'

function FriendsPageContent() {
  const { status } = useSession()
  const router = useRouter()
  const { t } = useTranslation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    router.push('/auth/login?returnUrl=/friends')
    return null
  }

  return (
    <div className="bd-page bd-screen page-shell">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
            <div>
              <span className="bd-kicker">{t('profile.friends.pageKicker')}</span>
              <h1
                className="mt-3 text-[clamp(2.5rem,7vw,4rem)] font-extrabold leading-[0.95] text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {t('profile.friends.title')}{' '}
                <span style={{ color: 'var(--bd-coral)' }}>{t('profile.friends.pageSubtitle')}</span>
              </h1>
            </div>
          </div>

          <Friends />
        </div>
      </div>
    </div>
  )
}

export default function FriendsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <FriendsPageContent />
    </Suspense>
  )
}
