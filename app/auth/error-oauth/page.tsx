'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { signIn } from 'next-auth/react'
import LoadingSpinner from '@/components/LoadingSpinner'

function OAuthErrorContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [merging, setMerging] = useState(false)
  
  const error = searchParams?.get('error')
  const provider = searchParams?.get('provider') || 'unknown'

  useEffect(() => {
    // Only handle OAuthAccountNotLinked error
    if (error !== 'OAuthAccountNotLinked') {
      // For other errors, show generic error message
      if (error) {
        toast.error('Authentication error. Please try again.')
      }
      // Don't auto-redirect - let user see the error
    }
  }, [error])

  const getProviderName = () => {
    switch (provider) {
      case 'google': return 'Google'
      case 'github': return 'GitHub'
      case 'discord': return 'Discord'
      default: return provider
    }
  }

  const getProviderIcon = () => {
    switch (provider) {
      case 'google': return '🔵'
      case 'github': return '⚫'
      case 'discord': return '🟣'
      default: return '🔗'
    }
  }

  const handleTryAgain = () => {
    // Just redirect back to profile
    router.push('/profile')
  }

  const handleSignInWithProvider = async () => {
    setMerging(true)
    try {
      // Sign in with the OAuth provider
      // If successful and email matches, user will be prompted to merge accounts
      await signIn(provider, {
        callbackUrl: '/profile'
      })
    } catch (error) {
      console.error('Sign in error:', error)
      toast.error('Failed to sign in. Please try again.')
      setMerging(false)
    }
  }

  const handleSignInDifferent = () => {
    router.push('/auth/login')
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">{getProviderIcon()}</div>
          <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
            Email Already Registered
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            An account with this email already exists. You can either:
          </p>
          
          <div className="space-y-3 mb-6 text-left">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                1️⃣ Sign in with {getProviderName()}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                If this is your {getProviderName()} account, sign in to access your profile
              </p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
              <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                2️⃣ Sign in with your existing account
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Then link {getProviderName()} from your profile settings
              </p>
            </div>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={handleSignInWithProvider}
              disabled={merging}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {merging ? 'Redirecting...' : `Sign in with ${getProviderName()}`}
            </button>
            
            <button
              onClick={handleSignInDifferent}
              className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
            >
              Sign in with Email/Password
            </button>
          </div>
        </div>
      </div>
    )
  }

  // User is authenticated - different account trying to link
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
            Cannot Link Account
          </h1>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-800 dark:text-red-200 mb-2">
            This {getProviderName()} account is already registered with a different email address.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            <strong>Your options:</strong>
          </p>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span>1️⃣</span>
              <span>Sign out and sign in with {getProviderName()} instead</span>
            </li>
            <li className="flex items-start gap-2">
              <span>2️⃣</span>
              <span>Continue using your current account</span>
            </li>
            <li className="flex items-start gap-2">
              <span>3️⃣</span>
              <span>Contact support to merge accounts manually</span>
            </li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSignInWithProvider}
            disabled={merging}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {merging ? 'Redirecting...' : `Use ${getProviderName()}`}
          </button>
          <button
            onClick={handleTryAgain}
            className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OAuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center"><LoadingSpinner /></div>}>
      <OAuthErrorContent />
    </Suspense>
  )
}
