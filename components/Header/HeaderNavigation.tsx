'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'

interface HeaderNavigationProps {
  isAuthenticated: boolean
}

export function HeaderNavigation({ isAuthenticated }: HeaderNavigationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()

  const isActive = (path: string) => pathname === path

  return (
    <div className="hidden md:flex ml-10 space-x-4">
      <button
        onClick={() => router.push('/')}
        className={`px-3 py-2 rounded-lg font-medium transition-colors ${
          isActive('/')
            ? 'bg-white/20 text-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      >
        🏠 {t('header.home', 'Home')}
      </button>
      
      {isAuthenticated && (
        <button
          onClick={() => router.push('/games')}
          className={`px-3 py-2 rounded-lg font-medium transition-colors ${
            pathname?.startsWith('/games')
              ? 'bg-white/20 text-white'
              : 'text-white/80 hover:bg-white/10 hover:text-white'
          }`}
        >
          🎮 {t('header.games', 'Games')}
        </button>
      )}
      
      <button
        onClick={() => router.push('/lobby')}
        className={`px-3 py-2 rounded-lg font-medium transition-colors ${
          pathname?.startsWith('/lobby')
            ? 'bg-white/20 text-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      >
        🎯 {t('header.lobbies', 'Lobbies')}
      </button>
    </div>
  )
}

