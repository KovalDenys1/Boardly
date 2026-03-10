'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import UsernameInput from '@/components/UsernameInput'
import GameHistory from '@/components/GameHistory'
import Friends from '@/components/Friends'
import PlayerStatsDashboard from '@/components/PlayerStatsDashboard'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { navigateBackFromProfile } from '@/lib/profile-navigation'
import { UserAvatar } from '@/components/Header/UserAvatar'

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

type TabType = 'profile' | 'friends' | 'history' | 'stats' | 'settings'
const PROFILE_TABS: TabType[] = ['profile', 'friends', 'history', 'stats', 'settings']

function isTabType(value: string | null): value is TabType {
  return value !== null && PROFILE_TABS.includes(value as TabType)
}

type SettingsState = {
  language: string
  theme: 'light' | 'dark' | 'system'
  emailNotifications: boolean
  pushNotifications: boolean
  soundEffects: boolean
  profileVisibility: 'public' | 'friends' | 'private'
  showOnlineStatus: boolean
  autoJoin: boolean
  confirmMoves: boolean
  animations: boolean
}

type NotificationPreferences = {
  gameInvites: boolean
  turnReminders: boolean
  friendRequests: boolean
  friendAccepted: boolean
  unsubscribedAll: boolean
}

type ProfileSummary = {
  id: string
  username: string | null
  email: string | null
  pendingEmail: string | null
  image: string | null
  emailVerified: string | null
  createdAt: string
  publicProfileId: string | null
  friendsCount: number
  gamesPlayed: number
  linkedAccountsCount: number
}

type InlineEditorField = 'username' | 'email'
type InlineEditorStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'

function getInlineEditorErrorStatus(
  field: InlineEditorField,
  message: string
): Exclude<InlineEditorStatus, 'idle' | 'checking' | 'available'> {
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes('taken') ||
    normalizedMessage.includes('already in use') ||
    normalizedMessage.includes('already used') ||
    normalizedMessage.includes('already taken')
  ) {
    return 'taken'
  }

  if (
    normalizedMessage.includes('invalid') ||
    normalizedMessage.includes('must') ||
    normalizedMessage.includes('only contain')
  ) {
    return 'invalid'
  }

  return field === 'email' && normalizedMessage.includes('email') ? 'invalid' : 'error'
}

