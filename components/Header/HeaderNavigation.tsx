'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { MouseEvent } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

interface HeaderNavigationProps {
  isAuthenticated: boolean
  isGuest?: boolean
  onUnauthClick?: (dest: string) => void
}

export function HeaderNavigation({ isAuthenticated, isGuest, onUnauthClick }: HeaderNavigationProps) {
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

  // Real anchors so crawlers follow the nav (#921). A signed-out visitor on a
  // non-public route still gets the auth prompt instead of the navigation.
  const guard = (dest: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isAuthenticated && !isGuest && !PUBLIC_ROUTES.includes(dest)) {
      event.preventDefault()
      onUnauthClick?.(dest)
    }
  }

  const navStyle = { padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }

  return (
    <div className="hidden xl:flex" style={{ marginLeft: 'clamp(10px, 1.5vw, 28px)', gap: 'clamp(2px, 0.3vw, 6px)' }}>
      <Link href="/" className={navBtn(isActive('/'))} style={navStyle}>
        {t('header.home')}
      </Link>
      <Link href="/games" onClick={guard('/games')} className={navBtn(!!pathname?.startsWith('/games'))} style={navStyle}>
        {t('header.games')}
      </Link>
      <Link href="/lobby" onClick={guard('/lobby')} className={navBtn(!!pathname?.startsWith('/lobby'))} style={navStyle}>
        {t('header.lobbies')}
      </Link>
      <Link href="/leaderboard" onClick={guard('/leaderboard')} className={navBtn(!!pathname?.startsWith('/leaderboard'))} style={navStyle}>
        {t('header.leaderboard')}
      </Link>
      <Link href="/guides" onClick={guard('/guides')} className={navBtn(!!pathname?.startsWith('/guides'))} style={navStyle}>
        {t('header.guides')}
      </Link>
      {isAuthenticated && (
        <Link href="/friends" className={navBtn(!!pathname?.startsWith('/friends'))} style={navStyle}>
          {t('header.friends')}
        </Link>
      )}
    </div>
  )
}
