'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import toast from 'react-hot-toast'
import UsernameInput from '@/components/UsernameInput'
import GameHistory from '@/components/GameHistory'
import Friends from '@/components/Friends'

interface LinkedAccount {
  provider: string
  providerAccountId: string
  id: string
}

interface LinkedAccounts {
  google?: LinkedAccount
  github?: LinkedAccount
  discord?: LinkedAccount
}

type TabType = 'profile' | 'friends' | 'history' | 'settings'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { data: session, update, status } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(true)
  const [showResendVerification, setShowResendVerification] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccounts>({})
  const [loadingLinkedAccounts, setLoadingLinkedAccounts] = useState(true)

  useEffect(() => {
    if (session?.user?.name) {
      setUsername(session.user.name)
    }
  }, [session])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
    }
  }, [status, router])

  // Refresh session when the tab becomes visible or window gains focus.
  // This helps update `emailVerified` if user verified in another tab.
  useEffect(() => {
    const refreshOnFocus = () => {
      if (status === 'authenticated') {
        update().catch(() => {})
      }
    }

    window.addEventListener('focus', refreshOnFocus)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshOnFocus()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [status, update])

  // Check if account was just linked
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('linked') === 'true') {
      toast.success('🎉 Account linked successfully!')
      // Remove query param
      window.history.replaceState({}, '', '/profile')
    }
  }, [])

  useEffect(() => {
    const fetchLinkedAccounts = async () => {
      try {
        const res = await fetch('/api/user/linked-accounts')
        const data = await res.json()
        if (res.ok) {
          setLinkedAccounts(data.linkedAccounts || {})
        }
      } catch (error) {
        console.error('Failed to fetch linked accounts:', error)
      } finally {
        setLoadingLinkedAccounts(false)
      }
    }

    if (status === 'authenticated') {
      fetchLinkedAccounts()
    }
  }, [status])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username.trim()) {
      toast.error('Username cannot be empty')
      return
    }

    if (username.length < 3) {
      toast.error('Username must be at least 3 characters')
      return
    }

    if (username.length > 20) {
      toast.error('Username must be less than 20 characters')
      return
    }

    // Check if username is same as current
    const currentUsername = (session?.user as { username?: string })?.username || session?.user?.name
    if (username === currentUsername) {
      toast.error('This is already your username')
      return
    }

    if (!usernameAvailable) {
      toast.error('This username is not available')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      // Update session with new username
      await update({
        user: {
          username: username,
        },
      })

      toast.success('✅ Profile updated successfully!')
      
      // Reload page to reflect changes everywhere
      window.location.reload()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    setShowResendVerification(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()

      if (!res.ok) {
        // If backend reports that the email is already verified, refresh session so UI updates
        if (data && data.error === 'Email already verified') {
          await update()
          toast.success('✅ Email already verified')
          return
        }

        throw new Error(data.error || 'Failed to resend verification email')
      }

      toast.success('✅ Verification email sent! Check your inbox.')
      // Refresh session to get updated emailVerified status
      await update()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to resend verification email'
      toast.error(errorMessage)
    } finally {
      setShowResendVerification(false)
    }
  }

  const handleRequestAccountDeletion = async () => {
    setDeleteLoading(true)
    try {
      const res = await fetch('/api/user/request-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to request account deletion')
      }

      toast.success('📧 Deletion confirmation email sent! Check your inbox.')
      setShowDeleteConfirm(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to request account deletion'
      toast.error(errorMessage)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleUnlinkAccount = async (provider: string) => {
    if (!confirm(`Are you sure you want to unlink your ${provider} account?`)) {
      return
    }

    try {
      const res = await fetch('/api/user/linked-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to unlink account')
      }

      toast.success(`✅ ${provider} account unlinked`)
      
      // Refresh linked accounts
      const refreshRes = await fetch('/api/user/linked-accounts')
      const refreshData = await refreshRes.json()
      if (refreshRes.ok) {
        setLinkedAccounts(refreshData.linkedAccounts || {})
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unlink account'
      toast.error(errorMessage)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-2 sm:p-4">
      <div className="max-w-4xl mx-auto pt-16 sm:pt-20 pb-4">
        <div className="card animate-scale-in">
          {/* Header - Adaptive sizing */}
          <div className="mb-4 sm:mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-3 sm:mb-4">
              <span className="text-3xl sm:text-4xl">👤</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">{t('profile.title')}</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Manage your account settings
            </p>
          </div>

          {/* Tabs Navigation - Mobile optimized with scroll */}
          <div className="mb-4 sm:mb-6 border-b border-gray-200 dark:border-gray-700 -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto">
            <nav className="flex gap-2 sm:gap-4 min-w-max">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'profile'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <span className="inline sm:hidden">👤</span>
                <span className="hidden sm:inline">👤 {t('profile.title')}</span>
              </button>
              <button
                onClick={() => setActiveTab('friends')}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'friends'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <span className="inline sm:hidden">👥</span>
                <span className="hidden sm:inline">👥 {t('profile.friends.title')}</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'history'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <span className="inline sm:hidden">🎮</span>
                <span className="hidden sm:inline">🎮 {t('profile.gameHistory.title')}</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'settings'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <span className="inline sm:hidden">⚙️</span>
                <span className="hidden sm:inline">⚙️ {t('profile.settings.title')}</span>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'profile' && (
            <div>

          {/* Email Verification Banner - Only show for email/password accounts */}
          {session?.user?.email && !session?.user?.emailVerified && !linkedAccounts.google && !linkedAccounts.github && !linkedAccounts.discord && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl flex-shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1 text-sm sm:text-base">
                    Email Not Verified
                  </h3>
                  <p className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                    Please verify your email address to unlock all features. Unverified accounts may be automatically deleted after 7 days.
                  </p>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={showResendVerification}
                    className="text-xs sm:text-sm px-3 sm:px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-50 w-full sm:w-auto"
                  >
                    {showResendVerification ? 'Sending...' : '📧 Resend Verification Email'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4 sm:space-y-6">
            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Email {session?.user?.emailVerified && <span className="text-green-600 dark:text-green-400 text-xs sm:text-sm">✓ Verified</span>}
              </label>
              <input
                type="email"
                value={session?.user?.email || ''}
                disabled
                className="input bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-sm sm:text-base"
              />
              <p className="text-xs text-gray-500 mt-1">
                Email cannot be changed
              </p>
            </div>

            {/* Username with availability check */}
            <div>
              <UsernameInput
                value={username}
                onChange={setUsername}
                onAvailabilityChange={setUsernameAvailable}
                currentUsername={session?.user?.name || undefined}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This is the name other players will see in games
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1 text-sm sm:text-base"
              >
                {loading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="mr-2">💾</span>
                    Save Changes
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-secondary text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Connected Accounts */}
          <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold mb-2">🔗 Connected Accounts</h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4">
              Link your social accounts for quick login. You can use any linked account to sign in.
            </p>
            {loadingLinkedAccounts ? (
              <div className="text-center py-4 text-gray-500 text-sm">Loading...</div>
            ) : (
              <div className="space-y-3">
                {/* Google */}
                <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span className="text-xl sm:text-2xl flex-shrink-0">🔵</span>
                    <div>
                      <div className="font-medium text-sm sm:text-base">Google</div>
                      {linkedAccounts.google && (
                        <div className="text-xs text-green-600 dark:text-green-400">✓ Connected</div>
                      )}
                    </div>
                  </div>
                  {linkedAccounts.google ? (
                    <button
                      type="button"
                      onClick={() => handleUnlinkAccount('google')}
                      className="btn-social-unlink text-xs sm:text-sm w-full sm:w-auto"
                    >
                      Unlink
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => router.push('/auth/link?provider=google')}
                      className="btn-social btn-social-google text-xs sm:text-sm w-full sm:w-auto"
                    >
                      Connect
                    </button>
                  )}
                </div>

                {/* GitHub */}
                <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span className="text-xl sm:text-2xl flex-shrink-0">⚫</span>
                    <div>
                      <div className="font-medium text-sm sm:text-base">GitHub</div>
                      {linkedAccounts.github && (
                        <div className="text-xs text-green-600 dark:text-green-400">✓ Connected</div>
                      )}
                    </div>
                  </div>
                  {linkedAccounts.github ? (
                    <button
                      type="button"
                      onClick={() => handleUnlinkAccount('github')}
                      className="btn-social-unlink text-xs sm:text-sm w-full sm:w-auto"
                    >
                      Unlink
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => router.push('/auth/link?provider=github')}
                      className="btn-social btn-social-github text-xs sm:text-sm w-full sm:w-auto"
                    >
                      Connect
                    </button>
                  )}
                </div>

                {/* Discord */}
                <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span className="text-xl sm:text-2xl flex-shrink-0">🟣</span>
                    <div>
                      <div className="font-medium text-sm sm:text-base">Discord</div>
                      {linkedAccounts.discord && (
                        <div className="text-xs text-green-600 dark:text-green-400">✓ Connected</div>
                      )}
                    </div>
                  </div>
                  {linkedAccounts.discord ? (
                    <button
                      type="button"
                      onClick={() => handleUnlinkAccount('discord')}
                      className="btn-social-unlink text-xs sm:text-sm w-full sm:w-auto"
                    >
                      Unlink
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => router.push('/auth/link?provider=discord')}
                      className="btn-social btn-social-discord text-xs sm:text-sm w-full sm:w-auto"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-base sm:text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              🚨 Danger Zone
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm sm:text-base w-full sm:w-auto"
              >
                Delete Account
              </button>
            ) : (
              <div className="p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-600 rounded-lg">
                <p className="text-xs sm:text-sm text-red-800 dark:text-red-200 mb-3 sm:mb-4 font-semibold">
                  ⚠️ Are you absolutely sure? This action cannot be undone!
                </p>
                <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 mb-3 sm:mb-4">
                  We'll send a confirmation email to <strong className="break-all">{session?.user?.email}</strong>. Click the link in the email to permanently delete your account.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={handleRequestAccountDeletion}
                    disabled={deleteLoading}
                    className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 text-xs sm:text-sm w-full sm:w-auto"
                  >
                    {deleteLoading ? 'Sending...' : '📧 Send Deletion Email'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 sm:px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors text-xs sm:text-sm w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
          )}

          {/* Friends Tab */}
          {activeTab === 'friends' && (
            <div>
              <Friends />
            </div>
          )}

          {/* Game History Tab */}
          {activeTab === 'history' && (
            <div>
              <GameHistory />
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">{t('profile.settings.title')}</h2>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
                Settings coming soon: language, theme, notifications, and more.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
