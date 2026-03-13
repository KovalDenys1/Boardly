'use client'

import type { KeyboardEvent } from 'react'
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { navigateToProfile } from '@/lib/profile-navigation'
import { UserAvatar } from './UserAvatar'

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
  const { isGuest, clearGuestMode } = useGuest()
  const [isGuestUiReady, setIsGuestUiReady] = useState(false)
  const isGuestSession = isGuestUiReady && isGuest && !isAuthenticated

  useEffect(() => {
    setIsGuestUiReady(true)
  }, [])

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.replace('/')
  }

  const handleGuestExit = () => {
    clearGuestMode()
    router.replace('/')
  }

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
      <div className="hidden md:flex shrink-0 items-center gap-2">
        <button
          onClick={() => router.push('/auth/login')}
          className="px-4 py-2 rounded-lg font-medium text-white/90 hover:bg-white/10 transition-colors"
        >
          {t('header.login', 'Login')}
        </button>
        <button
          onClick={handleGuestExit}
          className="px-4 py-2 rounded-lg font-medium bg-white text-purple-600 hover:bg-white/90 transition-colors shadow-sm"
        >
          🚪 {t('guest.exit', 'Exit Guest')}
        </button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="hidden md:flex shrink-0 items-center gap-2">
        <button
          onClick={() => router.push('/auth/login')}
          className="px-4 py-2 rounded-lg font-medium text-white/90 hover:bg-white/10 transition-colors"
        >
          {t('header.login', 'Login')}
        </button>
        <button
          onClick={() => router.push('/auth/register')}
          className="px-4 py-2 rounded-lg font-medium bg-white text-purple-600 hover:bg-white/90 transition-colors shadow-sm"
        >
          {t('header.register', 'Register')}
        </button>
      </div>
    )
  }

  return (
    <div className="hidden md:flex items-center gap-2 lg:gap-4 min-w-0">
      <div className="min-w-0 max-w-[220px] self-center text-right lg:max-w-[280px]">
        <div className="flex flex-col items-end justify-center leading-tight">
        <span
          role="link"
          tabIndex={0}
          onClick={handleProfileNavigation}
          onKeyDown={handleProfileTextKeyDown}
          className="inline-block max-w-full cursor-pointer truncate text-sm font-medium text-white"
          title={t('header.profile', 'Profile')}
        >
          {userName || userEmail}
        </span>
        {userName && userEmail && (
            <span
              role="link"
              tabIndex={0}
              onClick={handleProfileNavigation}
              onKeyDown={handleProfileTextKeyDown}
              className="mt-0.5 inline-block max-w-full cursor-pointer truncate text-xs text-white/70"
              title={t('header.profile', 'Profile')}
            >
              {userEmail}
            </span>
        )}
        </div>
      </div>
      <button
        onClick={handleProfileNavigation}
        className="overflow-hidden rounded-full bg-white/15 p-0.5 hover:scale-110 transition-transform shadow-sm"
        title={t('header.profile', 'Profile')}
      >
        <UserAvatar
          image={userImage}
          userName={userName}
          userEmail={userEmail}
          className="h-9 w-9 bg-white text-purple-600"
          textClassName="text-sm font-bold"
        />
      </button>
      <button
        onClick={handleSignOut}
        className="px-4 py-2 rounded-lg font-medium text-white/90 hover:bg-white/10 transition-colors"
      >
        🚪 {t('header.logout', 'Logout')}
      </button>
    </div>
  )
}
