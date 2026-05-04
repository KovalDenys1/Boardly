'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

interface HeaderNavigationProps {
  isAuthenticated: boolean
  isAdmin?: boolean
  isGuest?: boolean
}

export function HeaderNavigation({ isAuthenticated, isAdmin = false, isGuest }: HeaderNavigationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()

  const isActive = (path: string) => pathname === path

  const navBtn = (active: boolean) =>
    `rounded-xl font-medium transition-all duration-150 ${
      active
        ? 'bg-bd-ink text-bd-bg'
        : 'text-bd-ink-soft hover:bg-bd-bg2 hover:text-bd-ink'
    }`

  return (
    <div className="hidden lg:flex" style={{ marginLeft: 'clamp(30px, 3vw, 50px)', gap: 'clamp(4px, 0.5vw, 8px)' }}>
      <button
        onClick={() => router.push('/')}
        className={navBtn(isActive('/'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 15px)' }}
      >
        {t('header.home', 'Home')}
      </button>
      {(isAuthenticated || isGuest) && (
        <button
          onClick={() => router.push('/games')}
          className={navBtn(!!pathname?.startsWith('/games'))}
          style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 15px)' }}
        >
          {t('header.games', 'Games')}
        </button>
      )}
      {isAuthenticated && isAdmin && (
        <button
          onClick={() => router.push('/analytics')}
          className={navBtn(!!pathname?.startsWith('/analytics'))}
          style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 15px)' }}
        >
          Analytics
        </button>
      )}
      <button
        onClick={() => router.push('/lobby')}
        className={navBtn(!!pathname?.startsWith('/lobby'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 15px)' }}
      >
        {t('header.lobbies', 'Lobbies')}
      </button>
      <button
        onClick={() => router.push('/leaderboard')}
        className={navBtn(!!pathname?.startsWith('/leaderboard'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 15px)' }}
      >
        {t('header.leaderboard', 'Leaderboard')}
      </button>
      {isAuthenticated && (
        <button
          onClick={() => router.push('/friends')}
          className={navBtn(!!pathname?.startsWith('/friends'))}
          style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 15px)' }}
        >
          {t('header.friends')}
        </button>
      )}
    </div>
  )
}
