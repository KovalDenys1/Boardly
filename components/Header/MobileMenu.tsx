'use client'

import { signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useGuest } from '@/contexts/GuestContext'

interface MobileMenuProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
}

export function MobileMenu({ isAuthenticated, userName, userEmail }: MobileMenuProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const { isGuest, guestName } = useGuest()

  const isActive = (path: string) => pathname === path

  const closeMenu = () => {
    setIsClosing(true)
    setTimeout(() => {
      setMobileMenuOpen(false)
      setIsClosing(false)
    }, 300) // Match animation duration
  }

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push('/auth/login')
  }

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileMenuOpen])

  // Close on route change
  useEffect(() => {
    if (mobileMenuOpen) {
      closeMenu()
    }
  }, [pathname])

  return (
    <>
      {/* Mobile menu button - Improved design */}
      <button
        onClick={() => {
          if (mobileMenuOpen) {
            closeMenu()
          } else {
            setMobileMenuOpen(true)
          }
        }}
        className="md:hidden rounded-lg transition-all duration-200 relative z-50"
        style={{
          padding: 'clamp(8px, 0.8vh, 12px)',
          backgroundColor: mobileMenuOpen ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
        }}
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
      >
        <div className="relative" style={{ width: 'clamp(24px, 2.5vw, 28px)', height: 'clamp(24px, 2.5vw, 28px)' }}>
          {/* Animated hamburger icon */}
          <span
            className={`absolute left-0 bg-gray-700 dark:bg-gray-300 rounded-full transition-all duration-300 ${mobileMenuOpen ? 'top-1/2 rotate-45' : 'top-1/4'
              }`}
            style={{ width: '100%', height: 'clamp(2.5px, 0.25vw, 3px)', transform: mobileMenuOpen ? 'translateY(-50%) rotate(45deg)' : 'none' }}
          />
          <span
            className={`absolute left-0 top-1/2 -translate-y-1/2 bg-gray-700 dark:bg-gray-300 rounded-full transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : 'opacity-100'
              }`}
            style={{ width: '100%', height: 'clamp(2.5px, 0.25vw, 3px)' }}
          />
          <span
            className={`absolute left-0 bg-gray-700 dark:bg-gray-300 rounded-full transition-all duration-300 ${mobileMenuOpen ? 'top-1/2 -rotate-45' : 'bottom-1/4'
              }`}
            style={{ width: '100%', height: 'clamp(2.5px, 0.25vw, 3px)', transform: mobileMenuOpen ? 'translateY(-50%) rotate(-45deg)' : 'none' }}
          />
        </div>
      </button>

      {/* Full-screen mobile menu overlay */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden ${isClosing ? 'animate-fade-out' : 'animate-fade-in'
              }`}
            onClick={closeMenu}
          />

          {/* Menu panel */}
          <div
            className={`fixed top-0 right-0 bottom-0 w-[85vw] max-w-sm bg-white dark:bg-gray-900 shadow-2xl z-50 md:hidden overflow-y-auto ${isClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'
              }`}
            style={{
              borderLeft: '1px solid',
              borderColor: 'rgb(229 231 235 / 1)',
            }}
          >
            {/* Header with close button */}
            <div
              className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20"
              style={{ padding: 'clamp(16px, 1.6vh, 24px)' }}
            >
              <h2 className="font-bold text-gray-900 dark:text-white" style={{ fontSize: 'clamp(18px, 1.8vw, 22px)' }}>
                Menu
              </h2>
              <button
                onClick={closeMenu}
                className="rounded-lg p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User info section (if authenticated) */}
            {isAuthenticated && (
              <div
                className="border-b border-gray-200 dark:border-gray-700 bg-gradient-to-br from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10"
                style={{ padding: 'clamp(16px, 1.6vh, 24px)' }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg"
                    style={{
                      width: 'clamp(48px, 5vw, 64px)',
                      height: 'clamp(48px, 5vw, 64px)',
                      fontSize: 'clamp(20px, 2vw, 26px)'
                    }}
                  >
                    {userName?.[0]?.toUpperCase() || userEmail?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-semibold text-gray-900 dark:text-white truncate"
                      style={{ fontSize: 'clamp(15px, 1.5vw, 18px)' }}
                    >
                      {userName || 'User'}
                    </p>
                    <p
                      className="text-gray-600 dark:text-gray-400 truncate"
                      style={{ fontSize: 'clamp(12px, 1.2vw, 14px)' }}
                    >
                      {userEmail}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation links */}
            <nav style={{ padding: 'clamp(16px, 1.6vh, 24px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 0.8vh, 12px)' }}>
                <button
                  onClick={() => router.push('/')}
                  className={`w-full text-left rounded-xl font-medium transition-all duration-200 flex items-center gap-3 ${isActive('/')
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  style={{
                    padding: 'clamp(12px, 1.2vh, 16px)',
                    fontSize: 'clamp(15px, 1.5vw, 17px)'
                  }}
                >
                  <span style={{ fontSize: 'clamp(20px, 2vw, 24px)' }}>🏠</span>
                  <span>Home</span>
                </button>

                {isAuthenticated && (
                  <>
                    <button
                      onClick={() => router.push('/games')}
                      className={`w-full text-left rounded-xl font-medium transition-all duration-200 flex items-center gap-3 ${pathname?.startsWith('/games')
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      style={{
                        padding: 'clamp(12px, 1.2vh, 16px)',
                        fontSize: 'clamp(15px, 1.5vw, 17px)'
                      }}
                    >
                      <span style={{ fontSize: 'clamp(20px, 2vw, 24px)' }}>🎮</span>
                      <span>Games</span>
                    </button>

                    <button
                      onClick={() => router.push('/lobby')}
                      className={`w-full text-left rounded-xl font-medium transition-all duration-200 flex items-center gap-3 ${pathname?.startsWith('/lobby')
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      style={{
                        padding: 'clamp(12px, 1.2vh, 16px)',
                        fontSize: 'clamp(15px, 1.5vw, 17px)'
                      }}
                    >
                      <span style={{ fontSize: 'clamp(20px, 2vw, 24px)' }}>🎲</span>
                      <span>Lobbies</span>
                    </button>

                    {/* Divider */}
                    <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />

                    <button
                      onClick={() => router.push('/profile')}
                      className={`w-full text-left rounded-xl font-medium transition-all duration-200 flex items-center gap-3 ${isActive('/profile')
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      style={{
                        padding: 'clamp(12px, 1.2vh, 16px)',
                        fontSize: 'clamp(15px, 1.5vw, 17px)'
                      }}
                    >
                      <span style={{ fontSize: 'clamp(20px, 2vw, 24px)' }}>👤</span>
                      <span>Profile Settings</span>
                    </button>
                  </>
                )}
              </div>
            </nav>

            {/* Bottom actions */}
            <div
              className="absolute bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              style={{ padding: 'clamp(16px, 1.6vh, 24px)' }}
            >
              {isAuthenticated ? (
                <button
                  onClick={handleSignOut}
                  className="w-full rounded-xl font-semibold bg-red-500 hover:bg-red-600 text-white transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
                  style={{
                    padding: 'clamp(14px, 1.4vh, 18px)',
                    fontSize: 'clamp(15px, 1.5vw, 17px)'
                  }}
                >
                  <span style={{ fontSize: 'clamp(20px, 2vw, 24px)' }}>🚪</span>
                  <span>Logout</span>
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1vh, 14px)' }}>
                  <button
                    onClick={() => router.push('/auth/login')}
                    className="w-full rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-600 transition-all duration-200 flex items-center justify-center gap-3"
                    style={{
                      padding: 'clamp(12px, 1.2vh, 16px)',
                      fontSize: 'clamp(15px, 1.5vw, 17px)'
                    }}
                  >
                    <span style={{ fontSize: 'clamp(20px, 2vw, 24px)' }}>🔐</span>
                    <span>Login</span>
                  </button>
                  <button
                    onClick={() => router.push('/auth/register')}
                    className="w-full rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
                    style={{
                      padding: 'clamp(14px, 1.4vh, 18px)',
                      fontSize: 'clamp(15px, 1.5vw, 17px)'
                    }}
                  >
                    <span style={{ fontSize: 'clamp(20px, 2vw, 24px)' }}>✨</span>
                    <span>Sign Up</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
