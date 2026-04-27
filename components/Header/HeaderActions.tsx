'use client'

import type { KeyboardEvent } from 'react'
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { navigateToProfile } from '@/lib/profile-navigation'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
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
      <div className="hidden lg:flex shrink-0 items-center gap-2">
        <button
          onClick={() => router.push(buildCurrentAuthUrl('login'))}
          className="px-4 py-2 rounded-xl font-medium transition-all duration-150 hover:bg-[#F2E9D8]"
          style={{ color: '#4A3F33', fontSize: 15 }}
        >
          {t('header.login', 'Login')}
        </button>
        <button
          onClick={handleGuestExit}
          className="px-4 py-2 rounded-xl font-medium transition-all duration-150 hover:bg-[#F2E9D8]"
          style={{ color: '#4A3F33', fontSize: 15, border: '1.5px solid #E8DDC8' }}
        >
          {t('guest.exit', 'Exit Guest')}
        </button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="hidden lg:flex shrink-0 items-center gap-2">
        <button
          onClick={() => router.push(buildCurrentAuthUrl('login'))}
          className="px-4 py-2 rounded-xl font-medium transition-all duration-150 hover:bg-[#F2E9D8]"
          style={{ color: '#4A3F33', fontSize: 15 }}
        >
          {t('header.login', 'Login')}
        </button>
        <button
          onClick={() => router.push(buildCurrentAuthUrl('register'))}
          className="px-4 py-2 rounded-xl font-semibold transition-all duration-150 hover:-translate-y-px"
          style={{
            background: '#1F1B16',
            color: '#FBF6EE',
            fontSize: 15,
            boxShadow: '0 4px 0 #FF6B5B',
          }}
        >
          {t('header.register', 'Play free')}
        </button>
      </div>
    )
  }

  return (
    <div className="hidden lg:flex items-center gap-2 lg:gap-3 min-w-0">
      <div className="min-w-0 max-w-[180px] self-center text-right">
        <div className="flex flex-col items-end justify-center leading-tight">
          <span
            role="link"
            tabIndex={0}
            onClick={handleProfileNavigation}
            onKeyDown={handleProfileTextKeyDown}
            className="inline-block max-w-full cursor-pointer truncate text-sm font-medium"
            style={{ color: '#1F1B16' }}
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
              className="mt-0.5 inline-block max-w-full cursor-pointer truncate text-xs"
              style={{ color: '#8A7A66' }}
              title={t('header.profile', 'Profile')}
            >
              {userEmail}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={handleProfileNavigation}
        className="overflow-hidden rounded-full p-0.5 hover:scale-110 transition-transform"
        style={{ background: '#F2E9D8', boxShadow: '0 0 0 2px #1F1B16' }}
        title={t('header.profile', 'Profile')}
      >
        <UserAvatar
          image={userImage}
          userName={userName}
          userEmail={userEmail}
          className="h-9 w-9 bg-[#9B8CFF] text-white"
          textClassName="text-sm font-bold"
        />
      </button>
      <button
        onClick={handleSignOut}
        className="px-3 py-2 rounded-xl font-medium transition-all duration-150 hover:bg-[#F2E9D8]"
        style={{ color: '#4A3F33', fontSize: 14 }}
      >
        {t('header.logout', 'Logout')}
      </button>
    </div>
  )
}
