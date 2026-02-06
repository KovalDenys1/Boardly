'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import UsernameInput from '@/components/UsernameInput'
import GameHistory from '@/components/GameHistory'
import Friends from '@/components/Friends'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

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

  // Settings state
  const [settingsChanged, setSettingsChanged] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settings, setSettings] = useState({
    language: 'en',
    theme: 'system',
    emailNotifications: true,
    pushNotifications: false,
    soundEffects: true,
    profileVisibility: 'public',
    showOnlineStatus: true,
    autoJoin: false,
    confirmMoves: true,
    animations: true,
  })

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
        update().catch(() => { })
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
      showToast.success('toast.accountLinked')
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

      // Load settings from localStorage
      const savedLanguage = localStorage.getItem('language') || 'en'
      const savedTheme = localStorage.getItem('theme') || 'system'
      const savedSettings = localStorage.getItem('userSettings')

      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings)
          setSettings({
            language: savedLanguage,
            theme: savedTheme,
            ...parsed
          })
        } catch (e) {
          // Use defaults if parsing fails
        }
      } else {
        setSettings(prev => ({
          ...prev,
          language: savedLanguage,
          theme: savedTheme
        }))
      }
    }
  }, [status])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!username.trim()) {
      showToast.error('toast.usernameEmpty')
      return
    }

    if (username.length < 3) {
      showToast.error('toast.usernameTooShort')
      return
    }

    if (username.length > 20) {
      showToast.error('toast.usernameTooLong')
      return
    }

    // Check if username is same as current
    const currentUsername = (session?.user as { username?: string })?.username || session?.user?.name
    if (username === currentUsername) {
      showToast.error('toast.usernameSame')
      return
    }

    if (!usernameAvailable) {
      showToast.error('toast.usernameUnavailable')
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

      showToast.success('toast.profileUpdated')

      // Reload page to reflect changes everywhere
      window.location.reload()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile'
      showToast.error('toast.error', errorMessage)
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
          showToast.success('toast.emailVerified')
          return
        }

        throw new Error(data.error || 'Failed to resend verification email')
      }

      showToast.success('toast.verificationSent')
      // Refresh session to get updated emailVerified status
      await update()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to resend verification email'
      showToast.error('toast.error', errorMessage)
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

      showToast.success('toast.deletionConfirmSent')
      setShowDeleteConfirm(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to request account deletion'
      showToast.error('toast.error', errorMessage)
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

      showToast.success('toast.providerUnlinked', undefined, { provider })

      // Refresh linked accounts
      const refreshRes = await fetch('/api/user/linked-accounts')
      const refreshData = await refreshRes.json()
      if (refreshRes.ok) {
        setLinkedAccounts(refreshData.linkedAccounts || {})
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unlink account'
      showToast.error('toast.error', errorMessage)
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      // Save to localStorage
      localStorage.setItem('language', settings.language)
      localStorage.setItem('theme', settings.theme)
      localStorage.setItem('userSettings', JSON.stringify({
        emailNotifications: settings.emailNotifications,
        pushNotifications: settings.pushNotifications,
        soundEffects: settings.soundEffects,
        profileVisibility: settings.profileVisibility,
        showOnlineStatus: settings.showOnlineStatus,
        autoJoin: settings.autoJoin,
        confirmMoves: settings.confirmMoves,
        animations: settings.animations,
      }))

      // Apply theme
      if (settings.theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (settings.theme === 'light') {
        document.documentElement.classList.remove('dark')
      } else {
        // System preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }

      // Trigger language change
      window.dispatchEvent(new Event('languageChange'))

      showToast.success('profile.settings.saved')
      setSettingsChanged(false)

      // Reload to apply all settings
      setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      showToast.error('profile.settings.error')
    } finally {
      setSavingSettings(false)
    }
  }

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSettingsChanged(true)
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
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === 'profile'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
              >
                <span className="inline sm:hidden">👤</span>
                <span className="hidden sm:inline">👤 {t('profile.title')}</span>
              </button>
              <button
                onClick={() => setActiveTab('friends')}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === 'friends'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
              >
                <span className="inline sm:hidden">👥</span>
                <span className="hidden sm:inline">👥 {t('profile.friends.title')}</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === 'history'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
              >
                <span className="inline sm:hidden">🎮</span>
                <span className="hidden sm:inline">🎮 {t('profile.gameHistory.title')}</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === 'settings'
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
            <div className="space-y-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold mb-1">{t('profile.settings.title')}</h2>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  {t('profile.settings.subtitle')}
                </p>
              </div>

              {/* Language Settings */}
              <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">🌐</span>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.language.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.language.subtitle')}</p>
                  </div>
                </div>
                <select
                  value={settings.language}
                  onChange={(e) => updateSetting('language', e.target.value)}
                  className="input w-full"
                >
                  <option value="en">English</option>
                  <option value="uk">Українська</option>
                  <option value="ru">Русский</option>
                  <option value="no">Norsk</option>
                </select>
              </div>

              {/* Theme Settings */}
              <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">🎨</span>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.theme.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.theme.subtitle')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => updateSetting('theme', 'light')}
                    className={`p-4 border-2 rounded-lg transition-all ${settings.theme === 'light'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}
                  >
                    <div className="text-2xl mb-2">☀️</div>
                    <div className="text-sm font-medium">{t('profile.settings.theme.light')}</div>
                  </button>
                  <button
                    onClick={() => updateSetting('theme', 'dark')}
                    className={`p-4 border-2 rounded-lg transition-all ${settings.theme === 'dark'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}
                  >
                    <div className="text-2xl mb-2">🌙</div>
                    <div className="text-sm font-medium">{t('profile.settings.theme.dark')}</div>
                  </button>
                  <button
                    onClick={() => updateSetting('theme', 'system')}
                    className={`p-4 border-2 rounded-lg transition-all ${settings.theme === 'system'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}
                  >
                    <div className="text-2xl mb-2">⚙️</div>
                    <div className="text-sm font-medium">{t('profile.settings.theme.system')}</div>
                  </button>
                </div>
              </div>

              {/* Notification Settings */}
              <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">🔔</span>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.notifications.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.notifications.subtitle')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.emailNotifications}
                      onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.notifications.email')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.notifications.emailDesc')}</div>
                    </div>
                  </Label>
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.pushNotifications}
                      onCheckedChange={(checked) => updateSetting('pushNotifications', checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.notifications.push')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.notifications.pushDesc')}</div>
                    </div>
                  </Label>
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.soundEffects}
                      onCheckedChange={(checked) => updateSetting('soundEffects', checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.notifications.sound')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.notifications.soundDesc')}</div>
                    </div>
                  </Label>
                </div>
              </div>

              {/* Privacy Settings */}
              <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">🔒</span>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.privacy.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.privacy.subtitle')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block font-medium mb-2">{t('profile.settings.privacy.profileVisibility')}</label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{t('profile.settings.privacy.profileVisibilityDesc')}</p>
                    <select
                      value={settings.profileVisibility}
                      onChange={(e) => updateSetting('profileVisibility', e.target.value)}
                      className="input w-full"
                    >
                      <option value="public">🌍 {t('profile.settings.privacy.public')}</option>
                      <option value="friends">👥 {t('profile.settings.privacy.friendsOnly')}</option>
                      <option value="private">🔒 {t('profile.settings.privacy.private')}</option>
                    </select>
                  </div>
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.showOnlineStatus}
                      onCheckedChange={(checked) => updateSetting('showOnlineStatus', checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.privacy.showOnline')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.privacy.showOnlineDesc')}</div>
                    </div>
                  </Label>
                </div>
              </div>

              {/* Game Preferences */}
              <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">🎮</span>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.game.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.game.subtitle')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.autoJoin}
                      onCheckedChange={(checked) => updateSetting('autoJoin', checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.game.autoJoin')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.game.autoJoinDesc')}</div>
                    </div>
                  </Label>
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.confirmMoves}
                      onCheckedChange={(checked) => updateSetting('confirmMoves', checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.game.confirmMoves')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.game.confirmMovesDesc')}</div>
                    </div>
                  </Label>
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.animations}
                      onCheckedChange={(checked) => updateSetting('animations', checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.game.animations')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.game.animationsDesc')}</div>
                    </div>
                  </Label>
                </div>
              </div>

              {/* Save Button */}
              {settingsChanged && (
                <div className="sticky bottom-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 rounded-lg shadow-lg">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-blue-900 dark:text-blue-100">
                        You have unsaved changes
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Don't forget to save your settings
                      </p>
                    </div>
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="btn btn-primary w-full sm:w-auto"
                    >
                      {savingSettings ? (
                        <>
                          <span className="animate-spin mr-2">⏳</span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <span className="mr-2">💾</span>
                          Save Settings
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
