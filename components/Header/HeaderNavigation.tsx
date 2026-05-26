'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

interface HeaderNavigationProps {
  isAuthenticated: boolean
  isGuest?: boolean
  onUnauthClick?: (dest: string) => void
}

export function HeaderNavigation({ isAuthenticated, isGuest, onUnauthClick }: HeaderNavigationProps) {
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

  const PUBLIC_ROUTES = ['/games', '/lobby', '/leaderboard', '/guides']

  const navigate = (dest: string) => {
    if (!isAuthenticated && !isGuest && !PUBLIC_ROUTES.includes(dest)) {
      onUnauthClick?.(dest)
    } else {
      router.push(dest)
    }
  }

  return (
    <div className="hidden xl:flex" style={{ marginLeft: 'clamp(10px, 1.5vw, 28px)', gap: 'clamp(2px, 0.3vw, 6px)' }}>
      <button
        onClick={() => router.push('/')}
        className={navBtn(isActive('/'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }}
      >
        {t('header.home', 'Home')}
      </button>
      <button
        onClick={() => navigate('/games')}
        className={navBtn(!!pathname?.startsWith('/games'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }}
      >
        {t('header.games', 'Games')}
      </button>
      <button
        onClick={() => navigate('/lobby')}
        className={navBtn(!!pathname?.startsWith('/lobby'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }}
      >
        {t('header.lobbies', 'Lobbies')}
      </button>
      <button
        onClick={() => navigate('/leaderboard')}
        className={navBtn(!!pathname?.startsWith('/leaderboard'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }}
      >
        {t('header.leaderboard', 'Leaderboard')}
      </button>
      <button
        onClick={() => navigate('/guides')}
        className={navBtn(!!pathname?.startsWith('/guides'))}
        style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }}
      >
        {t('header.guides')}
      </button>
      {isAuthenticated && (
        <button
          onClick={() => router.push('/friends')}
          className={navBtn(!!pathname?.startsWith('/friends'))}
          style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }}
        >
          {t('header.friends')}
        </button>
      )}
    </div>
  )
}
