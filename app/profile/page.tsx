'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import UsernameInput from '@/components/UsernameInput'
import GameHistory from '@/components/GameHistory'
import Friends from '@/components/Friends'
import PlayerStatsDashboard from '@/components/PlayerStatsDashboard'
import { Checkbox } from '@/components/ui/checkbox'
import BoardlySelect from '@/components/ui/BoardlySelect'
import { Label } from '@/components/ui/label'
import { navigateBackFromProfile } from '@/lib/profile-navigation'
import { UserAvatar } from '@/components/Header/UserAvatar'
import AvatarPicker from '@/components/AvatarPicker'
import PublicProfileView from '@/components/PublicProfileView'
import {
  getStoredAppearancePreferences,
  normalizeAppearanceLocale,
  setStoredAppearanceLocale,
} from '@/lib/appearance-preferences'

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
const PROFILE_VISIBILITY_REFRESH_INTERVAL_MS = 60 * 1000

function isTabType(value: string | null): value is TabType {
  return value !== null && PROFILE_TABS.includes(value as TabType)
}

type SettingsState = {
  language: string
}

type AccountPreferences = {
  profileVisibility: 'public' | 'friends' | 'private'
  showOnlineStatus: boolean
}

type NotificationPreferences = {
  inAppNotifications: boolean
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
  avatarUrl: string | null
  emailVerified: string | null
  createdAt: string
  publicProfileId: string | null
  friendsCount: number
  gamesPlayed: number
  linkedAccountsCount: number
  achievementStats?: {
    completedGamesCount: number
    winsCount: number
  }
}

type InlineEditorField = 'username' | 'email'
type InlineEditorStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'
type PublicProfilePreviewTransitionPhase = 'idle' | 'hero-exit' | 'preview-enter' | 'preview-exit' | 'hero-enter'

const PROFILE_PREVIEW_EXIT_MS = 220
const PROFILE_PREVIEW_ENTER_MS = 420
const PROFILE_TAB_INDICATOR_X_INSET_PX = 2

function getProfilePreviewTransitionTimings() {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return {
      exitMs: 0,
      enterMs: 0,
    }
  }

  return {
    exitMs: PROFILE_PREVIEW_EXIT_MS,
    enterMs: PROFILE_PREVIEW_ENTER_MS,
  }
}

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
}

const SETTINGS_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English', badge: 'EN' },
  { value: 'uk', label: 'Ukrainian', badge: 'UA' },
  { value: 'no', label: 'Norwegian', badge: 'NO' },
  { value: 'ru', label: 'Russian', badge: 'RU' },
]

