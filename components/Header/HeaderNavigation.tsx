'use client'

import { useRouter, usePathname } from 'next/navigation'

interface HeaderNavigationProps {
  isAuthenticated: boolean
}

export function HeaderNavigation({ isAuthenticated }: HeaderNavigationProps) {
  const router = useRouter()
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  return (
    <div className="hidden md:flex ml-10 space-x-4">
      <button
        onClick={() => router.push('/')}
        className={`px-3 py-2 rounded-lg font-medium transition-colors ${
          isActive('/')
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        🏠 Home
      </button>
      
      {isAuthenticated && (
        <button
          onClick={() => router.push('/games')}
          className={`px-3 py-2 rounded-lg font-medium transition-colors ${
            pathname?.startsWith('/games')
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          🎮 Games
        </button>
      )}
    </div>
  )
}
