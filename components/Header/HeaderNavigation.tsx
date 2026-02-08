'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

interface HeaderNavigationProps {
  isAuthenticated: boolean
  isGuest?: boolean
}

export function HeaderNavigation({ isAuthenticated, isGuest }: HeaderNavigationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()

  const isActive = (path: string) => pathname === path

  return (
    <div className="hidden md:flex" style={{ marginLeft: 'clamp(30px, 3vw, 50px)', gap: 'clamp(10px, 1vw, 20px)' }}>
      <button
        onClick={() => router.push('/')}
        className={`rounded-lg font-medium transition-colors ${isActive('/')
          ? 'bg-white/20 text-white'
          : 'text-white/80 hover:bg-white/10 hover:text-white'
          }`}
        style={{ padding: 'clamp(6px, 0.6vh, 12px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 16px)' }}
      >
        🏠 {t('header.home', 'Home')}
      </button>
      {(isAuthenticated || isGuest) && (
        <button
          onClick={() => router.push('/games')}
          className={`rounded-lg font-medium transition-colors ${pathname?.startsWith('/games')
            ? 'bg-white/20 text-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          style={{ padding: 'clamp(6px, 0.6vh, 12px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 16px)' }}
        >
          🎮 {t('header.games', 'Games')}
        </button>
      )}
      <button
        onClick={() => router.push('/lobby')}
        className={`rounded-lg font-medium transition-colors ${pathname?.startsWith('/lobby')
          ? 'bg-white/20 text-white'
          : 'text-white/80 hover:bg-white/10 hover:text-white'
          }`}
        style={{ padding: 'clamp(6px, 0.6vh, 12px) clamp(10px, 1vw, 16px)', fontSize: 'clamp(13px, 0.95vw, 16px)' }}
      >
        🎯 {t('header.lobbies', 'Lobbies')}
      </button>
    </div>
  )
}

