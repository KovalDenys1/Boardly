'use client'

import { Suspense, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Friends from '@/components/Friends'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useTranslation } from '@/lib/i18n-helpers'

function FriendsPageContent() {
  const { status } = useSession()
  const router = useRouter()
  const { t } = useTranslation()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?returnUrl=/friends')
    }
  }, [status, router])

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="bd-page bd-screen page-shell">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-6 desk:mb-8">
            <span className="bd-kicker">{t('profile.friends.pageKicker')}</span>
            <h1 className="mt-3 font-display text-[clamp(2.5rem,7vw,4rem)] font-extrabold leading-[0.95] text-bd-ink">
              {t('profile.friends.title')}{' '}
              <span className="text-bd-coral-text">{t('profile.friends.pageSubtitle')}</span>
            </h1>
          </header>

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