export default function ProfilePage() {
  const { t, i18n } = useTranslation()
  const { data: session, update, status } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(true)
  const [emailStatus, setEmailStatus] = useState<InlineEditorStatus>('idle')
  const [emailMessage, setEmailMessage] = useState('')
  const [showResendVerification, setShowResendVerification] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccounts>({})
  const [loadingLinkedAccounts, setLoadingLinkedAccounts] = useState(true)
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)
  const [showPublicProfilePreview, setShowPublicProfilePreview] = useState(false)
  const [publicProfilePreviewTransitionPhase, setPublicProfilePreviewTransitionPhase] =
    useState<PublicProfilePreviewTransitionPhase>('idle')
  const [editingField, setEditingField] = useState<InlineEditorField | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingStatus, setEditingStatus] = useState<InlineEditorStatus>('idle')
  const [editingMessage, setEditingMessage] = useState('')
  const [submittingInlineEdit, setSubmittingInlineEdit] = useState(false)
  const [activeTabIndicatorStyle, setActiveTabIndicatorStyle] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  })
  const lastVisibilityRefreshAtRef = useRef(0)
  const publicProfilePreviewTimerIdsRef = useRef<number[]>([])
  const tabListRef = useRef<HTMLElement | null>(null)
  const tabButtonRefs = useRef<Partial<Record<TabType, HTMLButtonElement | null>>>({})
  const sessionUserName = profileSummary?.username || session?.user?.name || ''

  // Settings state
  const [notificationsSaving, setNotificationsSaving] = useState(false)
  const [accountPreferencesSaving, setAccountPreferencesSaving] = useState(false)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    inAppNotifications: true,
    gameInvites: true,
    turnReminders: true,
    friendRequests: true,
    friendAccepted: true,
    unsubscribedAll: false,
  })
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [accountPreferences, setAccountPreferences] = useState<AccountPreferences>({
    profileVisibility: 'public',
    showOnlineStatus: true,
  })

  const currentUsername = profileSummary?.username?.trim() || session?.user?.name || ''
  const currentEmail = profileSummary?.email?.trim() || session?.user?.email || ''
  const pendingEmail = profileSummary?.pendingEmail?.trim() || ''
  const editableEmail = pendingEmail || currentEmail
  const displayName = currentUsername || currentEmail.split('@')[0] || t('profile.playerFallback')
  const effectiveEmailVerified = Boolean(profileSummary?.emailVerified || session?.user?.emailVerified)
  const emailNotificationsEnabled = !notificationPreferences.unsubscribedAll
  const achievementStats = profileSummary?.achievementStats
  const completedGamesCount = achievementStats?.completedGamesCount ?? 0
  const winsCount = achievementStats?.winsCount ?? 0

  const memberSinceLabel = useMemo(() => {
    if (!profileSummary?.createdAt) {
      return '--'
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
        accent: 'bg-bd-coral text-bd-coral-deep',
      },
      {
        id: 'games',
        label: t('profile.stats.gamesCompleted'),
        value: String(profileSummary?.achievementStats?.completedGamesCount ?? 0),
        accent: 'bg-bd-mint text-bd-mint-deep',
      },
      {
        id: 'memberSince',
        label: t('profile.memberSince'),
        value: memberSinceLabel,
        accent: 'bg-bd-sun text-[#9b6b00]',
      },
      {
        id: 'premium',
        label: t('profile.premiumAccount'),
        value: t('profile.comingSoon'),
        accent: 'bg-bd-lav text-[#7867e8]',
      },
    ],
    [memberSinceLabel, profileSummary?.friendsCount, profileSummary?.achievementStats?.completedGamesCount, t]
  )

  const fetchProfileSummary = useCallback(async () => {
    const res = await fetch('/api/user/profile', { cache: 'no-store' })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || t('profile.errors.loadFailed'))
    }

    setProfileSummary(data.user)
    return data.user as ProfileSummary
  }, [t])

  useEffect(() => {
    if (!sessionUserName) return
    setUsername((prev) => (prev === sessionUserName ? prev : sessionUserName))
  }, [sessionUserName])

  useEffect(() => {
    setEmail((previousValue) => (previousValue === editableEmail ? previousValue : editableEmail))
  }, [editableEmail])

  useEffect(() => {
    if (editingField === 'username') {
      setEditingValue((previousValue) => (previousValue === username ? previousValue : username))
    }
  }, [editingField, username])

  useEffect(() => {
    if (editingField === 'email') {
      setEditingValue((previousValue) => (previousValue === email ? previousValue : email))
    }
  }, [editingField, email])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
    }
  }, [status, router])

  // Refresh profile state quietly when returning to the tab, without forcing
  // a session update/loading cycle on every alt-tab.
  useEffect(() => {
    const refreshOnVisibility = () => {
      if (document.visibilityState !== 'visible' || status !== 'authenticated') {
        return
      }

      const now = Date.now()
      if (now - lastVisibilityRefreshAtRef.current < PROFILE_VISIBILITY_REFRESH_INTERVAL_MS) {
        return
      }

      lastVisibilityRefreshAtRef.current = now
      fetchProfileSummary().catch(() => {})
    }

    document.addEventListener('visibilitychange', refreshOnVisibility)

    return () => {
      document.removeEventListener('visibilitychange', refreshOnVisibility)
    }
  }, [fetchProfileSummary, status])

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

      // Load local appearance settings
      setSettings(getStoredAppearancePreferences(localStorage))

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

      fetch('/api/user/account-preferences', { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) return null
          return res.json()
        })
        .then((data) => {
          if (data?.preferences) {
            setAccountPreferences((prev) => ({
              ...prev,
              ...data.preferences,
            }))
          }
        })
        .catch(() => {})
    }
  }, [fetchProfileSummary, status])

  useEffect(() => {
    const syncSettingsLanguage = (nextLanguage?: string) => {
      const normalizedLanguage = normalizeAppearanceLocale(nextLanguage || i18n.language)
      setSettings((prev) => (
        prev.language === normalizedLanguage
          ? prev
          : { ...prev, language: normalizedLanguage }
      ))
    }

    syncSettingsLanguage(i18n.language)

    if (typeof i18n.on === 'function' && typeof i18n.off === 'function') {
      i18n.on('languageChanged', syncSettingsLanguage)

      return () => {
        i18n.off('languageChanged', syncSettingsLanguage)
      }
    }

    return undefined
  }, [i18n])

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
            throw new Error(data.error || t('profile.errors.checkUsernameFailed'))
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
          throw new Error(data.error || t('profile.errors.checkEmailFailed'))
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

  useEffect(() => {
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setEmailStatus('invalid')
      setEmailMessage(t('profile.inline.invalidEmail'))
      return
    }

    const normalizedEmail = trimmedEmail.toLowerCase()
    if (normalizedEmail === editableEmail.toLowerCase()) {
      setEmailStatus('idle')
      setEmailMessage(t('profile.inline.changeEmailHint'))
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailStatus('invalid')
      setEmailMessage(t('profile.inline.invalidEmail'))
      return
    }

    setEmailStatus('checking')
    setEmailMessage(t('profile.inline.checkingEmail'))

    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/user/check-email?email=${encodeURIComponent(normalizedEmail)}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || t('profile.errors.checkEmailFailed'))
        }

        if (data.error) {
          setEmailStatus('invalid')
          setEmailMessage(data.error)
          return
        }

        if (data.available) {
          setEmailStatus('available')
          setEmailMessage(t('profile.inline.emailAvailable'))
          return
        }

        setEmailStatus('taken')
        setEmailMessage(t('profile.inline.emailTaken'))
      } catch (error) {
        setEmailStatus('error')
        setEmailMessage(
          error instanceof Error ? error.message : t('profile.inline.checkFailed')
        )
      }
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [editableEmail, email, t])

  const updateUsernameDraft = useCallback((nextValue: string) => {
    setUsername(nextValue)
    setEditingValue((previousValue) =>
      editingField === 'username' && previousValue !== nextValue ? nextValue : previousValue
    )
  }, [editingField])

  const updateEmailDraft = useCallback((nextValue: string) => {
    setEmail(nextValue)
    setEditingValue((previousValue) =>
      editingField === 'email' && previousValue !== nextValue ? nextValue : previousValue
    )
  }, [editingField])

  const beginInlineEdit = (field: InlineEditorField) => {
    const initialValue = field === 'username' ? username : email
    setEditingField(field)
    setEditingValue(initialValue)
    setEditingStatus('idle')
    setEditingMessage(t('profile.inline.makeChange'))
  }

  const cancelInlineEdit = () => {
    if (editingField === 'username') {
      setUsername(currentUsername)
    }

    if (editingField === 'email') {
      setEmail(editableEmail)
      setEmailStatus('idle')
      setEmailMessage(t('profile.inline.changeEmailHint'))
    }

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
        throw new Error(data.error || t('profile.errors.updateFailed'))
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

    const trimmedUsername = trimmedProfileUsernameDraft
    const normalizedEmail = normalizedProfileEmailDraft
    const usernameChanged = profileUsernameChanged
    const emailChanged = profileEmailChanged

    if (!usernameChanged && !emailChanged) {
      showToast.error('profile.inline.makeChange')
      return
    }

    if (!trimmedUsername) {
      showToast.error('toast.usernameEmpty')
      return
    }

    if (trimmedUsername.length < 3) {
      showToast.error('toast.usernameTooShort')
      return
    }

    if (trimmedUsername.length > 20) {
      showToast.error('toast.usernameTooLong')
      return
    }

    if (usernameChanged && !usernameAvailable) {
      showToast.error('toast.usernameUnavailable')
      return
    }

    if (emailChanged) {
      if (emailStatus === 'taken') {
        showToast.error('profile.inline.emailTaken')
        return
      }

      if (emailStatus === 'invalid') {
        showToast.error('profile.inline.invalidEmail')
        return
      }

      if (emailStatus === 'checking') {
        showToast.error('profile.inline.checkingEmail')
        return
      }

      if (emailStatus === 'error') {
        showToast.error('profile.inline.checkFailed')
        return
      }

      if (emailStatus !== 'available') {
        showToast.error('profile.inline.invalidEmail')
        return
      }
    }

    setLoading(true)

    try {
      const payload: { username?: string; email?: string } = {}

      if (usernameChanged) {
        payload.username = trimmedUsername
      }

      if (emailChanged) {
        payload.email = normalizedEmail
      }

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t('profile.errors.updateFailed'))
      }

      if (data.user) {
        setProfileSummary(data.user)
      }

      const updatedUsername = data.user?.username || trimmedUsername
      setUsername(updatedUsername)
      setEmail(data.user?.pendingEmail || data.user?.email || normalizedEmail)

      if (usernameChanged) {
        await update({
          user: {
            name: updatedUsername,
            username: updatedUsername,
          },
        })
      }

      if (usernameChanged) {
        showToast.success('toast.profileUpdated')
      }

      if (emailChanged) {
        showToast.success('toast.verificationSent')
      }
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

        throw new Error(data.error || t('profile.errors.resendVerificationFailed'))
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
        throw new Error(data.error || t('profile.errors.requestDeletionFailed'))
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
    if (!confirm(t('profile.linkedAccounts.unlinkConfirm', { provider }))) {
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
        throw new Error(data.error || t('profile.errors.unlinkFailed'))
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

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    if (key === 'language') {
      const normalizedLanguage = setStoredAppearanceLocale(localStorage, String(value))
      setSettings((prev) => ({ ...prev, language: normalizedLanguage }))

      if (normalizeAppearanceLocale(i18n.language) !== normalizedLanguage) {
        void i18n.changeLanguage(normalizedLanguage)
      }

      return
    }
  }

  const persistNotificationPreferences = useCallback(
    async (
      nextPreferences: NotificationPreferences,
      previousPreferences: NotificationPreferences
    ) => {
      setNotificationsSaving(true)

      try {
        const prefsRes = await fetch('/api/user/notification-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextPreferences),
        })

        if (!prefsRes.ok) {
          throw new Error('Failed to save notification preferences')
        }
      } catch {
        setNotificationPreferences(previousPreferences)
        showToast.error('profile.settings.error')
      } finally {
        setNotificationsSaving(false)
      }
    },
    []
  )

  const updateNotificationPreference = (
    key: keyof NotificationPreferences,
    value: boolean
  ) => {
    if (notificationsSaving) {
      return
    }

    const previousPreferences = notificationPreferences
    const nextPreferences = { ...previousPreferences, [key]: value }

    if (
      value &&
      (key === 'gameInvites' ||
        key === 'turnReminders' ||
        key === 'friendRequests' ||
        key === 'friendAccepted')
    ) {
      nextPreferences.unsubscribedAll = false
    }

    setNotificationPreferences(nextPreferences)
    void persistNotificationPreferences(nextPreferences, previousPreferences)
  }

  const updateEmailNotificationsEnabled = (enabled: boolean) => {
    if (notificationsSaving) {
      return
    }

    const previousPreferences = notificationPreferences
    const nextPreferences = {
      ...previousPreferences,
      unsubscribedAll: !enabled,
    }

    setNotificationPreferences(nextPreferences)
    void persistNotificationPreferences(nextPreferences, previousPreferences)
  }

  const updateAccountPreference = useCallback(
    async (key: keyof AccountPreferences, value: AccountPreferences[keyof AccountPreferences]) => {
      if (accountPreferencesSaving) {
        return
      }

      const previousPreferences = accountPreferences
      const nextPreferences = {
        ...previousPreferences,
        [key]: value,
      }

      setAccountPreferences(nextPreferences)
      setAccountPreferencesSaving(true)

      try {
        const res = await fetch('/api/user/account-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextPreferences),
        })

        if (!res.ok) {
          throw new Error('Failed to save account preferences')
        }
      } catch {
        setAccountPreferences(previousPreferences)
        showToast.error('profile.settings.error')
      } finally {
        setAccountPreferencesSaving(false)
      }
    },
    [accountPreferences, accountPreferencesSaving]
  )

  const canPreviewPublicProfile = Boolean(profileSummary?.publicProfileId)
  const publicProfilePreviewAccessState =
    accountPreferences.profileVisibility === 'private'
      ? 'private'
      : accountPreferences.profileVisibility === 'friends'
        ? 'friends_only'
        : 'available'

  const handleBackNavigation = () => {
    navigateBackFromProfile(router)
  }

  const resetPublicProfilePreviewTransition = useCallback(() => {
    publicProfilePreviewTimerIdsRef.current.forEach((timerId) => {
      window.clearTimeout(timerId)
    })
    publicProfilePreviewTimerIdsRef.current = []
    setShowPublicProfilePreview(false)
    setPublicProfilePreviewTransitionPhase('idle')
  }, [])

  const schedulePublicProfilePreviewTimer = useCallback((callback: () => void, delayMs: number) => {
    if (delayMs <= 0) {
      callback()
      return
    }

    const timerId = window.setTimeout(() => {
      publicProfilePreviewTimerIdsRef.current = publicProfilePreviewTimerIdsRef.current.filter(
        (currentTimerId) => currentTimerId !== timerId
      )
      callback()
    }, delayMs)

    publicProfilePreviewTimerIdsRef.current.push(timerId)
  }, [])

  const openPublicProfilePreview = useCallback(() => {
    if (
      !canPreviewPublicProfile ||
      showPublicProfilePreview ||
      publicProfilePreviewTransitionPhase !== 'idle'
    ) {
      return
    }

    const { exitMs, enterMs } = getProfilePreviewTransitionTimings()

    setPublicProfilePreviewTransitionPhase('hero-exit')
    schedulePublicProfilePreviewTimer(() => {
      setShowPublicProfilePreview(true)
      setPublicProfilePreviewTransitionPhase(enterMs > 0 ? 'preview-enter' : 'idle')

      if (enterMs > 0) {
        schedulePublicProfilePreviewTimer(() => {
          setPublicProfilePreviewTransitionPhase('idle')
        }, enterMs)
      }
    }, exitMs)
  }, [
    canPreviewPublicProfile,
    publicProfilePreviewTransitionPhase,
    schedulePublicProfilePreviewTimer,
    showPublicProfilePreview,
  ])

  const closePublicProfilePreview = useCallback(() => {
    if (!showPublicProfilePreview || publicProfilePreviewTransitionPhase !== 'idle') {
      return
    }

    const { exitMs, enterMs } = getProfilePreviewTransitionTimings()

    setPublicProfilePreviewTransitionPhase('preview-exit')
    schedulePublicProfilePreviewTimer(() => {
      setShowPublicProfilePreview(false)
      setPublicProfilePreviewTransitionPhase(enterMs > 0 ? 'hero-enter' : 'idle')

      if (enterMs > 0) {
        schedulePublicProfilePreviewTimer(() => {
          setPublicProfilePreviewTransitionPhase('idle')
        }, enterMs)
      }
    }, exitMs)
  }, [
    publicProfilePreviewTransitionPhase,
    schedulePublicProfilePreviewTimer,
    showPublicProfilePreview,
  ])
  const heroPreviewTransitionClassName =
    publicProfilePreviewTransitionPhase === 'hero-exit'
      ? 'animate-profile-surface-exit'
      : publicProfilePreviewTransitionPhase === 'hero-enter'
        ? 'animate-profile-surface-enter'
        : ''
  const publicProfilePreviewTransitionClassName =
    publicProfilePreviewTransitionPhase === 'preview-enter'
      ? 'animate-profile-preview-enter'
      : publicProfilePreviewTransitionPhase === 'preview-exit'
        ? 'animate-profile-surface-exit'
        : ''
  const isPublicProfilePreviewTransitioning = publicProfilePreviewTransitionPhase !== 'idle'

  useEffect(() => {
    return () => {
      publicProfilePreviewTimerIdsRef.current.forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      publicProfilePreviewTimerIdsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!canPreviewPublicProfile && showPublicProfilePreview) {
      resetPublicProfilePreviewTransition()
    }
  }, [canPreviewPublicProfile, resetPublicProfilePreviewTransition, showPublicProfilePreview])

  const handleTabChange = (tab: TabType) => {
    if (tab !== 'profile') {
      resetPublicProfilePreviewTransition()
    }

    setActiveTab(tab)
  }

  const updateActiveTabIndicator = useCallback(() => {
    const tabListElement = tabListRef.current
    const activeTabButton = tabButtonRefs.current[activeTab]

    if (!tabListElement || !activeTabButton) {
      setActiveTabIndicatorStyle((currentStyle) =>
        currentStyle.opacity === 0
          ? currentStyle
          : {
              left: 0,
              width: 0,
              opacity: 0,
            }
      )
      return
    }

    const tabListRect = tabListElement.getBoundingClientRect()
    const activeTabRect = activeTabButton.getBoundingClientRect()

    setActiveTabIndicatorStyle({
      left: activeTabRect.left - tabListRect.left + PROFILE_TAB_INDICATOR_X_INSET_PX,
      width: Math.max(activeTabRect.width - PROFILE_TAB_INDICATOR_X_INSET_PX * 2, 0),
      opacity: 1,
    })
  }, [activeTab])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      updateActiveTabIndicator()
    })

    const handleResize = () => {
      updateActiveTabIndicator()
    }

    window.addEventListener('resize', handleResize)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver === 'function' && tabListRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateActiveTabIndicator()
      })
      resizeObserver.observe(tabListRef.current)
    }

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
    }
  }, [updateActiveTabIndicator])

  const tabItems: Array<{ id: TabType; icon: string; label: string }> = [
    { id: 'profile', icon: '👤', label: t('profile.title') },
    { id: 'friends', icon: '👥', label: t('profile.friends.title') },
    { id: 'history', icon: '🎮', label: t('profile.gameHistory.title') },
    { id: 'stats', icon: '📊', label: t('profile.stats.title') },
    { id: 'settings', icon: '⚙️', label: t('profile.settings.title') },
  ]

  const achievementItems = [
    {
      id: 'first-game',
      label: t('profile.achievements.firstFinish'),
      mark: '1',
      className: 'bg-bd-coral text-white',
      earned: completedGamesCount > 0,
    },
    {
      id: 'social',
      label: t('profile.achievements.firstFriend'),
      mark: String(Math.min(profileSummary?.friendsCount ?? 0, 9)),
      className: 'bg-bd-mint text-bd-ink',
      earned: (profileSummary?.friendsCount ?? 0) > 0,
    },
    {
      id: 'first-win',
      label: t('profile.achievements.firstWin'),
      mark: String(Math.min(winsCount, 9)),
      className: 'bg-bd-lav text-white',
      earned: winsCount > 0,
    },
    {
      id: 'verified',
      label: t('profile.achievements.verified'),
      mark: 'V',
      className: 'bg-bd-sun text-bd-ink',
      earned: effectiveEmailVerified,
    },
  ]

  const inlineEditorMessageClassName =
    editingStatus === 'available'
      ? 'text-emerald-600 dark:text-emerald-400'
      : editingStatus === 'taken' || editingStatus === 'invalid' || editingStatus === 'error'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-500 dark:text-slate-400'

  const inlineEditorHasChanges = editingField
    ? editingField === 'username'
      ? editingValue.trim() !== currentUsername
      : editingValue.trim().toLowerCase() !== (pendingEmail || currentEmail).toLowerCase()
    : false

  const inlineEditorCanSubmit =
    inlineEditorHasChanges &&
    editingStatus === 'available' &&
    !submittingInlineEdit

  const trimmedProfileUsernameDraft = username.trim()
  const normalizedProfileEmailDraft = email.trim().toLowerCase()
  const profileUsernameChanged = trimmedProfileUsernameDraft !== currentUsername
  const profileEmailChanged = normalizedProfileEmailDraft !== editableEmail.toLowerCase()
  const profileFormHasChanges = profileUsernameChanged || profileEmailChanged
  const profileFormCanSubmit =
    profileFormHasChanges &&
    !loading &&
    (!profileUsernameChanged || usernameAvailable) &&
    (!profileEmailChanged || emailStatus === 'available')

  const renderHeroEditableField = ({
    field,
    value,
    title,
    displayClassName,
    inputClassName,
  }: {
    field: InlineEditorField
    value: string
    title: string
    displayClassName: string
    inputClassName: string
  }) => {
    const isEditing = editingField === field
    const displayValue = value || t('profile.inline.noValue')

    return (
      <div>
        <div className="relative">
          <button
            type="button"
            onDoubleClick={() => beginInlineEdit(field)}
            className={`block w-full rounded-lg bg-transparent p-0 text-left transition-all duration-200 ease-out focus:outline-none ${
              isEditing
                ? 'pointer-events-none absolute inset-0 -translate-y-1 opacity-0'
                : 'relative translate-y-0 opacity-100'
            } ${displayClassName}`}
            title={title}
          >
            <span className="block truncate">{displayValue}</span>
          </button>

          <div
            className={`flex items-center gap-2 transition-all duration-200 ease-out ${
              isEditing
                ? 'relative translate-y-0 opacity-100'
                : 'pointer-events-none absolute inset-0 translate-y-1 opacity-0'
            }`}
            aria-hidden={!isEditing}
          >
            <input
              type={field === 'email' ? 'email' : 'text'}
              value={isEditing ? editingValue : value}
              onChange={(event) => {
                if (field === 'username') {
                  updateUsernameDraft(event.target.value)
                  return
                }

                updateEmailDraft(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  cancelInlineEdit()
                }
                if (event.key === 'Enter' && inlineEditorCanSubmit) {
                  void handleInlineEditSubmit()
                }
              }}
              aria-label={field === 'email' ? 'inline-email-input' : 'inline-username-input'}
              tabIndex={isEditing ? 0 : -1}
              className={`min-w-0 flex-1 border-0 border-b-2 bg-transparent px-0 pb-1 shadow-none outline-none transition-all duration-200 focus:ring-0 ${
                editingStatus === 'available'
                  ? 'border-emerald-400'
                  : editingStatus === 'taken' || editingStatus === 'invalid' || editingStatus === 'error'
                    ? 'border-red-400'
                    : 'border-blue-400/70 dark:border-blue-400/60'
              } ${inputClassName}`}
              autoFocus
            />

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void handleInlineEditSubmit()}
                disabled={!inlineEditorCanSubmit}
                tabIndex={isEditing ? 0 : -1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
                aria-label={t('profile.inline.confirm')}
              >
                ✓
              </button>
              <button
                type="button"
                onClick={cancelInlineEdit}
                tabIndex={isEditing ? 0 : -1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/70 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300/80 dark:bg-slate-700/70 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label={t('profile.inline.cancel')}
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div
          className={`overflow-hidden transition-all duration-200 ease-out ${
            isEditing ? 'mt-1 max-h-10 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <p className={`text-xs font-medium ${inlineEditorMessageClassName}`}>
            {editingMessage}
          </p>
        </div>
      </div>
    )
  }

  const handleResetProfileDrafts = () => {
    setUsername(currentUsername)
    setEmail(editableEmail)
    setEmailStatus('idle')
    setEmailMessage(t('profile.inline.changeEmailHint'))
    setEditingField(null)
    setEditingValue('')
    setEditingStatus('idle')
    setEditingMessage('')
  }

  const settingsSectionClassName =
    'rounded-[1.75rem] border-[1.5px] border-bd-line bg-white p-5 shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700/60 dark:bg-slate-900/80 sm:p-6'
  const settingsSurfaceClassName =
    'rounded-[1.5rem] border border-bd-line bg-bd-card-warm/90 p-4 dark:border-slate-700/60 dark:bg-slate-800/70'
  const settingsToggleCardClassName =
    'flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-bd-line bg-white/90 p-4 transition-colors hover:bg-bd-card-warm dark:border-slate-700/60 dark:bg-slate-900/70 dark:hover:bg-slate-800'
  const settingsScopeBadgeClassName =
    'inline-flex w-fit rounded-full bg-bd-bg2 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-bd-ink-muted dark:bg-slate-800 dark:text-slate-300'
  const actionPrimaryButtonClassName =
    'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[#7867E8] bg-bd-lav px-5 py-3 text-sm font-bold text-white shadow-[0_4px_0_#7867E8] transition-all hover:-translate-y-0.5 hover:bg-[#8b7dff] hover:shadow-[0_6px_0_#7867E8] disabled:cursor-not-allowed disabled:opacity-60'
  const actionSecondaryButtonClassName =
    'inline-flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-bd-line bg-white px-5 py-3 text-sm font-semibold text-bd-ink shadow-[0_3px_0_#E8DDC8] transition-all hover:-translate-y-0.5 hover:bg-bd-card-warm dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-800'
  const actionDangerButtonClassName =
    'inline-flex items-center justify-center gap-2 rounded-2xl border border-[#F0B3AC] bg-white px-4 py-2.5 text-sm font-semibold text-bd-coral-deep transition-colors hover:bg-[#FFF2EF] dark:border-red-500/30 dark:bg-slate-900/75 dark:text-red-300 dark:hover:bg-red-500/10'
  const profileSurfaceClassName =
    'rounded-[1.5rem] border border-bd-line bg-bd-card-warm/90 p-5 dark:border-slate-700/60 dark:bg-slate-800/70'
  const fieldInputClassName =
    'w-full rounded-2xl border bg-white px-4 py-3 text-sm text-bd-ink shadow-sm outline-none transition-all dark:bg-slate-900 dark:text-white'
  const settingsSyncBadgeClassName =
    'inline-flex w-fit rounded-full bg-bd-lav/15 px-2.5 py-1 text-xs font-semibold text-bd-lav-deep dark:bg-bd-lav/15 dark:text-bd-lav'

  if (status === 'loading') {
    return (
      <div className="page-shell flex items-center justify-center bg-bd-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-bd-bg2 border-t-bd-lav dark:border-slate-700 dark:border-t-bd-lav" />
          <p className="text-sm font-medium text-bd-ink-muted dark:text-slate-400">{t('profile.loading')}</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="page-shell bg-bd-bg text-bd-ink">
      <div className="relative flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,196,77,0.18),transparent_35%),radial-gradient(circle_at_88%_14%,rgba(155,140,255,0.16),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(79,201,166,0.14),transparent_50%)]">
        <div className="pointer-events-none absolute right-[-4rem] top-24 h-44 w-44 rounded-full bg-bd-lav/10" />
        <div className="pointer-events-none absolute left-[-3rem] top-[34rem] h-36 w-36 rotate-12 rounded-[2rem] bg-bd-mint/10" />
      <div className="relative max-w-7xl mx-auto px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 pb-10">
        <div className="relative">
          {showPublicProfilePreview && profileSummary?.publicProfileId ? (
            <div
              className={`${publicProfilePreviewTransitionClassName} ${
                isPublicProfilePreviewTransitioning ? 'pointer-events-none' : ''
              }`}
            >
              <PublicProfileView
                profile={{
                  publicProfileId: profileSummary.publicProfileId,
                  username: profileSummary.username,
                  image: profileSummary.image,
                  createdAt: profileSummary.createdAt,
                  friendsCount: profileSummary.friendsCount,
                  gamesPlayed: profileSummary.gamesPlayed,
                  completedGamesCount: profileSummary.achievementStats?.completedGamesCount,
                }}
                initialRelation="login_required"
                accessState={publicProfilePreviewAccessState}
                mode="embedded-preview"
                onBack={closePublicProfilePreview}
              />
            </div>
          ) : (
            <div className={heroPreviewTransitionClassName}>
              <div className="relative overflow-hidden rounded-[2rem] border-[1.5px] border-bd-line bg-white shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] dark:border-slate-700/60 dark:bg-slate-900/80">
                <div className="dot-grid absolute inset-0 opacity-40" />
                <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-bd-lav/20" />
                <div className="absolute -bottom-16 left-10 h-32 w-32 rounded-[2rem] rotate-12 bg-bd-sun/20" />

                <div className="relative p-5 sm:p-8 lg:p-9">
                  <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-6 sm:flex-row sm:items-center">
                      <div className="relative mx-auto shrink-0 sm:mx-0">
                        <UserAvatar
                          image={profileSummary?.avatarUrl || profileSummary?.image || session?.user?.image || null}
                          userName={currentUsername || displayName}
                          userEmail={currentEmail}
                          className="h-28 w-28 border-4 border-white bg-bd-lav text-white shadow-[0_0_0_3px_#1F1B16] sm:h-32 sm:w-32"
                          textClassName="font-display text-5xl font-bold"
                        />
                        <div className="absolute -bottom-2 -right-4 rotate-[8deg] rounded-full border-2 border-bd-ink bg-bd-mint px-3 py-1 font-display text-xs font-bold text-bd-ink shadow-[2px_2px_0_#1F1B16]">
                          Lv. {Math.max(
                            1,
                            Math.floor(
                              (profileSummary?.achievementStats?.completedGamesCount ??
                                profileSummary?.gamesPlayed ??
                                0) / 10
                            ) + 1
                          )}
                        </div>
                      </div>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={handleBackNavigation}
                        className="group inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold text-bd-ink-soft transition-all hover:bg-bd-bg2 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">
                          ←
                        </span>
                        <span>{t('common.back')}</span>
                      </button>
                      <h1 className="sr-only">{t('profile.title')}</h1>

                      <div className="mt-5 space-y-2 text-center sm:text-left">
                        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-bd-ink-muted">
                          @{(currentUsername || displayName).replace(/\s+/g, '').toLowerCase()}
                        </div>
                        {renderHeroEditableField({
                          field: 'username',
                          value: username,
                          title: t('profile.inline.editUsername'),
                          displayClassName:
                            'font-display text-4xl font-bold leading-none text-bd-ink hover:text-bd-coral-deep dark:text-white dark:hover:text-bd-sun sm:text-5xl',
                          inputClassName:
                            'font-display text-4xl font-bold leading-none text-bd-ink placeholder:text-bd-ink-muted dark:text-white dark:placeholder:text-slate-500 sm:text-5xl',
                        })}

                        {renderHeroEditableField({
                          field: 'email',
                          value: email,
                          title: t('profile.inline.editEmail'),
                          displayClassName:
                            'text-sm font-medium text-bd-ink-muted hover:text-bd-coral-deep dark:text-slate-400 dark:hover:text-bd-sun sm:text-base',
                          inputClassName:
                            'text-sm font-medium text-bd-ink-soft placeholder:text-bd-ink-muted dark:text-slate-300 dark:placeholder:text-slate-500 sm:text-base',
                        })}

                        <div className="flex flex-wrap justify-center gap-2 pt-2 sm:justify-start">
                          <span className="inline-flex items-center rounded-full bg-bd-mint/20 px-3 py-1.5 text-xs font-bold text-bd-mint-deep">
                            {t('profile.chips.games', { count: profileSummary?.gamesPlayed ?? 0 })}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-bd-sun/25 px-3 py-1.5 text-xs font-bold text-[#9b6b00]">
                            {t('profile.chips.friends', { count: profileSummary?.friendsCount ?? 0 })}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-bd-coral/15 px-3 py-1.5 text-xs font-bold text-bd-coral-deep">
                            {effectiveEmailVerified ? t('profile.verified') : t('profile.verificationBanner.title')}
                          </span>
                        </div>

                        {pendingEmail && (
                          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/5 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                            <span className="min-w-0 break-all">
                              {t('profile.inline.pendingEmailNotice', { email: pendingEmail })}
                            </span>
                            <button
                              type="button"
                              onClick={handleResendVerification}
                              disabled={showResendVerification}
                              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-amber-600 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {showResendVerification
                                ? t('common.loading')
                                : t('profile.inline.resendVerification')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    </div>

                    <div className="shrink-0 lg:w-[220px]">
                      <div className="flex h-full flex-col justify-center gap-3 rounded-3xl border border-bd-line bg-bd-card-warm/85 p-5 text-center dark:border-slate-700 dark:bg-slate-800/70">
                        {canPreviewPublicProfile && (
                          <button
                            type="button"
                            onClick={openPublicProfilePreview}
                            disabled={isPublicProfilePreviewTransitioning}
                            className="group inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[#7867E8] bg-bd-lav px-4 py-3 text-sm font-bold text-white shadow-[0_4px_0_#7867E8] transition-all hover:-translate-y-0.5 hover:bg-[#8b7dff] hover:shadow-[0_6px_0_#7867E8] disabled:cursor-not-allowed disabled:opacity-70 dark:border-[#8b7dff] dark:bg-bd-lav dark:text-white"
                          >
                            <span>{t('profile.publicProfile.viewOwn')}</span>
                            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                              →
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {summaryCards.map((card) => (
                      <div
                        key={card.id}
                        className="group relative overflow-hidden rounded-3xl border-[1.5px] border-bd-line bg-white p-5 shadow-[0_4px_14px_rgba(31,27,22,0.07)] transition-all hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className={`absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-20 ${card.accent.split(' ')[0]}`} />
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400">
                          {card.label}
                        </p>
                        <p className={`mt-2 font-display text-3xl font-bold leading-none dark:text-white ${card.accent.split(' ')[1]}`}>
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 w-full">
                    <div className="rounded-3xl border-[1.5px] border-bd-line bg-white p-5 shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-display text-2xl font-bold text-bd-ink dark:text-white">
                          {t('profile.achievements.title')}
                        </h2>
                        <span className="rounded-full bg-bd-bg2 px-3 py-1 text-xs font-bold text-bd-ink-soft dark:bg-slate-700 dark:text-slate-200">
                          {achievementItems.filter((item) => item.earned).length} / {achievementItems.length}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
                        {achievementItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex min-h-28 flex-col rounded-2xl border-[1.5px] p-3 transition-opacity ${
                              item.earned
                                ? 'border-bd-line bg-bd-card-warm opacity-100 dark:border-slate-700 dark:bg-slate-900/70'
                                : 'border-bd-line/70 bg-transparent opacity-50 dark:border-slate-700'
                            }`}
                          >
                            <div className={`grid h-10 w-10 place-items-center rounded-xl border-2 border-bd-ink font-display text-lg font-bold shadow-[2px_2px_0_#1F1B16] ${item.earned ? item.className : 'bg-bd-bg2 text-bd-ink-muted'}`}>
                              {item.earned ? item.mark : '?'}
                            </div>
                            <p className="mt-auto pt-3 text-sm font-bold leading-tight text-bd-ink dark:text-slate-100">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab Navigation ── */}
          <div className="mt-6">
            <nav
              ref={tabListRef}
              role="tablist"
              aria-label={t('profile.title')}
              className="relative flex gap-1 rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm p-1.5 shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700 dark:bg-slate-900/70"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 bottom-1.5 top-1.5 rounded-xl bg-bd-lav shadow-[0_3px_0_#7867E8] transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: activeTabIndicatorStyle.width
                    ? `${activeTabIndicatorStyle.width}px`
                    : undefined,
                  transform: `translateX(${activeTabIndicatorStyle.left}px)`,
                  opacity: activeTabIndicatorStyle.opacity,
                }}
              />
              {tabItems.map((tab) => (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabButtonRefs.current[tab.id] = node
                  }}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`profile-tab-panel-${tab.id}`}
                  id={`profile-tab-${tab.id}`}
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative z-10 flex-1 min-w-0 rounded-xl px-2 py-2.5 text-center text-sm font-semibold transition-colors duration-300 ${
                    activeTab === tab.id
                      ? 'text-white'
                      : 'text-bd-ink-soft hover:bg-white/70 hover:text-bd-ink dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="text-base sm:hidden">{tab.icon}</span>
                  <span className="hidden items-center justify-center gap-1.5 sm:inline-flex">
                    <span aria-hidden className="text-sm">{tab.icon}</span>
                    <span className="truncate text-xs lg:text-sm">{tab.label}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {/* ── Tab Content ── */}
          <div className="mt-6 rounded-[2rem] border-[1.5px] border-bd-line bg-white p-5 shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] dark:border-slate-700/60 dark:bg-slate-900/80 sm:p-8">

          {activeTab === 'profile' && (
            <div role="tabpanel" id="profile-tab-panel-profile" aria-labelledby="profile-tab-profile">

              {/* Email Verification Banner */}
              {currentEmail && !effectiveEmailVerified && !linkedAccounts.google && !linkedAccounts.github && !linkedAccounts.discord && (
                <div className="mb-6 overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-orange-500/5">
                  <div className="border-l-4 border-amber-400 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm sm:text-base">
                          {t('profile.verificationBanner.title')}
                        </h3>
                        <p className="mt-1 text-xs sm:text-sm text-amber-700 dark:text-amber-300/80">
                          {t('profile.verificationBanner.description')}
                        </p>
                        <button
                          type="button"
                          onClick={handleResendVerification}
                          disabled={showResendVerification}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-amber-600 hover:shadow disabled:opacity-50 sm:text-sm"
                        >
                          {showResendVerification ? t('profile.sending') : t('profile.verificationBanner.resend')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Avatar picker */}
                <div className={profileSurfaceClassName}>
                  <div className="mb-5">
                    <h3 className="text-lg font-bold text-bd-ink dark:text-white">Avatar</h3>
                  </div>
                  <AvatarPicker
                    currentAvatarUrl={profileSummary?.avatarUrl ?? null}
                    currentImage={profileSummary?.image ?? null}
                    username={profileSummary?.username ?? null}
                    email={profileSummary?.email ?? null}
                    onSaved={(avatarUrl) =>
                      setProfileSummary((prev) => prev ? { ...prev, avatarUrl } : prev)
                    }
                  />
                </div>

                <form onSubmit={handleUpdateProfile} className={profileSurfaceClassName}>
                  <div className="mb-5">
                    <h3 className="text-lg font-bold text-bd-ink dark:text-white">Profile details</h3>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-bd-ink dark:text-slate-200">
                        {t('profile.email')}
                        {effectiveEmailVerified && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-bd-mint/20 px-2.5 py-1 text-xs font-bold text-bd-mint-deep dark:bg-bd-mint/15 dark:text-bd-mint">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                            {t('profile.verified')}
                          </span>
                        )}
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => updateEmailDraft(event.target.value)}
                        aria-label="profile-email-input"
                        className={`${fieldInputClassName} ${
                          emailStatus === 'available'
                            ? 'border-emerald-400 focus:ring-emerald-100 dark:border-emerald-500 dark:focus:ring-emerald-500/20'
                            : emailStatus === 'taken' || emailStatus === 'invalid' || emailStatus === 'error'
                              ? 'border-red-400 focus:ring-red-100 dark:border-red-500 dark:focus:ring-red-500/20'
                              : 'border-bd-line focus:border-[#7867E8] focus:ring-[#9B8CFF]/20 dark:border-slate-700'
                        }`}
                        autoComplete="email"
                      />
                      <div className="mt-1.5 space-y-1 text-xs">
                        <p
                          className={`font-medium ${
                            emailStatus === 'available'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : emailStatus === 'taken' || emailStatus === 'invalid' || emailStatus === 'error'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-bd-ink-muted dark:text-slate-400'
                          }`}
                        >
                          {emailMessage}
                        </p>
                        {pendingEmail && (
                          <p className="text-bd-ink-muted dark:text-slate-400">
                            {t('profile.inline.pendingEmailHelp', { email: pendingEmail })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <UsernameInput
                        value={username}
                        onChange={updateUsernameDraft}
                        onAvailabilityChange={setUsernameAvailable}
                        currentUsername={currentUsername || undefined}
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="submit"
                        disabled={!profileFormCanSubmit}
                        className={`${actionPrimaryButtonClassName} flex-1`}
                      >
                        {loading ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            {t('profile.saving')}
                          </>
                        ) : (
                          t('profile.edit.save')
                        )}
                      </button>
                      {profileFormHasChanges && (
                        <button
                          type="button"
                          onClick={handleResetProfileDrafts}
                          className={actionSecondaryButtonClassName}
                        >
                          {t('profile.edit.cancel')}
                        </button>
                      )}
                    </div>
                  </div>
                </form>

                <div className={profileSurfaceClassName}>
                  <div className="mb-5">
                    <h3 className="text-lg font-bold text-bd-ink dark:text-white">{t('profile.linkedAccounts.title')}</h3>
                    <p className="mt-1 text-sm text-bd-ink-muted dark:text-slate-400">
                      {t('profile.linkedAccounts.subtitle')}
                    </p>
                  </div>

                  {loadingLinkedAccounts ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-bd-bg2 border-t-bd-lav dark:border-slate-700 dark:border-t-bd-lav" />
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {([
                        {
                          id: 'google' as const,
                          name: 'Google',
                          iconWrapperClassName: 'bg-[#E9F3FF] dark:bg-blue-500/15',
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4"/>
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853"/>
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62Z" fill="#FBBC05"/>
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335"/>
                            </svg>
                          ),
                        },
                        {
                          id: 'github' as const,
                          name: 'GitHub',
                          iconWrapperClassName: 'bg-bd-bg2 dark:bg-slate-800',
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current text-bd-ink dark:text-white">
                              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                            </svg>
                          ),
                        },
                        {
                          id: 'discord' as const,
                          name: 'Discord',
                          iconWrapperClassName: 'bg-[#EEF0FF] dark:bg-indigo-500/15',
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current text-[#5865F2]">
                              <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286ZM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189Zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                            </svg>
                          ),
                        },
                      ] as const).map((provider) => {
                        const isConnected = Boolean(linkedAccounts[provider.id])

                        return (
                          <div
                            key={provider.id}
                            className={`rounded-2xl border p-4 ${
                              isConnected
                                ? 'border-bd-mint/40 bg-bd-mint/10 dark:border-bd-mint/30 dark:bg-bd-mint/10'
                                : 'border-bd-line bg-white/90 dark:border-slate-700 dark:bg-slate-900/70'
                            }`}
                          >
                            <div className="flex flex-col items-center gap-3 text-center">
                              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${provider.iconWrapperClassName}`}>
                                {provider.icon}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-bd-ink dark:text-white">{provider.name}</p>
                                {isConnected && (
                                  <p className="text-xs font-medium text-bd-mint-deep dark:text-bd-mint">
                                    {t('profile.linkedAccounts.connected')}
                                  </p>
                                )}
                              </div>
                              {isConnected ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkAccount(provider.id)}
                                  className={`${actionDangerButtonClassName} w-full px-3 py-2 text-xs`}
                                >
                                  {t('profile.linkedAccounts.unlink')}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => router.push(`/auth/link?provider=${provider.id}`)}
                                  className={`${actionPrimaryButtonClassName} w-full px-3 py-2 text-xs`}
                                >
                                  {t('profile.linkedAccounts.connect')}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-[1.5rem] border border-[#F0B3AC] bg-[#FFF2EF] p-5 dark:border-red-500/20 dark:bg-red-500/10">
                  <h3 className="text-base font-bold text-bd-coral-deep dark:text-red-300">
                    {t('profile.dangerZone.title')}
                  </h3>
                  <p className="mt-1 text-sm text-[#A6554A] dark:text-red-200/70">
                    {t('profile.dangerZone.description')}
                  </p>
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className={`${actionDangerButtonClassName} mt-4`}
                    >
                      {t('profile.dangerZone.deleteAccount')}
                    </button>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-[#F0B3AC] bg-white p-4 dark:border-red-500/20 dark:bg-slate-900/70">
                      <p className="text-sm font-semibold text-bd-coral-deep dark:text-red-300">
                        {t('profile.dangerZone.confirmTitle')}
                      </p>
                      <p className="mt-2 break-all text-sm text-[#A6554A] dark:text-red-200/70">
                        {t('profile.dangerZone.confirmDescription', {
                          email: session?.user?.email || currentEmail,
                        })}
                      </p>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={handleRequestAccountDeletion}
                          disabled={deleteLoading}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-bd-coral px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bd-coral-deep disabled:opacity-50"
                        >
                          {deleteLoading ? (
                            <>
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                              {t('profile.sending')}
                            </>
                          ) : t('profile.dangerZone.sendDeletionEmail')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          className={actionSecondaryButtonClassName}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
                <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
                  {t('profile.stats.dashboard.errors.unavailable')}
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
              className="space-y-5"
            >
              <div className="max-w-2xl">
                <h2 className="font-display text-3xl font-bold text-bd-ink dark:text-white">{t('profile.settings.title')}</h2>
                <p className="mt-1 text-sm text-bd-ink-muted dark:text-slate-400">
                  {t('profile.settings.subtitle')}
                </p>
              </div>

              <div className="grid gap-5 xl:grid-cols-12">
                <section className={`xl:col-span-12 ${settingsSectionClassName}`}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-bd-ink dark:text-white">
                          {t('profile.settings.sections.appearance.title')}
                        </h3>
                        <span className={settingsScopeBadgeClassName}>
                          {t('profile.settings.scope.device')}
                        </span>
                      </div>
                      <p className="text-sm text-bd-ink-muted dark:text-slate-400">
                        {t('profile.settings.sections.appearance.subtitle')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                    <div className={settingsSurfaceClassName}>
                      <label className="mb-2 block text-sm font-semibold text-bd-ink dark:text-white">
                        {t('profile.settings.language.title')}
                      </label>
                      <p className="mb-3 text-sm text-bd-ink-muted dark:text-slate-400">
                        {t('profile.settings.language.subtitle')}
                      </p>
                      <BoardlySelect
                        value={settings.language}
                        onChange={(nextLanguage) => updateSetting('language', nextLanguage)}
                        ariaLabel={t('profile.settings.language.title')}
                        options={SETTINGS_LANGUAGE_OPTIONS}
                        renderValue={(option) => (
                          <span className="flex items-center gap-3">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bd-bg2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-bd-lav-deep dark:bg-slate-800 dark:text-bd-lav">
                              {option?.badge ?? '--'}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-bd-ink dark:text-white">
                                {option?.label ?? ''}
                              </span>
                            </span>
                          </span>
                        )}
                      />
                    </div>

                  </div>
                </section>

                <section className={`xl:col-span-12 ${settingsSectionClassName}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-bd-ink dark:text-white">
                        {t('profile.settings.notifications.title')}
                      </h3>
                      <span className={settingsScopeBadgeClassName}>
                        {t('profile.settings.scope.account')}
                      </span>
                    </div>
                    {notificationsSaving && (
                      <span className={settingsSyncBadgeClassName}>
                        {t('profile.settings.syncing')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-bd-ink-muted dark:text-slate-400">
                    {t('profile.settings.notifications.subtitle')}
                  </p>

                  <div className="mt-5 space-y-4">
                    <div className="grid gap-3 xl:grid-cols-3">
                      <Label className={settingsToggleCardClassName}>
                        <div className="min-w-0 pr-3">
                          <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                            {t('profile.settings.notifications.email')}
                          </div>
                          <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                            {t('profile.settings.notifications.emailDesc')}
                          </div>
                        </div>
                        <Checkbox
                          checked={emailNotificationsEnabled}
                          onCheckedChange={(checked) => updateEmailNotificationsEnabled(Boolean(checked))}
                          disabled={notificationsSaving}
                          className="mt-0.5 shrink-0"
                        />
                      </Label>

                      <Label className={settingsToggleCardClassName}>
                        <div className="min-w-0 pr-3">
                          <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                            {t('profile.settings.notifications.inApp')}
                          </div>
                          <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                            {t('profile.settings.notifications.inAppDesc')}
                          </div>
                        </div>
                        <Checkbox
                          checked={notificationPreferences.inAppNotifications}
                          onCheckedChange={(checked) => updateNotificationPreference('inAppNotifications', Boolean(checked))}
                          disabled={notificationsSaving}
                          className="mt-0.5 shrink-0"
                        />
                      </Label>

                      <div
                        className={`${settingsToggleCardClassName} cursor-default items-center justify-center text-center opacity-80`}
                      >
                        <div className="min-w-0 text-center">
                          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-bd-ink dark:text-slate-200">
                            <span>{t('profile.settings.notifications.push')}</span>
                            <span className="inline-flex rounded-full bg-bd-bg2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-bd-ink-muted dark:bg-slate-700 dark:text-slate-300">
                              {t('profile.comingSoon')}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                            {t('profile.settings.notifications.pushSoon')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`rounded-[1.5rem] border border-bd-line bg-bd-card-warm/75 p-4 transition-opacity dark:border-slate-700/60 dark:bg-slate-800/50 ${
                        emailNotificationsEnabled ? 'opacity-100' : 'opacity-65'
                      }`}
                    >
                      <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400">
                        {t('profile.settings.notifications.categories.title')}
                      </p>
                      {emailNotificationsEnabled ? (
                        <div className="overflow-hidden rounded-2xl border border-bd-line bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/55">
                          <Label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-bd-card-warm dark:hover:bg-slate-800/70">
                            <Checkbox
                              checked={notificationPreferences.gameInvites}
                              onCheckedChange={(checked) => updateNotificationPreference('gameInvites', Boolean(checked))}
                              disabled={notificationsSaving}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                                {t('profile.settings.notifications.categories.gameInvites')}
                              </div>
                              <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                                {t('profile.settings.notifications.categories.gameInvitesDesc')}
                              </div>
                            </div>
                          </Label>

                          <Label className="flex cursor-pointer items-start gap-3 border-t border-bd-line px-4 py-3 transition-colors hover:bg-bd-card-warm dark:border-slate-700/60 dark:hover:bg-slate-800/70">
                            <Checkbox
                              checked={notificationPreferences.turnReminders}
                              onCheckedChange={(checked) => updateNotificationPreference('turnReminders', Boolean(checked))}
                              disabled={notificationsSaving}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                                {t('profile.settings.notifications.categories.turnReminders')}
                              </div>
                              <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                                {t('profile.settings.notifications.categories.turnRemindersDesc')}
                              </div>
                            </div>
                          </Label>

                          <Label className="flex cursor-pointer items-start gap-3 border-t border-bd-line px-4 py-3 transition-colors hover:bg-bd-card-warm dark:border-slate-700/60 dark:hover:bg-slate-800/70">
                            <Checkbox
                              checked={notificationPreferences.friendRequests}
                              onCheckedChange={(checked) => updateNotificationPreference('friendRequests', Boolean(checked))}
                              disabled={notificationsSaving}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                                {t('profile.settings.notifications.categories.friendRequests')}
                              </div>
                              <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                                {t('profile.settings.notifications.categories.friendRequestsDesc')}
                              </div>
                            </div>
                          </Label>

                          <Label className="flex cursor-pointer items-start gap-3 border-t border-bd-line px-4 py-3 transition-colors hover:bg-bd-card-warm dark:border-slate-700/60 dark:hover:bg-slate-800/70">
                            <Checkbox
                              checked={notificationPreferences.friendAccepted}
                              onCheckedChange={(checked) => updateNotificationPreference('friendAccepted', Boolean(checked))}
                              disabled={notificationsSaving}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                                {t('profile.settings.notifications.categories.friendAccepted')}
                              </div>
                              <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                                {t('profile.settings.notifications.categories.friendAcceptedDesc')}
                              </div>
                            </div>
                          </Label>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-bd-line bg-white/70 px-4 py-3 text-sm text-bd-ink-muted dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                          {t('profile.settings.notifications.categories.disabledHint')}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className={`xl:col-span-12 ${settingsSectionClassName}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-bd-ink dark:text-white">
                        {t('profile.settings.privacy.title')}
                      </h3>
                      <span className={settingsScopeBadgeClassName}>
                        {t('profile.settings.scope.account')}
                      </span>
                    </div>
                    {accountPreferencesSaving && (
                      <span className={settingsSyncBadgeClassName}>
                        {t('profile.settings.syncing')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-bd-ink-muted dark:text-slate-400">
                    {t('profile.settings.privacy.subtitle')}
                  </p>

                  <div className="mt-5">
                    <div className={settingsSurfaceClassName}>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-bd-ink dark:text-slate-300">
                          {t('profile.settings.privacy.profileVisibility')}
                        </label>
                        <p className="mb-3 text-xs text-bd-ink-muted dark:text-slate-400">
                          {t('profile.settings.privacy.profileVisibilityDesc')}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {([
                            {
                              value: 'public' as const,
                              icon: '🌍',
                              label: t('profile.settings.privacy.public'),
                              description: t('profile.settings.privacy.publicDesc'),
                            },
                            {
                              value: 'friends' as const,
                              icon: '👥',
                              label: t('profile.settings.privacy.friendsOnly'),
                              description: t('profile.settings.privacy.friendsOnlyDesc'),
                            },
                            {
                              value: 'private' as const,
                              icon: '🔒',
                              label: t('profile.settings.privacy.private'),
                              description: t('profile.settings.privacy.privateDesc'),
                            },
                          ] as const).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                void updateAccountPreference('profileVisibility', option.value)
                              }
                              disabled={accountPreferencesSaving}
                              className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                                accountPreferences.profileVisibility === option.value
                                  ? 'border-[#7867E8] bg-bd-lav/15 text-bd-lav-deep shadow-sm dark:border-bd-lav dark:bg-bd-lav/15 dark:text-bd-lav'
                                  : 'border-bd-line bg-white text-bd-ink-soft hover:bg-bd-card-warm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <span className="inline-flex min-w-[2.2rem] items-center justify-center rounded-full bg-bd-bg2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bd-ink-muted dark:bg-slate-800 dark:text-slate-300">
                                  {option.icon}
                                </span>
                                <span>{option.label}</span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-bd-ink-muted dark:text-slate-400">
                                {option.description}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 border-t border-bd-line pt-4 dark:border-slate-700">
                        <Label className="flex cursor-pointer items-start gap-3">
                          <Checkbox
                            checked={accountPreferences.showOnlineStatus}
                            onCheckedChange={(checked) =>
                              void updateAccountPreference('showOnlineStatus', checked === true)
                            }
                            disabled={accountPreferencesSaving}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                              {t('profile.settings.privacy.showOnline')}
                            </div>
                            <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                              {t('profile.settings.privacy.showOnlineDesc')}
                            </div>
                          </div>
                        </Label>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
