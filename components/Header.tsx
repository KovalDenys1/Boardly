'use client'

import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGuest } from '@/contexts/GuestContext'
import { HeaderNavigation } from './Header/HeaderNavigation'
import { HeaderActions } from './Header/HeaderActions'
import { MobileMenu } from './Header/MobileMenu'
import { NotificationsMenu } from './Header/NotificationsMenu'
import LanguageSwitcher from './LanguageSwitcher'
import { useProfileNavigationTracking } from '@/lib/profile-navigation'

export default function Header() {
  const { data: session, status } = useSession()
  const { isGuest, guestName } = useGuest()
  const router = useRouter()
  const pathname = usePathname()
  const [isGuestUiReady, setIsGuestUiReady] = useState(false)
  useProfileNavigationTracking(pathname)

  useEffect(() => {
    setIsGuestUiReady(true)
  }, [])

  // Don't show header on auth pages
  if (pathname?.startsWith('/auth')) {
    return null
  }

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'
  const isAdmin = session?.user?.role === 'admin'
  const isGuestSession = isGuestUiReady && isGuest && !isAuthenticated

  return (
    <header
      className="site-header sticky top-0 z-50"
      style={{
        height: '64px',
        minHeight: '64px',
        background: 'var(--bd-bg)',
        borderBottom: '1.5px solid var(--bd-line)',
      }}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ height: '100%' }}>
        <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0" style={{ height: '100%' }}>
          {/* Logo and main navigation */}
          <div className="flex items-center min-w-0 flex-1">
            <button
              onClick={() => router.push('/')}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap hover:opacity-80 transition-opacity"
              style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', color: 'var(--bd-ink)' }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'var(--bd-ink)',
                  color: 'var(--bd-sun)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--bd-font-display)',
                  fontWeight: 800,
                  fontSize: 20,
                  transform: 'rotate(-6deg)',
                  boxShadow: '3px 3px 0 var(--bd-coral)',
                  flexShrink: 0,
                }}
              >
                B
              </span>
              boardly
            </button>

            <HeaderNavigation
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              isGuest={isGuestSession}
            />
          </div>

          {/* User menu and language switcher */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Guest indicator */}
            {isGuestSession && guestName && (
              <div
                className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ background: 'rgba(255,196,77,0.22)', border: '1px solid rgba(255,196,77,0.4)', color: 'var(--bd-ink-soft)', fontSize: 13, fontWeight: 600 }}
              >
                👤 {guestName}
              </div>
            )}

            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>

            {isAuthenticated && !isLoading && <NotificationsMenu />}

            {isLoading ? (
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <HeaderActions
                isAuthenticated={isAuthenticated}
                userName={session?.user?.name}
                userEmail={session?.user?.email}
                userImage={session?.user?.image}
              />
            )}

            <MobileMenu
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              userName={session?.user?.name}
              userEmail={session?.user?.email}
              userImage={session?.user?.image}
            />
          </div>
        </div>
      </nav>
    </header>
  )
}
