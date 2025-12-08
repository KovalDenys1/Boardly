'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import toast from 'react-hot-toast'

export default function LinkAccountPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [linking, setLinking] = useState(false)
  const [showMergeConfirm, setShowMergeConfirm] = useState(false)
  const [mergeData, setMergeData] = useState<any>(null)
  const [merging, setMerging] = useState(false)
  const provider = searchParams?.get('provider')
  const error = searchParams?.get('error')
  const providerAccountId = searchParams?.get('providerAccountId')
  const conflictEmail = searchParams?.get('conflictEmail')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
      return
    }

    if (!provider || !['google', 'github', 'discord'].includes(provider)) {
      toast.error('Invalid provider')
      router.replace('/profile')
      return
    }

    // Check if there was an OAuth account linking error
    if (error === 'OAuthAccountNotLinked' && providerAccountId) {
      setShowMergeConfirm(true)
      setMergeData({ provider, providerAccountId, conflictEmail })
      return
    }

    if (status === 'authenticated' && !linking && !showMergeConfirm) {
      setLinking(true)
      handleLinkAccount()
    }
  }, [status, provider, linking, error, providerAccountId])

  const handleLinkAccount = async () => {
    if (!provider) return

    try {
      // Trigger OAuth sign-in which will link the account
      const result = await signIn(provider, {
        callbackUrl: `/auth/link?provider=${provider}`,
        redirect: true,
      })
    } catch (error) {
      console.error('Link account error:', error)
      toast.error('Failed to link account')
      router.push('/profile')
    }
  }

  const handleMergeAccounts = async () => {
    if (!mergeData) return

    setMerging(true)
    try {
      const res = await fetch('/api/user/merge-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: mergeData.provider,
          providerAccountId: mergeData.providerAccountId,
          confirmed: true
        })
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('🎉 Accounts merged successfully!')
        router.push('/profile?linked=true')
      } else {
        toast.error(data.error || 'Failed to merge accounts')
        router.push('/profile')
      }
    } catch (error) {
      console.error('Merge error:', error)
      toast.error('Failed to merge accounts')
      router.push('/profile')
    } finally {
      setMerging(false)
    }
  }

  const getProviderName = () => {
    switch (provider) {
      case 'google': return 'Google'
      case 'github': return 'GitHub'
      case 'discord': return 'Discord'
      default: return 'OAuth'
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

  if (showMergeConfirm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">{getProviderIcon()}</div>
            <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
              Merge Accounts?
            </h1>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ This {getProviderName()} account ({conflictEmail || 'unknown email'}) is already registered as a separate account.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <p className="text-gray-700 dark:text-gray-300 text-sm">
              <strong>What will happen:</strong>
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
              <li>Your current account will remain active</li>
              <li>The {getProviderName()} account will be linked to your current profile</li>
              <li>You'll be able to sign in with either account</li>
              <li>All game history from both accounts will be merged</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleMergeAccounts}
              disabled={merging}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {merging ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Merging...
                </>
              ) : (
                '✓ Merge Accounts'
              )}
            </button>
            <button
              onClick={() => router.push('/profile')}
              disabled={merging}
              className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

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
