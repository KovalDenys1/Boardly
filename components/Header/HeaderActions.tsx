'use client'

import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface HeaderActionsProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
}

export function HeaderActions({ isAuthenticated, userName, userEmail }: HeaderActionsProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push('/auth/login')
  }

  if (!isAuthenticated) {
    return (
      <div className="hidden md:flex gap-2">
        <button
          onClick={() => router.push('/auth/login')}
          className="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          Login
        </button>
        <button
          onClick={() => router.push('/auth/register')}
          className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Sign Up
        </button>
      </div>
    )
  }

  return (
    <div className="hidden md:flex items-center gap-4">
      <div className="text-right">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {userName || userEmail}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {userEmail}
        </p>
      </div>
      <button
        onClick={() => router.push('/profile')}
        className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold hover:scale-110 transition-transform"
        title="Go to Profile"
      >
        {userName?.[0]?.toUpperCase() || userEmail?.[0]?.toUpperCase() || '?'}
      </button>
      <button
        onClick={handleSignOut}
        className="px-4 py-2 rounded-lg font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        🚪 Logout
      </button>
    </div>
  )
}
