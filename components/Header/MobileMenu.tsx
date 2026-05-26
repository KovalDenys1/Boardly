'use client'

import { signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useGuest } from '@/contexts/GuestContext'
import { navigateToProfile } from '@/lib/profile-navigation'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import { UserAvatar } from './UserAvatar'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { AudioSettingsMobilePanel } from './AudioSettingsButton'
import { ThemeMobilePanel } from './ThemeToggle'
import { useTranslation } from '@/lib/i18n-helpers'

interface MobileMenuProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
  onUnauthClick?: (dest: string) => void
}

export function MobileMenu({
  isAuthenticated,
  userName,
  userEmail,
  userImage,
  onUnauthClick,
}: MobileMenuProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousPathnameRef = useRef(pathname)
  const { isGuest, guestName, clearGuestMode } = useGuest()
  const isGuestSession = isGuest && !isAuthenticated

  const PUBLIC_ROUTES = ['/games', '/lobby', '/leaderboard']

  const navigateMobile = (dest: string) => {
    if (!isAuthenticated && !isGuestSession && !PUBLIC_ROUTES.includes(dest)) {
      closeMenuImmediately()
      onUnauthClick?.(dest)
    } else {
      router.push(dest)
    }
  }

  const isActive = (path: string) => pathname === path
  const isActiveStart = (path: string) => !!pathname?.startsWith(path)

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const closeMenu = useCallback(() => {
    clearCloseTimeout()
    setIsClosing(true)
    closeTimeoutRef.current = setTimeout(() => {
      setMobileMenuOpen(false)
      setIsClosing(false)
      closeTimeoutRef.current = null
    }, 300)
  }, [clearCloseTimeout])

  const closeMenuImmediately = useCallback(() => {
    clearCloseTimeout()
    setIsClosing(false)
    setMobileMenuOpen(false)
  }, [clearCloseTimeout])

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.replace('/')
  }

  const handleGuestExit = () => {
    clearGuestMode()
    router.replace('/')
  }

  const handleProfileNavigation = () => {
    closeMenuImmediately()
    navigateToProfile(router, pathname, { tab: 'profile' })
  }

  const handleSettingsNavigation = () => {
    closeMenuImmediately()
    navigateToProfile(router, pathname, { tab: 'settings' })
  }

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [mobileMenuOpen])

  useEffect(() => {
    const pathnameChanged = previousPathnameRef.current !== pathname
    previousPathnameRef.current = pathname
    if (mobileMenuOpen && pathnameChanged) closeMenu()
  }, [pathname, mobileMenuOpen, closeMenu])

  useEffect(() => { return () => { clearCloseTimeout() } }, [clearCloseTimeout])

  const navBtn = (active: boolean) => ({
    width: '100%',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 14px',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: 'inherit',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s',
    background: active ? 'var(--bd-sun)' : 'transparent',
    color: active ? 'var(--bd-ink)' : 'var(--bd-ink-soft)',
  })

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => {
          if (mobileMenuOpen) {
            closeMenu()
          } else {
            clearCloseTimeout()
            setIsClosing(false)
            setMobileMenuOpen(true)
          }
        }}
        className="xl:hidden relative z-50"
        style={{
          padding: 8,
          borderRadius: 10,
          border: 'none',
          cursor: 'pointer',
          background: mobileMenuOpen ? 'var(--bd-bg2)' : 'transparent',
          transition: 'background 0.2s',
        }}
        aria-label={mobileMenuOpen ? t('common.close') : t('header.menu')}
      >
        <div style={{ width: 24, height: 24, position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 0,
              width: '100%',
              height: 2.5,
              borderRadius: 99,
              background: 'var(--bd-ink)',
              transition: 'all 0.3s',
              top: mobileMenuOpen ? '50%' : 4,
              transform: mobileMenuOpen ? 'translateY(-50%) rotate(45deg)' : 'none',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: '100%',
              height: 2.5,
              borderRadius: 99,
              background: 'var(--bd-ink)',
              transition: 'all 0.3s',
              opacity: mobileMenuOpen ? 0 : 1,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 0,
              width: '100%',
              height: 2.5,
              borderRadius: 99,
              background: 'var(--bd-ink)',
              transition: 'all 0.3s',
              top: mobileMenuOpen ? '50%' : 17,
              transform: mobileMenuOpen ? 'translateY(-50%) rotate(-45deg)' : 'none',
            }}
          />
        </div>
      </button>

      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-40 xl:hidden ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ background: 'rgba(31,27,22,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={closeMenu}
          />

          {/* Panel */}
          <div
            className={`fixed top-0 right-0 bottom-0 z-50 flex h-full flex-col xl:hidden overflow-hidden ${isClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}
            style={{
              width: '85vw',
              maxWidth: 360,
              background: 'var(--bd-bg)',
              borderLeft: '1.5px solid var(--bd-line)',
              boxShadow: '-8px 0 32px rgba(31,27,22,0.12)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1.5px solid var(--bd-line)',
                background: 'var(--bd-bg)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--bd-font-display)',
                  fontSize: 20,
                  fontWeight: 800,
                  color: 'var(--bd-ink)',
                  letterSpacing: '-0.01em',
                }}
              >
                boardly
              </span>
              <button
                onClick={closeMenu}
                style={{
                  padding: 6,
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--bd-ink-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
                aria-label={t('common.close')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User section */}
            {(isAuthenticated || isGuestSession) && (
              <div style={{ padding: '16px 20px', borderBottom: '1.5px solid var(--bd-line)' }}>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleProfileNavigation}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 14,
                      border: 'none',
                      cursor: 'pointer',
                      background: 'var(--bd-card-warm)',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    aria-label={t('header.profile')}
                  >
                    <UserAvatar
                      image={userImage}
                      userName={userName}
                      userEmail={userEmail}
                      className="bg-bd-lav text-white"
                      textClassName="font-bold"
                      style={{ width: 44, height: 44, fontSize: 18, flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--bd-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {userName || t('common.error')}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--bd-ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {userEmail}
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bd-ink-muted)" strokeWidth={2.5} strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: 'var(--bd-card-warm)' }}>
                    <UserAvatar
                      image={null}
                      userName={guestName}
                      userEmail={null}
                      style={{ width: 44, height: 44, fontSize: 18, flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--bd-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {guestName || t('guest.playAsGuest')}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--bd-ink-soft)', marginTop: 1 }}>
                        {t('header.guestSession')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Nav links */}
            <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={() => router.push('/')} style={navBtn(isActive('/'))}>
                {t('header.home')}
              </button>

              <button onClick={() => navigateMobile('/games')} style={navBtn(isActiveStart('/games'))}>
                {t('header.games')}
              </button>
              <button onClick={() => navigateMobile('/lobby')} style={navBtn(isActiveStart('/lobby'))}>
                {t('header.lobbies')}
              </button>
              <button onClick={() => navigateMobile('/leaderboard')} style={navBtn(isActiveStart('/leaderboard'))}>
                {t('header.leaderboard')}
              </button>
              {isAuthenticated && (
                <button onClick={() => router.push('/friends')} style={navBtn(isActiveStart('/friends'))}>
                  {t('header.friends')}
                </button>
              )}

              <div style={{ height: 1, background: 'var(--bd-line)', margin: '8px 0' }} />

              <div style={{ borderRadius: 14, border: '1.5px solid var(--bd-line)', background: 'var(--bd-card-warm)', padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bd-ink-muted)', marginBottom: 10 }}>
                  {t('header.language')}
                </p>
                <LanguageSwitcher variant="panel" />
              </div>

              <AudioSettingsMobilePanel />
              <ThemeMobilePanel />
            </nav>

            {/* Bottom actions */}
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1.5px solid var(--bd-line)',
                background: 'var(--bd-bg2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {isAuthenticated ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleProfileNavigation}
                      style={{
                        padding: '11px 12px',
                        borderRadius: 12,
                        border: '1.5px solid var(--bd-line)',
                        background: 'var(--bd-bg)',
                        color: 'var(--bd-ink)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {t('header.profile')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSettingsNavigation}
                      style={{
                        padding: '11px 12px',
                        borderRadius: 12,
                        border: '1.5px solid var(--bd-line)',
                        background: 'var(--bd-bg)',
                        color: 'var(--bd-ink)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {t('header.settings')}
                    </button>
                  </div>
                  <button
                    onClick={handleSignOut}
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: 12,
                      border: '1.5px solid var(--bd-line)',
                      background: 'var(--bd-ink)',
                      color: 'var(--bd-bg)',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {t('header.logout')}
                  </button>
                </>
              ) : isGuestSession ? (
                <>
                  <button
                    onClick={() => router.push(buildCurrentAuthUrl('login'))}
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: 12,
                      border: '1.5px solid var(--bd-line)',
                      background: 'var(--bd-bg)',
                      color: 'var(--bd-ink)',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {t('header.login')}
                  </button>
                  <button
                    onClick={handleGuestExit}
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: 12,
                      border: '1.5px solid var(--bd-line)',
                      background: 'var(--bd-ink)',
                      color: 'var(--bd-bg)',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {t('header.exitGuest')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => router.push(buildCurrentAuthUrl('login'))}
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: 12,
                      border: '1.5px solid var(--bd-line)',
                      background: 'var(--bd-bg)',
                      color: 'var(--bd-ink)',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {t('header.login')}
                  </button>
                  <button
                    onClick={() => router.push(buildCurrentAuthUrl('register'))}
                    style={{
                      width: '100%',
                      padding: '13px 16px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--bd-ink)',
                      color: 'var(--bd-bg)',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 0 var(--bd-coral)',
                    }}
                  >
                    {t('header.signUp')}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
