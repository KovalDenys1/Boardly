'use client'

import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useGuest } from '@/contexts/GuestContext'
import { HeaderNavigation } from './Header/HeaderNavigation'
import { HeaderActions } from './Header/HeaderActions'
import { MobileMenu } from './Header/MobileMenu'
import LanguageSwitcher from './LanguageSwitcher'

export default function Header() {
  const { data: session, status } = useSession()
  const { isGuest, guestName } = useGuest()
  const router = useRouter()
  const pathname = usePathname()

  // Don't show header on auth pages
  if (pathname?.startsWith('/auth')) {
    return null
  }

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'

  return (
    <header className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg sticky top-0 z-50" style={{ height: '64px', minHeight: '64px' }}>
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ height: '100%' }}>
        <div className="flex justify-between" style={{ height: '100%', alignItems: 'center' }}>
          {/* Logo and main navigation */}
          <div className="flex items-center">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-2xl font-bold text-white hover:scale-105 transition-transform whitespace-nowrap"
            >
              🎲 Boardly
            </button>

            <HeaderNavigation isAuthenticated={isAuthenticated} isGuest={isGuest} />
          </div>

          {/* User menu and language switcher */}
          <div className="flex items-center gap-3">
            {/* Guest indicator */}
            {isGuest && guestName && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-yellow-400/20 backdrop-blur-sm rounded-full border border-yellow-400/30">
                <span className="text-yellow-100 text-sm">👤 {guestName}</span>
              </div>
            )}

            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>

            {isLoading ? (
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <HeaderActions
                isAuthenticated={isAuthenticated}
                userName={session?.user?.name}
                userEmail={session?.user?.email}
              />
            )}

            <MobileMenu
              isAuthenticated={isAuthenticated}
              userName={session?.user?.name}
              userEmail={session?.user?.email}
            />
          </div>
        </div>
      </nav>
    </header>
  )
}
