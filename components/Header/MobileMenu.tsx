'use client'

import { signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'

interface MobileMenuProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
}

export function MobileMenu({ isAuthenticated, userName, userEmail }: MobileMenuProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActive = (path: string) => pathname === path

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push('/auth/login')
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="md:hidden p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {mobileMenuOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700 animate-slide-in-up">
          <div className="space-y-2">
            <button
              onClick={() => {
                router.push('/')
                setMobileMenuOpen(false)
              }}
              className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors ${
                isActive('/')
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              🏠 Home
            </button>

            {isAuthenticated && (
              <>
                <button
                  onClick={() => {
                    router.push('/games')
                    setMobileMenuOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors ${
                    pathname?.startsWith('/games')
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  🎮 Games
                </button>
                
                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {userName?.[0]?.toUpperCase() || userEmail?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {userName || userEmail}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {userEmail}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      router.push('/profile')
                      setMobileMenuOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors mt-2"
                  >
                    👤 Profile Settings
                  </button>
                  <button
                    onClick={() => {
                      handleSignOut()
                      setMobileMenuOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-2"
                  >
                    🚪 Logout
                  </button>
                </div>
              </>
            )}

            {!isAuthenticated && (
              <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                <button
                  onClick={() => {
                    router.push('/auth/login')
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-3 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    router.push('/auth/register')
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-3 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
