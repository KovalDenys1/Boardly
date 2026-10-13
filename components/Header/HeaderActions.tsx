'use client'

import type { KeyboardEvent } from 'react'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { navigateToProfile } from '@/lib/profile-navigation'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import { UserAvatar } from './UserAvatar'
import { ThemeToggle } from './ThemeToggle'
import { GuestMenu } from './GuestMenu'
import { UserMenu } from './UserMenu'

interface HeaderActionsProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

export function HeaderActions({ isAuthenticated, userName, userEmail, userImage }: HeaderActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const { isGuest } = useGuest()
  const [isGuestUiReady, setIsGuestUiReady] = useState(false)
  const isGuestSession = isGuestUiReady && isGuest && !isAuthenticated

  useEffect(() => {
    setIsGuestUiReady(true)
  }, [])

  const handleProfileNavigation = () => {
    navigateToProfile(router, pathname)
  }

  const handleProfileTextKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleProfileNavigation()
    }
  }

  if (isGuestSession) {
    return (
      <div className="hidden desk:flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          onClick={() => router.push(buildCurrentAuthUrl('login'))}
          className="px-4 py-2 rounded-xl font-medium transition-all duration-150 hover:bg-bd-bg2"
          style={{ color: 'var(--bd-ink-soft)', fontSize: 15 }}
        >
          {t('header.login')}
        </button>
        <GuestMenu />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="hidden desk:flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          onClick={() => router.push(buildCurrentAuthUrl('login'))}
          className="px-4 py-2 rounded-xl font-medium transition-all duration-150 hover:bg-bd-bg2"
          style={{ color: 'var(--bd-ink-soft)', fontSize: 15 }}
        >
          {t('header.login')}
        </button>
        <button
          onClick={() => router.push(buildCurrentAuthUrl('register'))}
          className="px-4 py-2 rounded-xl font-semibold transition-all duration-150 hover:-translate-y-px"
          style={{
            background: 'var(--bd-ink)',
            color: 'var(--bd-bg)',
            fontSize: 15,
            boxShadow: '0 4px 0 var(--bd-coral)',
          }}
        >
          {t('header.register')}
        </button>
      </div>
    )
  }

  return (
    <div className="hidden desk:flex items-center gap-2 min-w-0">
      <ThemeToggle />
      <span
        role="link"
        tabIndex={0}
        onClick={handleProfileNavigation}
        onKeyDown={handleProfileTextKeyDown}
        className="hidden 2xl:inline-block max-w-[120px] cursor-pointer truncate text-sm font-medium"
        style={{ color: 'var(--bd-ink)' }}
        title={userName || userEmail || t('header.profile')}
      >
        {userName || userEmail}
      </span>
      <UserMenu userName={userName} userEmail={userEmail} userImage={userImage} />
    </div>
  )
}
