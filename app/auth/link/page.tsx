'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { showToast } from '@/lib/i18n-toast'
import LoadingSpinner from '@/components/LoadingSpinner'

function LinkAccountContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [linking, setLinking] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const provider = searchParams?.get('provider')
  const linked = searchParams?.get('linked')

  const handleLinkAccount = useCallback(async () => {
    if (!provider) return

    try {
      // Show warning before linking that OAuth email may differ
      if (!confirmed) {
        setShowWarning(true)
        return
      }

      // Trigger OAuth sign-in which will link the account via PrismaAdapter
      // PrismaAdapter will link even if OAuth email differs from user's email
      const result = await signIn(provider, {
        callbackUrl: `/profile?linked=${provider}`,
        redirect: true,
      })
    } catch (error) {
      console.error('Link account error:', error)
      showToast.error('toast.linkAccountFailed')
      router.push('/profile')
    }
  }, [provider, router, confirmed])

  const handleConfirmLink = () => {
    setConfirmed(true)
    setShowWarning(false)
    setLinking(true)
    handleLinkAccount()
  }

  const getProviderName = useCallback(() => {
    switch (provider) {
      case 'google': return 'Google'
      case 'github': return 'GitHub'
      case 'discord': return 'Discord'
      default: return 'OAuth'
    }
  }, [provider])

  const getProviderIcon = () => {
    switch (provider) {
      case 'google': return '🔵'
      case 'github': return '⚫'
      case 'discord': return '🟣'
      default: return '🔗'
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
      return
    }

    if (!provider || !['google', 'github', 'discord'].includes(provider)) {
      showToast.error('toast.invalidProvider')
      router.replace('/profile')
      return
    }

    // If user just linked successfully, show success and redirect
    if (linked === provider) {
      showToast.success('toast.providerLinked', undefined, { provider: getProviderName() })
      setTimeout(() => router.push('/profile'), 2000)
      return
    }

    // Auto-trigger linking if not already linking and not showing warning
    if (status === 'authenticated' && !linking && !showWarning) {
      setLinking(true)
      handleLinkAccount()
    }
  }, [status, provider, linking, showWarning, linked, router, handleLinkAccount, getProviderName])

  // Show warning about different email before linking
  if (showWarning) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">{getProviderIcon()}</div>
            <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
              Link {getProviderName()} Account?
            </h1>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-600 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              ℹ️ You're about to link your {getProviderName()} account to this profile.
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Your {getProviderName()} email may be different from your current account email ({session?.user?.email}). This is okay - you'll be able to sign in with either email after linking.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <p className="text-gray-700 dark:text-gray-300 text-sm">
              <strong>What will happen:</strong>
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
              <li>Your {getProviderName()} account will be linked to this profile</li>
              <li>You can sign in using {getProviderName()} in the future</li>
              <li>Your current email and password login will still work</li>
              <li>All your game data remains on this account</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirmLink}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              ✓ Continue to {getProviderName()}
            </button>
            <button
              onClick={() => router.push('/profile')}
              className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while linking
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4 animate-bounce">{getProviderIcon()}</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
          Linking {getProviderName()} Account
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Please wait while we connect your {getProviderName()} account...
        </p>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          You'll be redirected to {getProviderName()} to authorize the connection
        </p>
      </div>
    </div>
  )
}

export default function LinkAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center"><LoadingSpinner /></div>}>
      <LinkAccountContent />
    </Suspense>
  )
}