const DEFAULT_SETTINGS: SettingsState = {
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
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation()
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
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)
  const [editingField, setEditingField] = useState<InlineEditorField | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingStatus, setEditingStatus] = useState<InlineEditorStatus>('idle')
  const [editingMessage, setEditingMessage] = useState('')
  const [submittingInlineEdit, setSubmittingInlineEdit] = useState(false)
  const sessionUserName = profileSummary?.username || session?.user?.name || ''

  // Settings state
  const [settingsChanged, setSettingsChanged] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    gameInvites: true,
    turnReminders: true,
    friendRequests: true,
    friendAccepted: true,
    unsubscribedAll: false,
  })
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)

  const currentUsername = profileSummary?.username?.trim() || session?.user?.name || ''
  const currentEmail = profileSummary?.email?.trim() || session?.user?.email || ''
  const pendingEmail = profileSummary?.pendingEmail?.trim() || ''
  const displayName = currentUsername || currentEmail.split('@')[0] || 'Player'
  const effectiveEmailVerified = Boolean(profileSummary?.emailVerified || session?.user?.emailVerified)

  const memberSinceLabel = useMemo(() => {
    if (!profileSummary?.createdAt) {
      return '—'
    }

    return new Date(profileSummary.createdAt).toLocaleDateString(i18n.language || undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }, [i18n.language, profileSummary?.createdAt])

  const summaryCards = useMemo(
    () => [
      {
        id: 'friends',
        label: t('profile.friends.title'),
        value: String(profileSummary?.friendsCount ?? 0),
      },
      {
        id: 'games',
        label: t('profile.stats.gamesPlayed'),
        value: String(profileSummary?.gamesPlayed ?? 0),
      },
      {
        id: 'memberSince',
        label: t('profile.memberSince'),
        value: memberSinceLabel,
      },
      {
        id: 'premium',
        label: t('profile.premiumAccount'),
        value: t('profile.comingSoon'),
      },
    ],
    [memberSinceLabel, profileSummary?.friendsCount, profileSummary?.gamesPlayed, t]
  )

  const fetchProfileSummary = useCallback(async () => {
    const res = await fetch('/api/user/profile', { cache: 'no-store' })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load profile')
    }

    setProfileSummary(data.user)
    return data.user as ProfileSummary
  }, [])

  useEffect(() => {
    if (!sessionUserName) return
    setUsername((prev) => (prev === sessionUserName ? prev : sessionUserName))
  }, [sessionUserName])

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
        update()
          .then(() => fetchProfileSummary().catch(() => {}))
          .catch(() => { })
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
  }, [fetchProfileSummary, status, update])

  // Check if account was just linked
  useEffect(() => {
    if (typeof window === 'undefined') return

    const currentUrl = new URL(window.location.href)
    if (currentUrl.searchParams.get('linked') === 'true') {
      showToast.success('toast.accountLinked')

      currentUrl.searchParams.delete('linked')
      window.history.replaceState(
        {},
        '',
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
      )
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const currentUrl = new URL(window.location.href)
    const tabFromQuery = currentUrl.searchParams.get('tab')
    if (isTabType(tabFromQuery)) {
      setActiveTab(tabFromQuery)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const currentUrl = new URL(window.location.href)
    const tabInQuery = currentUrl.searchParams.get('tab')
    const nextTabInQuery = activeTab === 'profile' ? null : activeTab

    if (tabInQuery === nextTabInQuery) {
      return
    }

    if (!nextTabInQuery) {
      currentUrl.searchParams.delete('tab')
    } else {
      currentUrl.searchParams.set('tab', nextTabInQuery)
    }

    window.history.replaceState(
      {},
      '',
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
    )
  }, [activeTab])

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
      fetchProfileSummary().catch((error) => {
        showToast.errorFrom(error, 'toast.error')
      })
      fetchLinkedAccounts()

      // Load settings from localStorage
      const savedLanguage = localStorage.getItem('language') || 'en'
      const savedThemeRaw = localStorage.getItem('theme')
      const savedTheme: SettingsState['theme'] =
        savedThemeRaw === 'light' || savedThemeRaw === 'dark' ? savedThemeRaw : 'system'
      const savedSettings = localStorage.getItem('userSettings')

      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings)
          setSettings({
            ...DEFAULT_SETTINGS,
            ...(typeof parsed === 'object' && parsed !== null ? parsed : {}),
            language: savedLanguage,
            theme: savedTheme,
          })
        } catch {
          // Use defaults if parsing fails
        }
      } else {
        setSettings((prev) => ({
          ...DEFAULT_SETTINGS,
          ...prev,
          language: savedLanguage,
          theme: savedTheme
        }))
      }

      fetch('/api/user/notification-preferences', { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) return null
          return res.json()
        })
        .then((data) => {
          if (data?.preferences) {
            setNotificationPreferences(data.preferences)
          }
        })
        .catch(() => {})
    }
  }, [fetchProfileSummary, status])

  useEffect(() => {
    if (!editingField) {
      return
    }

    const trimmedValue = editingValue.trim()

    if (!trimmedValue) {
      setEditingStatus('idle')
      setEditingMessage(t('profile.inline.makeChange'))
      return
    }

    if (editingField === 'username') {
      if (trimmedValue === currentUsername) {
        setEditingStatus('idle')
        setEditingMessage(t('profile.inline.makeChange'))
        return
      }

      if (trimmedValue.length < 3) {
        setEditingStatus('invalid')
        setEditingMessage(t('auth.username.tooShort', 'Username must be at least 3 characters'))
        return
      }

      if (trimmedValue.length > 20) {
        setEditingStatus('invalid')
        setEditingMessage(t('auth.username.tooLong', 'Username must be at most 20 characters'))
        return
      }

      if (!/^[a-zA-Z0-9_]+$/.test(trimmedValue)) {
        setEditingStatus('invalid')
        setEditingMessage(t('auth.username.invalidChars', 'Username can only contain letters, numbers, and underscores'))
        return
      }

      setEditingStatus('checking')
      setEditingMessage(t('auth.username.checking', 'Checking availability...'))

      const timeoutId = window.setTimeout(async () => {
        try {
          const res = await fetch(`/api/user/check-username?username=${encodeURIComponent(trimmedValue)}`)
          const data = await res.json()

          if (!res.ok) {
            throw new Error(data.error || 'Failed to check username')
          }

          if (data.error) {
            setEditingStatus('invalid')
            setEditingMessage(data.error)
            return
          }

          if (data.available) {
            setEditingStatus('available')
            setEditingMessage(t('auth.username.available', 'Username is available!'))
            return
          }

          setEditingStatus('taken')
          setEditingMessage(t('auth.username.taken', 'Username is already taken'))
        } catch (error) {
          setEditingStatus('error')
          setEditingMessage(
            error instanceof Error ? error.message : t('profile.inline.checkFailed')
          )
        }
      }, 350)

      return () => window.clearTimeout(timeoutId)
    }

    const normalizedEmail = trimmedValue.toLowerCase()
    if (normalizedEmail === currentEmail.toLowerCase() || normalizedEmail === pendingEmail.toLowerCase()) {
      setEditingStatus('idle')
      setEditingMessage(t('profile.inline.makeChange'))
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEditingStatus('invalid')
      setEditingMessage(t('profile.inline.invalidEmail'))
      return
    }

    setEditingStatus('checking')
    setEditingMessage(t('profile.inline.checkingEmail'))

    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/user/check-email?email=${encodeURIComponent(normalizedEmail)}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to check email')
        }

        if (data.error) {
          setEditingStatus('invalid')
          setEditingMessage(data.error)
          return
        }

        if (data.available) {
          setEditingStatus('available')
          setEditingMessage(t('profile.inline.emailAvailable'))
          return
        }

        setEditingStatus('taken')
        setEditingMessage(t('profile.inline.emailTaken'))
      } catch (error) {
        setEditingStatus('error')
        setEditingMessage(
          error instanceof Error ? error.message : t('profile.inline.checkFailed')
        )
      }
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [currentEmail, currentUsername, editingField, editingValue, pendingEmail, t])

  const beginInlineEdit = (field: InlineEditorField) => {
    const initialValue = field === 'username' ? currentUsername : (pendingEmail || currentEmail)
    setEditingField(field)
    setEditingValue(initialValue)
    setEditingStatus('idle')
    setEditingMessage(t('profile.inline.makeChange'))
  }

  const cancelInlineEdit = () => {
    setEditingField(null)
    setEditingValue('')
    setEditingStatus('idle')
    setEditingMessage('')
  }

  const handleInlineEditSubmit = async () => {
    if (!editingField) {
      return
    }

    const trimmedValue = editingValue.trim()
    const hasChanged =
      editingField === 'username'
        ? trimmedValue !== currentUsername
        : trimmedValue.toLowerCase() !== (pendingEmail || currentEmail).toLowerCase()

    if (!hasChanged || editingStatus !== 'available') {
      return
    }

    setSubmittingInlineEdit(true)

    try {
      const payload =
        editingField === 'username'
          ? { username: trimmedValue }
          : { email: trimmedValue.toLowerCase() }

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      setProfileSummary(data.user)

      if (editingField === 'username') {
        const nextUsername = data.user?.username || trimmedValue
        setUsername(nextUsername)
        await update({
          user: {
            name: nextUsername,
            username: nextUsername,
          },
        })
        showToast.success('toast.profileUpdated')
      } else {
        showToast.success('toast.verificationSent')
      }

      cancelInlineEdit()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('profile.inline.checkFailed')

      setEditingStatus(getInlineEditorErrorStatus(editingField, message))
      setEditingMessage(message)
      showToast.errorFrom(error, 'toast.error')
    } finally {
      setSubmittingInlineEdit(false)
    }
  }

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

      if (data.user) {
        setProfileSummary(data.user)
      }

      const updatedUsername = data.user?.username || username
      setUsername(updatedUsername)

      // Update session with new username
      await update({
        user: {
          name: updatedUsername,
          username: updatedUsername,
        },
      })

      showToast.success('toast.profileUpdated')
    } catch (error) {
      showToast.errorFrom(error, 'toast.error')
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
      await fetchProfileSummary()
    } catch (error) {
      showToast.errorFrom(error, 'toast.error')
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
      showToast.errorFrom(error, 'toast.error')
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
      showToast.errorFrom(error, 'toast.error')
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

      // Save server-side email notification preferences
      const prefsRes = await fetch('/api/user/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPreferences),
      })
      if (!prefsRes.ok) {
        throw new Error('Failed to save notification preferences')
      }

      showToast.success('profile.settings.saved')
      setSettingsChanged(false)
    } catch {
      showToast.error('profile.settings.error')
    } finally {
      setSavingSettings(false)
    }
  }

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSettingsChanged(true)
  }

  const updateNotificationPreference = (key: keyof NotificationPreferences, value: boolean) => {
    setNotificationPreferences((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'unsubscribedAll' && value) {
        next.gameInvites = false
        next.turnReminders = false
        next.friendRequests = false
        next.friendAccepted = false
      }
      if (key !== 'unsubscribedAll' && value) {
        next.unsubscribedAll = false
      }
      return next
    })
    setSettingsChanged(true)
  }

  const handleBackNavigation = () => {
    navigateBackFromProfile(router)
  }

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
  }

  const tabItems: Array<{ id: TabType; icon: string; label: string }> = [
    { id: 'profile', icon: '👤', label: t('profile.title') },
    { id: 'friends', icon: '👥', label: t('profile.friends.title') },
    { id: 'history', icon: '🎮', label: t('profile.gameHistory.title') },
    { id: 'stats', icon: '📊', label: t('profile.stats.title') },
    { id: 'settings', icon: '⚙️', label: t('profile.settings.title') },
  ]

  const inlineEditorHasChanges = editingField
    ? editingField === 'username'
      ? editingValue.trim() !== currentUsername
      : editingValue.trim().toLowerCase() !== (pendingEmail || currentEmail).toLowerCase()
    : false

  const inlineEditorCanSubmit =
    inlineEditorHasChanges &&
    editingStatus === 'available' &&
    !submittingInlineEdit

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
          <div className="mb-6 rounded-[28px] border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur sm:mb-8 sm:p-6 lg:p-8 dark:border-slate-700/70 dark:bg-slate-900/50">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={handleBackNavigation}
                  className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition-colors hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  <span aria-hidden>←</span>
                  <span>{t('common.back')}</span>
                </button>

                <div className="mt-4">
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                    {t('profile.title')}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base dark:text-slate-300">
                    {t('profile.inline.headerHint')}
                  </p>
                </div>

                <div className="mt-6 grid gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          {t('profile.username')}
                        </p>
                        <button
                          type="button"
                          onDoubleClick={() => beginInlineEdit('username')}
                          className="mt-2 block max-w-full text-left text-xl font-semibold text-slate-900 transition-colors hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                        >
                          <span className="block truncate">
                            {currentUsername || t('profile.inline.noValue')}
                          </span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => beginInlineEdit('username')}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                        aria-label={t('profile.inline.editUsername')}
                      >
                        {t('profile.inline.edit')}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          {t('profile.email')}
                        </p>
                        <button
                          type="button"
                          onDoubleClick={() => beginInlineEdit('email')}
                          className="mt-2 block max-w-full text-left text-base font-medium text-slate-900 transition-colors hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                        >
                          <span className="block truncate">{currentEmail || t('profile.inline.noValue')}</span>
                        </button>
                        {pendingEmail && (
                          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                            <span className="min-w-0 break-all">
                              {t('profile.inline.pendingEmailNotice', { email: pendingEmail })}
                            </span>
                            <button
                              type="button"
                              onClick={handleResendVerification}
                              disabled={showResendVerification}
                              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {showResendVerification
                                ? t('common.loading')
                                : t('profile.inline.resendVerification')}
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => beginInlineEdit('email')}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                        aria-label={t('profile.inline.editEmail')}
                      >
                        {t('profile.inline.edit')}
                      </button>
                    </div>
                  </div>

                  {editingField && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10">
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {editingField === 'username'
                              ? t('profile.inline.editUsername')
                              : t('profile.inline.editEmail')}
                          </p>
                        </div>

                        <input
                          type={editingField === 'email' ? 'email' : 'text'}
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              cancelInlineEdit()
                            }

                            if (event.key === 'Enter' && inlineEditorCanSubmit) {
                              void handleInlineEditSubmit()
                            }
                          }}
                          className={`input ${
                            editingStatus === 'available'
                              ? 'border-green-500 dark:border-green-400'
                              : editingStatus === 'taken' || editingStatus === 'invalid' || editingStatus === 'error'
                                ? 'border-red-500 dark:border-red-400'
                                : ''
                          }`}
                          autoFocus
                        />

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p
                            className={`text-sm ${
                              editingStatus === 'available'
                                ? 'text-green-700 dark:text-green-300'
                                : editingStatus === 'taken' || editingStatus === 'invalid' || editingStatus === 'error'
                                  ? 'text-red-700 dark:text-red-300'
                                  : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {editingMessage}
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <button
                              type="button"
                              onClick={() => void handleInlineEditSubmit()}
                              disabled={!inlineEditorCanSubmit}
                              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {submittingInlineEdit ? t('common.loading') : t('profile.inline.confirm')}
                            </button>
                            <button
                              type="button"
                              onClick={cancelInlineEdit}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {t('profile.inline.cancel')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 lg:w-[240px] xl:w-[260px]">
                <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-5 text-center shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-950">
                  <UserAvatar
                    image={profileSummary?.image || session?.user?.image || null}
                    userName={currentUsername || displayName}
                    userEmail={currentEmail}
                    className="h-24 w-24 bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg sm:h-28 sm:w-28 lg:h-32 lg:w-32"
                    textClassName="text-3xl font-bold"
                  />
                  <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
                    {displayName}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t('profile.inline.avatarCaption')}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summaryCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    {card.label}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4 sm:mb-6 border-b border-gray-200 dark:border-gray-700">
            <nav
              role="tablist"
              aria-label={t('profile.title')}
              className="grid grid-cols-5 gap-1 sm:gap-2"
            >
              {tabItems.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`profile-tab-panel-${tab.id}`}
                  id={`profile-tab-${tab.id}`}
                  onClick={() => handleTabChange(tab.id)}
                  className={`min-w-0 rounded-t-2xl border-b-2 px-2 py-3 text-center font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300'
                      : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="text-base sm:hidden">{tab.icon}</span>
                  <span className="hidden items-center justify-center gap-2 sm:inline-flex">
                    <span aria-hidden>{tab.icon}</span>
                    <span className="truncate text-xs lg:text-sm">{tab.label}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'profile' && (
            <div role="tabpanel" id="profile-tab-panel-profile" aria-labelledby="profile-tab-profile">

              {/* Email Verification Banner - Only show for email/password accounts */}
              {currentEmail && !effectiveEmailVerified && !linkedAccounts.google && !linkedAccounts.github && !linkedAccounts.discord && (
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
                    Email {effectiveEmailVerified && <span className="text-green-600 dark:text-green-400 text-xs sm:text-sm">✓ Verified</span>}
                  </label>
                  <input
                    type="email"
                    value={currentEmail}
                    disabled
                    className="input bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-sm sm:text-base"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {pendingEmail
                      ? t('profile.inline.pendingEmailHelp', { email: pendingEmail })
                      : t('profile.inline.changeEmailHint')}
                  </p>
                </div>

                {/* Username with availability check */}
                <div>
                  <UsernameInput
                    value={username}
                    onChange={setUsername}
                    onAvailabilityChange={setUsernameAvailable}
                    currentUsername={currentUsername || undefined}
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
                    onClick={handleBackNavigation}
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
                        <div className="min-w-0">
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
                        <div className="min-w-0">
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
                        <div className="min-w-0">
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
            <div role="tabpanel" id="profile-tab-panel-friends" aria-labelledby="profile-tab-friends">
              <Friends />
            </div>
          )}

          {/* Game History Tab */}
          {activeTab === 'history' && (
            <div role="tabpanel" id="profile-tab-panel-history" aria-labelledby="profile-tab-history">
              <GameHistory />
            </div>
          )}

          {/* Statistics Tab */}
          {activeTab === 'stats' && (
            <div role="tabpanel" id="profile-tab-panel-stats" aria-labelledby="profile-tab-stats">
              {session?.user?.id ? (
                <PlayerStatsDashboard userId={session.user.id} />
              ) : (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Unable to load statistics right now.
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div
              role="tabpanel"
              id="profile-tab-panel-settings"
              aria-labelledby="profile-tab-settings"
              className="space-y-6"
            >
              <div>
                <h2 className="text-xl sm:text-2xl font-bold mb-1 break-words">{t('profile.settings.title')}</h2>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 break-words">
                  {t('profile.settings.subtitle')}
                </p>
              </div>

              {/* Language Settings */}
              <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start gap-3 mb-4 min-w-0">
                  <span className="text-2xl">🌐</span>
                  <div className="min-w-0">
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
                <div className="flex items-start gap-3 mb-4 min-w-0">
                  <span className="text-2xl">🎨</span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.theme.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.theme.subtitle')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <div className="flex items-start gap-3 mb-4 min-w-0">
                  <span className="text-2xl">🔔</span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.notifications.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.notifications.subtitle')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.emailNotifications}
                      onCheckedChange={(checked) => updateSetting('emailNotifications', Boolean(checked))}
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
                      onCheckedChange={(checked) => updateSetting('pushNotifications', Boolean(checked))}
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
                      onCheckedChange={(checked) => updateSetting('soundEffects', Boolean(checked))}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">{t('profile.settings.notifications.sound')}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.notifications.soundDesc')}</div>
                    </div>
                  </Label>

                  <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Email Notification Categories (server-side)
                    </div>

                    <Label className="flex items-start gap-3 cursor-pointer mb-3">
                      <Checkbox
                        checked={notificationPreferences.unsubscribedAll}
                        onCheckedChange={(checked) => updateNotificationPreference('unsubscribedAll', Boolean(checked))}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Unsubscribe from all email notifications</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Overrides all categories below
                        </div>
                      </div>
                    </Label>

                    <Label className="flex items-start gap-3 cursor-pointer mb-3">
                      <Checkbox
                        checked={notificationPreferences.gameInvites}
                        onCheckedChange={(checked) => updateNotificationPreference('gameInvites', Boolean(checked))}
                        disabled={notificationPreferences.unsubscribedAll}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Game invites & rematches</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Email me when friends invite me to a lobby or rematch
                        </div>
                      </div>
                    </Label>

                    <Label className="flex items-start gap-3 cursor-pointer mb-3">
                      <Checkbox
                        checked={notificationPreferences.turnReminders}
                        onCheckedChange={(checked) => updateNotificationPreference('turnReminders', Boolean(checked))}
                        disabled={notificationPreferences.unsubscribedAll}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Turn reminders</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          For long-running games (future)
                        </div>
                      </div>
                    </Label>

                    <Label className="flex items-start gap-3 cursor-pointer mb-3">
                      <Checkbox
                        checked={notificationPreferences.friendRequests}
                        onCheckedChange={(checked) => updateNotificationPreference('friendRequests', Boolean(checked))}
                        disabled={notificationPreferences.unsubscribedAll}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Friend requests</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          For future friend notification emails
                        </div>
                      </div>
                    </Label>

                    <Label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={notificationPreferences.friendAccepted}
                        onCheckedChange={(checked) => updateNotificationPreference('friendAccepted', Boolean(checked))}
                        disabled={notificationPreferences.unsubscribedAll}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">Friend request accepted</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          For future friend notification emails
                        </div>
                      </div>
                    </Label>
                  </div>
                </div>
              </div>

              {/* Privacy Settings */}
              <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-start gap-3 mb-4 min-w-0">
                  <span className="text-2xl">🔒</span>
                  <div className="min-w-0">
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
                      onChange={(e) =>
                        updateSetting('profileVisibility', e.target.value as SettingsState['profileVisibility'])
                      }
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
                      onCheckedChange={(checked) => updateSetting('showOnlineStatus', Boolean(checked))}
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
                <div className="flex items-start gap-3 mb-4 min-w-0">
                  <span className="text-2xl">🎮</span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold mb-1">{t('profile.settings.game.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.settings.game.subtitle')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <Label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.autoJoin}
                      onCheckedChange={(checked) => updateSetting('autoJoin', Boolean(checked))}
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
                      onCheckedChange={(checked) => updateSetting('confirmMoves', Boolean(checked))}
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
                      onCheckedChange={(checked) => updateSetting('animations', Boolean(checked))}
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
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-blue-900 dark:text-blue-100">
                        You have unsaved changes
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300 break-words">
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
