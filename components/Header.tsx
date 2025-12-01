'use client'

import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { HeaderNavigation } from './Header/HeaderNavigation'
import { HeaderActions } from './Header/HeaderActions'
import { MobileMenu } from './Header/MobileMenu'

export default function Header() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  // Don't show header on auth pages
  if (pathname?.startsWith('/auth')) {
    return null
  }

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'

  return (
    <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and main navigation */}
          <div className="flex items-center">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-2xl font-bold text-blue-600 dark:text-blue-400 hover:scale-105 transition-transform"
            >
              🎲 Boardly
            </button>

            <HeaderNavigation isAuthenticated={isAuthenticated} />
          </div>

          {/* User menu */}
          <div className="flex items-center">
            {isLoading ? (
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
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
