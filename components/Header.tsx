'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { HeaderNavigation } from './Header/HeaderNavigation'
import { HeaderActions } from './Header/HeaderActions'
import { useProfileNavigationTracking } from '@/lib/profile-navigation'
import { useLocalizedHref } from '@/lib/page-locale'

const MobileMenu = dynamic(
  () => import('./Header/MobileMenu').then((mod) => mod.MobileMenu),
  { loading: () => null }
)
const NotificationsMenu = dynamic(
  () => import('./Header/NotificationsMenu').then((mod) => mod.NotificationsMenu),
  { loading: () => null }
)
const PresenceTracker = dynamic(
  () => import('./Header/PresenceTracker').then((mod) => mod.PresenceTracker),
  { loading: () => null }
)
const AudioSettingsButton = dynamic(
  () => import('./Header/AudioSettingsButton').then((mod) => mod.AudioSettingsButton),
  { loading: () => null }
)
const LanguageSwitcher = dynamic(() => import('./LanguageSwitcher'), {
  loading: () => null,
  ssr: false,
})

export default function Header() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const localize = useLocalizedHref()
  const [isGuestUiReady, setIsGuestUiReady] = useState(false)
  useProfileNavigationTracking(pathname)

  useEffect(() => {
    setIsGuestUiReady(true)
  }, [])

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'
  const isAuthUiReady = isGuestUiReady && !isLoading
  const effectiveIsAuthenticated = isAuthUiReady && isAuthenticated

  return (
    <>
    <header
      className="site-header sticky top-0 z-header"
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
            <Link
              href={localize('/')}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap hover:opacity-80 transition-opacity"
              style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', color: 'var(--bd-ink)' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'var(--bd-logo-tile)',
                  color: 'var(--bd-sun)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--bd-font-display)',
                  fontWeight: 800,
                  fontSize: 20,
                  boxShadow: '3px 3px 0 var(--bd-coral)',
                  flexShrink: 0,
                }}
              >
                B
              </span>
              {/* i18n-allow: brand wordmark, identical in all four locales */}
              boardly
            </Link>

            <HeaderNavigation isAuthenticated={effectiveIsAuthenticated} />
          </div>

          {/* User menu and language switcher */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden desk:block">
              <LanguageSwitcher />
            </div>

            <div className="site-header-audio hidden desk:block">
              <AudioSettingsButton />
            </div>

            {effectiveIsAuthenticated && <NotificationsMenu />}
            {effectiveIsAuthenticated && <PresenceTracker />}

            {!isAuthUiReady ? (
              <div aria-hidden className="hidden desk:block h-9 w-[160px] shrink-0" />
            ) : (
              <HeaderActions
                isAuthenticated={effectiveIsAuthenticated}
                userName={session?.user?.name}
                userEmail={session?.user?.email}
                userImage={session?.user?.image}
              />
            )}

            <MobileMenu
              isAuthenticated={effectiveIsAuthenticated}
              userName={session?.user?.name}
              userEmail={session?.user?.email}
              userImage={session?.user?.image}
            />
          </div>
        </div>
      </nav>
    </header>
  </>
  )
}
