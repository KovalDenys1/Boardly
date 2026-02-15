'use client'

import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'

interface HeaderActionsProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
}

export function HeaderActions({ isAuthenticated, userName, userEmail }: HeaderActionsProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { isGuest, clearGuestMode } = useGuest()
  const isGuestSession = isGuest && !isAuthenticated

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.replace('/')
  }

  const handleGuestExit = () => {
    clearGuestMode()
    router.replace('/')
  }

  if (isGuestSession) {
    return (
      <div className="hidden md:flex gap-2">
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
      <div className="hidden md:flex gap-2">
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
    <div className="hidden md:flex items-center gap-4">
      <div className="text-right">
        <p className="text-sm font-medium text-white">
          {userName || userEmail}
        </p>
        {userName && userEmail && (
          <p className="text-xs text-white/70">
            {userEmail}
          </p>
        )}
      </div>
      <button
        onClick={() => router.push('/profile')}
        className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-purple-600 font-bold hover:scale-110 transition-transform shadow-sm"
        title={t('header.profile', 'Profile')}
      >
        {userName?.[0]?.toUpperCase() || userEmail?.[0]?.toUpperCase() || '?'}
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
