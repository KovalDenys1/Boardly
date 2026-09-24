'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { trackPremiumCta } from '@/lib/analytics'
import { Icon, type IconName } from '@/components/icons'
import GameIcon from '@/components/GameIcon'
import UsernameInput from '@/components/UsernameInput'
import GameHistory from '@/components/GameHistory'
import AchievementsGrid from '@/components/AchievementsGrid'
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
import { changeLanguageLazy, type Locale } from '@/i18n'
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORY_ACCENT } from '@/lib/achievements'
import { getSafeLocalStorage } from '@/lib/safe-storage'
import {
  getExistingPushSubscription,
  getPushPermissionState,
  isPushConfigured,
  subscribeAndRegisterPush,
  unsubscribeFromPush,
} from '@/lib/push-subscription'

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

type TabType = 'profile' | 'friends' | 'history' | 'stats' | 'premium' | 'settings'
const PROFILE_TABS: TabType[] = ['profile', 'friends', 'history', 'stats', 'premium', 'settings']
const PROFILE_VISIBILITY_REFRESH_INTERVAL_MS = 60 * 1000

/**
 * Everything below is copy rendered from a list, so it is held as translation
 * KEYS rather than text: these arrays are built at module scope, where `t()`
 * — a hook-backed function — does not exist yet. The key is resolved at render
 * time, the way components/Footer.tsx resolves `link.labelKey`.
 */
type FeatureRow = { icon: IconName; labelKey: TranslationKeys; descKey: TranslationKeys }

const FREE_FEATURES: FeatureRow[] = [
  { icon: 'gamepad', labelKey: 'profile.premiumTab.free.gamesLabel', descKey: 'profile.premiumTab.free.gamesDesc' },
  { icon: 'mask', labelKey: 'profile.premiumTab.free.avatarsLabel', descKey: 'profile.premiumTab.free.avatarsDesc' },
  { icon: 'pencil', labelKey: 'premium.free.bio.label', descKey: 'profile.premiumTab.free.bioDesc' },
  { icon: 'link', labelKey: 'premium.free.profile.label', descKey: 'profile.premiumTab.free.profileDesc' },
]

const PREMIUM_FEATURES: FeatureRow[] = [
  { icon: 'camera', labelKey: 'premium.features.upload.label', descKey: 'profile.premiumTab.paid.uploadDesc' },
  { icon: 'crown', labelKey: 'profile.premiumTab.paid.badgeLabel', descKey: 'profile.premiumTab.paid.badgeDesc' },
  { icon: 'palette', labelKey: 'premium.features.cardStyle.label', descKey: 'profile.premiumTab.paid.cardStyleDesc' },
  { icon: 'drop', labelKey: 'profile.premiumTab.paid.accentLabel', descKey: 'profile.premiumTab.paid.accentDesc' },
  { icon: 'trophy', labelKey: 'premium.features.featuredGame.label', descKey: 'profile.premiumTab.paid.featuredGameDesc' },
]

const ACCENT_COLORS: { hex: string; nameKey: TranslationKeys }[] = [
  { hex: '#FF6B5B', nameKey: 'profile.customization.colors.coral' },
  { hex: '#4FA3E8', nameKey: 'profile.customization.colors.sky' },
  { hex: '#48BB78', nameKey: 'profile.customization.colors.green' },
  { hex: '#F6AD55', nameKey: 'profile.customization.colors.orange' },
  { hex: '#9B8CFF', nameKey: 'profile.customization.colors.lavender' },
  { hex: '#F687B3', nameKey: 'profile.customization.colors.pink' },
  { hex: '#FC8181', nameKey: 'profile.customization.colors.red' },
  { hex: '#68D391', nameKey: 'profile.customization.colors.mint' },
]

const FEATURED_GAMES: { id: string; glyph: string; labelKey: TranslationKeys }[] = [
  { id: 'yahtzee', glyph: 'yahtzee', labelKey: 'games.yahtzee.name' },
  { id: 'connect_four', glyph: 'connect-four', labelKey: 'games.connect_four.name' },
  { id: 'tic_tac_toe', glyph: 'tic-tac-toe', labelKey: 'games.tictactoe.name' },
  { id: 'memory', glyph: 'memory', labelKey: 'games.memory.name' },
  { id: 'guess_the_spy', glyph: 'spy', labelKey: 'spy.roles.spy' },
  { id: 'alias', glyph: 'alias', labelKey: 'games.alias.name' },
  { id: 'rock_paper_scissors', glyph: 'rps', labelKey: 'profile.customization.featuredRps' },
  { id: 'liars_party', glyph: 'liars-party', labelKey: 'games.liars_party.name' },
]

const PREMIUM_CARD_STYLES: {
  id: string
  nameKey: TranslationKeys
  descKey: TranslationKeys
  preview: string
  text: string
}[] = [
  { id: 'gold',  nameKey: 'profile.customization.cardStyles.goldName',  descKey: 'profile.customization.cardStyles.goldDesc',  preview: '#FAF2D8',                                                       text: '#3A2800' },
  { id: 'glass', nameKey: 'profile.customization.cardStyles.glassName', descKey: 'profile.customization.cardStyles.glassDesc', preview: 'linear-gradient(135deg, #FF6B5B, #FFC44D, #4FC9A6)',          text: '#1F1B16' },
  { id: 'holo',  nameKey: 'profile.customization.cardStyles.holoName',  descKey: 'profile.customization.cardStyles.holoDesc',  preview: 'linear-gradient(135deg, #B4F0FF, #C9B8FF, #FFB8E0, #FFE3A8)', text: '#2D2266' },
  { id: 'dark',  nameKey: 'profile.customization.cardStyles.darkName',  descKey: 'profile.customization.cardStyles.darkDesc',  preview: 'linear-gradient(135deg, #2A2522, #16120E)',                    text: '#4FC9A6' },
]

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
  pushNotifications: boolean
}

type ProfileSummary = {
  id: string
  username: string | null
  email: string | null
  pendingEmail: string | null
  hasPassword?: boolean
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
    unlockedAchievements: { key: string; unlockedAt: string }[]
  }
}

type InlineEditorField = 'username' | 'email'

// PATCH /api/user/profile refuses an email change without proof of ownership
// (#1136): the current password, or a recent sign-in for an account without
// one. These are the codes it answers with, and what each one tells the user.
const EMAIL_CHANGE_REFUSAL_KEYS: Record<string, TranslationKeys> = {
  CURRENT_PASSWORD_REQUIRED: 'profile.inline.currentPasswordRequired',
  CURRENT_PASSWORD_INCORRECT: 'profile.inline.currentPasswordIncorrect',
  RECENT_SIGN_IN_REQUIRED: 'profile.inline.recentSignInRequired',
}

function getEmailChangeRefusalKey(data: unknown): TranslationKeys | null {
  const code = data && typeof data === 'object' ? (data as { code?: unknown }).code : undefined
  return typeof code === 'string' ? EMAIL_CHANGE_REFUSAL_KEYS[code] ?? null : null
}
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [showResendVerification, setShowResendVerification] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccounts>({})
  const [loadingLinkedAccounts, setLoadingLinkedAccounts] = useState(true)
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)
  const [hasUploadPack, setHasUploadPack] = useState(false)
  const [premiumCancelAtPeriodEnd, setPremiumCancelAtPeriodEnd] = useState(false)
  const [premiumUntilDate, setPremiumUntilDate] = useState<Date | null>(null)
  const [hasSubscriptionId, setHasSubscriptionId] = useState(false)
  const [premiumActionLoading, setPremiumActionLoading] = useState(false)
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

  // Profile customization state
  const [profileBio, setProfileBio] = useState('')
  const [profileAccentColor, setProfileAccentColor] = useState<string | null>(null)
  const [profileFeaturedGame, setProfileFeaturedGame] = useState<string | null>(null)
  const [premiumCardStyle, setPremiumCardStyle] = useState<string | null>(null)
  const [customizeSaving, setCustomizeSaving] = useState(false)

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
    pushNotifications: false,
  })
  const [pushPermission, setPushPermission] = useState<'loading' | 'unsupported' | 'unavailable' | NotificationPermission>('loading')
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

  const memberSinceLabel = useMemo(() => {
    if (!profileSummary?.createdAt) {
      // null (not '--') distinguishes "profile hasn't loaded yet" from a
      // real value so the card can show a loading skeleton instead of a
      // static placeholder that briefly reads as broken/empty data right
      // after registration.
      return null
    }

    return new Date(profileSummary.createdAt).toLocaleDateString(i18n.language || undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }, [i18n.language, profileSummary?.createdAt])

  const formatPremiumDate = useCallback(
    (d: Date | null) =>
      d
        ? d.toLocaleDateString(i18n.language || undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        : '',
    [i18n.language]
  )

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
        value: hasUploadPack ? (premiumCancelAtPeriodEnd ? 'Cancels soon' : 'Active') : 'Free',
        accent: hasUploadPack ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-bd-lav text-[#7867e8]',
        onClick: () => {
          setActiveTab('premium')
          setTimeout(() => tabListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
        },
      },
    ],
    [memberSinceLabel, profileSummary?.friendsCount, profileSummary?.achievementStats?.completedGamesCount, t, hasUploadPack, premiumCancelAtPeriodEnd]
  )

  const fetchProfileSummary = useCallback(async () => {
    const [profileRes, purchasesRes, customizeRes] = await Promise.all([
      fetch('/api/user/profile', { cache: 'no-store' }),
      fetch('/api/user/purchases', { cache: 'no-store' }),
      fetch('/api/user/customize', { cache: 'no-store' }),
    ])
    const data = await profileRes.json()

    if (!profileRes.ok) {
      throw new Error(data.error || t('profile.errors.loadFailed'))
    }

    setProfileSummary(data.user)
    if (purchasesRes.ok) {
      const purchasesData = await purchasesRes.json()
      setHasUploadPack(purchasesData.isPremium === true)
      setPremiumCancelAtPeriodEnd(purchasesData.cancelAtPeriodEnd === true)
      setPremiumUntilDate(purchasesData.premiumUntil ? new Date(purchasesData.premiumUntil) : null)
      setHasSubscriptionId(purchasesData.hasSubscriptionId === true)
    }
    if (customizeRes.ok) {
      const customizeData = await customizeRes.json()
      setProfileBio(customizeData.bio ?? '')
      setProfileAccentColor(customizeData.accentColor ?? null)
      setProfileFeaturedGame(customizeData.featuredGame ?? null)
      setPremiumCardStyle(customizeData.premiumCardStyle ?? null)
    }
    return data.user as ProfileSummary
  }, [t])

  const handleCancelSubscription = useCallback(async () => {
    setPremiumActionLoading(true)
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      await fetchProfileSummary()
      showToast.success('toast.success', 'Subscription cancelled. Access continues until the end of the billing period.')
    } catch {
      showToast.error('errors.generic', 'Failed to cancel subscription')
    } finally {
      setPremiumActionLoading(false)
    }
  }, [fetchProfileSummary])

  const handleReactivate = useCallback(async () => {
    setPremiumActionLoading(true)
    try {
      const res = await fetch('/api/stripe/reactivate', { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      await fetchProfileSummary()
      showToast.success('toast.success', 'Subscription reactivated!')
    } catch {
      showToast.error('errors.generic', 'Failed to reactivate subscription')
    } finally {
      setPremiumActionLoading(false)
    }
  }, [fetchProfileSummary])

  const handleSaveCustomization = useCallback(async (fields: { bio?: string; accentColor?: string | null; featuredGame?: string | null; premiumCardStyle?: string | null }) => {
    setCustomizeSaving(true)
    try {
      const res = await fetch('/api/user/customize', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      showToast.success('toast.saved')
    } catch (err) {
      showToast.error('errors.generic', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setCustomizeSaving(false)
    }
  }, [])

  const handleManageBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else showToast.error('errors.generic', 'Failed to open billing portal')
    } catch {
      showToast.error('errors.generic', 'Failed to open billing portal')
    }
  }, [])

  // Posting straight to the checkout API sends no `plan`, and the route reads a
  // missing field as monthly — so every buyer arriving from the profile was put
  // on the monthly price with no way to see, let alone pick, the yearly one. The
  // plan chooser lives on /premium, priced from Stripe at runtime, so send them
  // there instead of building a second pricing UI that can drift from the first.
  const handleCheckout = useCallback(() => {
    trackPremiumCta('profile_premium_tab')
    setPremiumActionLoading(true)
    router.push('/premium')
  }, [router])

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

    if (currentUrl.searchParams.get('premium') === 'success') {
      showToast.success('toast.success', 'Welcome to Boardly Premium!')
      currentUrl.searchParams.delete('premium')
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
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
      setSettings(getStoredAppearancePreferences(getSafeLocalStorage() ?? undefined))

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
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushPermission('unsupported')
      return
    }
    // A build with no VAPID public key cannot subscribe anyone, so the toggle
    // is off the table before the browser is ever asked (#983).
    if (!isPushConfigured()) {
      setPushPermission('unavailable')
      return
    }
    setPushPermission(Notification.permission)
  }, [])

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
      setCurrentPassword('')
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
          : { email: trimmedValue.toLowerCase(), ...(currentPassword ? { currentPassword } : {}) }

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      const refusalKey = res.ok ? null : getEmailChangeRefusalKey(data)
      if (refusalKey) {
        // The address itself is fine, so the editor stays open and submittable.
        setEditingMessage(t(refusalKey))
        showToast.error(refusalKey)
        return
      }

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
      const payload: { username?: string; email?: string; currentPassword?: string } = {}

      if (usernameChanged) {
        payload.username = trimmedUsername
      }

      if (emailChanged) {
        payload.email = normalizedEmail
        if (currentPassword) {
          payload.currentPassword = currentPassword
        }
      }

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      const refusalKey = res.ok ? null : getEmailChangeRefusalKey(data)
      if (refusalKey) {
        setEmailMessage(t(refusalKey))
        showToast.error(refusalKey)
        return
      }

      if (!res.ok) {
        throw new Error(data.error || t('profile.errors.updateFailed'))
      }

      if (data.user) {
        setProfileSummary(data.user)
      }
      setCurrentPassword('')

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

  // GDPR access and portability (#1127): the file comes from the server with the user
  // taken from the session, so this only turns the response into a download.
  const handleDownloadData = async () => {
    setExportLoading(true)
    try {
      const res = await fetch('/api/user/export', { cache: 'no-store' })
      if (!res.ok) {
        showToast.error(res.status === 429 ? 'profile.dataExport.rateLimited' : 'profile.dataExport.failed')
        return
      }
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'boardly-data.json'
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      showToast.error('profile.dataExport.failed')
    } finally {
      setExportLoading(false)
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
      const normalizedLanguage = setStoredAppearanceLocale(getSafeLocalStorage(), String(value))
      setSettings((prev) => ({ ...prev, language: normalizedLanguage }))

      if (normalizeAppearanceLocale(i18n.language) !== normalizedLanguage) {
        void changeLanguageLazy(normalizedLanguage as Locale)
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

  const handleTogglePush = async (enable: boolean) => {
    if (notificationsSaving) return
    try {
      if (enable) {
        // Every outcome is named now, so an opt-in that cannot work says so
        // instead of leaving the user with a granted prompt and no
        // subscription (#983).
        const result = await subscribeAndRegisterPush()
        if (result === 'registered') {
          setPushPermission('granted')
          updateNotificationPreference('pushNotifications', true)
          showToast.success('profile.settings.notifications.pushEnabled')
        } else if (result === 'unavailable') {
          setPushPermission('unavailable')
          showToast.error('profile.settings.notifications.pushUnavailable')
        } else if (result === 'unsupported') {
          setPushPermission('unsupported')
          showToast.error('profile.settings.notifications.pushUnsupported')
        } else if (result === 'denied') {
          setPushPermission(getPushPermissionState())
          showToast.error('profile.settings.notifications.pushDenied')
        } else {
          showToast.error('profile.settings.notifications.pushFailed')
        }
        return
      }

      const sub = await getExistingPushSubscription()
      if (sub) {
        await unsubscribeFromPush()
        await fetch('/api/push-subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
      }
      updateNotificationPreference('pushNotifications', false)
    } catch {
      showToast.error('profile.settings.error')
    }
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
      window.dispatchEvent(new CustomEvent('boardly:account-preferences-updated', { detail: nextPreferences }))
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
        window.dispatchEvent(new CustomEvent('boardly:account-preferences-updated', { detail: previousPreferences }))
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

  const tabItems: Array<{ id: TabType; icon: IconName; label: string }> = [
    { id: 'profile', icon: 'user', label: t('profile.title') },
    { id: 'friends', icon: 'users', label: t('profile.friends.title') },
    { id: 'history', icon: 'gamepad', label: t('profile.gameHistory.title') },
    { id: 'stats', icon: 'chart', label: t('profile.stats.title') },
    { id: 'premium', icon: 'star', label: 'Premium' },
    { id: 'settings', icon: 'gear', label: t('profile.settings.title') },
  ]

  const unlockedAchievementsByKey = new Map(
    (profileSummary?.achievementStats?.unlockedAchievements ?? []).map((a) => [a.key, a.unlockedAt])
  )
  const achievementItems = ACHIEVEMENTS.map((achievement) => {
    const unlockedAt = unlockedAchievementsByKey.get(achievement.key) ?? null
    return {
      id: achievement.key,
      icon: achievement.icon,
      accent: ACHIEVEMENT_CATEGORY_ACCENT[achievement.category],
      label: t(`achievements.${achievement.key}.name` as TranslationKeys),
      description: t(`achievements.${achievement.key}.description` as TranslationKeys),
      unlockedOnLabel: unlockedAt
        ? t('profile.achievements.unlockedOn' as TranslationKeys, { date: new Date(unlockedAt).toLocaleDateString(i18n.language || undefined) })
        : null,
      earned: unlockedAt !== null,
    }
  })

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

  const emailChangeNeedsPassword = Boolean(profileSummary?.hasPassword)

  const inlineEditorCanSubmit =
    inlineEditorHasChanges &&
    editingStatus === 'available' &&
    !submittingInlineEdit &&
    (editingField !== 'email' || !emailChangeNeedsPassword || currentPassword.length > 0)

  const trimmedProfileUsernameDraft = username.trim()
  const normalizedProfileEmailDraft = email.trim().toLowerCase()
  const profileUsernameChanged = trimmedProfileUsernameDraft !== currentUsername
  const profileEmailChanged = normalizedProfileEmailDraft !== editableEmail.toLowerCase()
  const profileFormHasChanges = profileUsernameChanged || profileEmailChanged
  const profileFormCanSubmit =
    profileFormHasChanges &&
    !loading &&
    (!profileUsernameChanged || usernameAvailable) &&
    (!profileEmailChanged || emailStatus === 'available') &&
    (!profileEmailChanged || !emailChangeNeedsPassword || currentPassword.length > 0)

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
                <Icon name="check" size={16} />
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

        {isEditing && field === 'email' && emailChangeNeedsPassword && inlineEditorHasChanges && (
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                cancelInlineEdit()
              }
              if (event.key === 'Enter' && inlineEditorCanSubmit) {
                void handleInlineEditSubmit()
              }
            }}
            placeholder={t('profile.inline.currentPassword')}
            aria-label={t('profile.inline.currentPassword')}
            autoComplete="current-password"
            className="mt-2 w-full border-0 border-b-2 border-blue-400/70 bg-transparent px-0 pb-1 text-sm text-bd-ink-soft shadow-none outline-none placeholder:text-bd-ink-muted focus:ring-0 dark:border-blue-400/60 dark:text-slate-300 dark:placeholder:text-slate-500"
          />
        )}

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
    setCurrentPassword('')
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
                  avatarUrl: profileSummary.avatarUrl,
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
                          {t('profile.levelShort')} {Math.max(
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
                  <div data-tour-step="stats-cards" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {summaryCards.map((card) => {
                      const inner = (
                        <>
                          <div className={`absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-20 ${card.accent.split(' ')[0]}`} />
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400">
                            {card.label}
                          </p>
                          {card.value === null ? (
                            <div className="mt-2 h-8 w-16 animate-pulse rounded-lg bg-bd-bg2 dark:bg-slate-700" aria-hidden="true" />
                          ) : (
                            <p className={`mt-2 font-display text-3xl font-bold leading-none dark:text-white ${card.accent.split(' ')[1]}`}>
                              {card.value}
                            </p>
                          )}
                        </>
                      )
                      const baseClass = 'group relative overflow-hidden rounded-3xl border-[1.5px] border-bd-line bg-white p-5 shadow-[0_4px_14px_rgba(31,27,22,0.07)] transition-all hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800'
                      return card.onClick ? (
                        <button
                          key={card.id}
                          type="button"
                          onClick={card.onClick}
                          className={`${baseClass} w-full text-left cursor-pointer hover:shadow-[0_6px_18px_rgba(31,27,22,0.12)]`}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div key={card.id} className={baseClass}>
                          {inner}
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-5 w-full">
                    <div className="rounded-3xl border-[1.5px] border-bd-line bg-white p-5 shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700 dark:bg-slate-800">
                      <AchievementsGrid items={achievementItems} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab Navigation ── */}
          <div className="mt-6 overflow-x-auto scrollbar-none">
            <nav
              ref={tabListRef}
              role="tablist"
              aria-label={t('profile.title')}
              className="relative flex w-full min-w-max gap-1 rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm p-1.5 shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700 dark:bg-slate-900/70"
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
                  className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-300 sm:px-4 ${
                    activeTab === tab.id
                      ? 'text-white'
                      : 'text-bd-ink-soft hover:bg-white/70 hover:text-bd-ink dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon name={tab.icon} size={16} />
                  <span className="hidden sm:inline truncate text-xs lg:text-sm">{tab.label}</span>
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
                    <h3 className="text-lg font-bold text-bd-ink dark:text-white">{t('profile.avatarSection')}</h3>
                  </div>
                  <AvatarPicker
                    currentAvatarUrl={profileSummary?.avatarUrl ?? null}
                    currentImage={profileSummary?.image ?? null}
                    username={profileSummary?.username ?? null}
                    email={profileSummary?.email ?? null}
                    hasUploadPack={hasUploadPack}
                    onSaved={async (avatarUrl) => {
                      setProfileSummary((prev) => prev ? { ...prev, avatarUrl } : prev)
                      await update()
                    }}
                    onUnlockUpload={() => {
                      // Same reason as handleCheckout: the avatar unlock used to
                      // buy the monthly plan outright.
                      router.push('/premium')
                    }}
                  />
                </div>

                <form onSubmit={handleUpdateProfile} className={profileSurfaceClassName}>
                  <div className="mb-5">
                    <h3 className="text-lg font-bold text-bd-ink dark:text-white">{t('profile.detailsSection')}</h3>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label htmlFor="profile-email-input" className="mb-2 block text-sm font-semibold text-bd-ink dark:text-slate-200">
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
                        id="profile-email-input"
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

                    {profileEmailChanged && emailChangeNeedsPassword && (
                      <div>
                        <label htmlFor="profile-current-password-input" className="mb-2 block text-sm font-semibold text-bd-ink dark:text-slate-200">
                          {t('profile.inline.currentPassword')}
                        </label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          id="profile-current-password-input"
                          className={`${fieldInputClassName} border-bd-line focus:border-[#7867E8] focus:ring-[#9B8CFF]/20 dark:border-slate-700`}
                          autoComplete="current-password"
                        />
                        <p className="mt-1.5 text-xs text-bd-ink-muted dark:text-slate-400">
                          {t('profile.inline.currentPasswordHint')}
                        </p>
                      </div>
                    )}

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

                <div className={profileSurfaceClassName}>
                  <h3 className="text-lg font-bold text-bd-ink dark:text-white">
                    {t('profile.dataExport.title')}
                  </h3>
                  <p className="mt-1 text-sm text-bd-ink-muted dark:text-slate-400">
                    {t('profile.dataExport.description')}
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadData}
                    disabled={exportLoading}
                    className={`${actionSecondaryButtonClassName} mt-4 disabled:opacity-50`}
                  >
                    {exportLoading ? t('profile.dataExport.preparing') : t('profile.dataExport.download')}
                  </button>
                </div>

                <div className="rounded-[1.5rem] border border-bd-danger-border bg-bd-danger-bg p-5 dark:border-red-500/20 dark:bg-red-500/10">
                  <h3 className="text-base font-bold text-bd-coral-deep dark:text-red-300">
                    {t('profile.dangerZone.title')}
                  </h3>
                  <p className="mt-1 text-sm text-bd-danger-text dark:text-red-200/70">
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
                    <div
                      role="dialog"
                      aria-modal="false"
                      aria-labelledby="delete-confirm-title"
                      className="mt-4 rounded-2xl border border-bd-danger-border bg-white p-4 dark:border-red-500/20 dark:bg-slate-900/70"
                    >
                      <p id="delete-confirm-title" className="text-sm font-semibold text-bd-coral-deep dark:text-red-300">
                        {t('profile.dangerZone.confirmTitle')}
                      </p>
                      <p className="mt-2 break-all text-sm text-bd-danger-text dark:text-red-200/70">
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

                      <Label className={settingsToggleCardClassName}>
                        <div className="min-w-0 pr-3">
                          <div className="text-sm font-semibold text-bd-ink dark:text-slate-200">
                            {t('profile.settings.notifications.push')}
                          </div>
                          <div className="mt-1 text-xs text-bd-ink-muted dark:text-slate-400">
                            {pushPermission === 'unsupported'
                              ? t('profile.settings.notifications.pushUnsupported')
                              : pushPermission === 'unavailable'
                                ? t('profile.settings.notifications.pushUnavailable')
                                : pushPermission === 'denied'
                                  ? t('profile.settings.notifications.pushDenied')
                                  : t('profile.settings.notifications.pushDesc')}
                          </div>
                        </div>
                        <Checkbox
                          checked={notificationPreferences.pushNotifications && pushPermission === 'granted'}
                          onCheckedChange={(checked) => handleTogglePush(Boolean(checked))}
                          disabled={notificationsSaving || pushPermission === 'unsupported' || pushPermission === 'unavailable' || pushPermission === 'denied' || pushPermission === 'loading'}
                          className="mt-0.5 shrink-0"
                        />
                      </Label>
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
                              icon: 'globe' as const,
                              label: t('profile.settings.privacy.public'),
                              description: t('profile.settings.privacy.publicDesc'),
                            },
                            {
                              value: 'friends' as const,
                              icon: 'users' as const,
                              label: t('profile.settings.privacy.friendsOnly'),
                              description: t('profile.settings.privacy.friendsOnlyDesc'),
                            },
                            {
                              value: 'private' as const,
                              icon: 'lock' as const,
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
                                  <Icon name={option.icon} size={13} />
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

          {/* Premium Tab */}
          {activeTab === 'premium' && (
            <div role="tabpanel" id="profile-tab-panel-premium" aria-labelledby="profile-tab-premium" className="space-y-5">
              <div className="max-w-2xl">
                <h2 className="font-display text-3xl font-bold text-bd-ink dark:text-white">{t('premium.title')}</h2>
                <p className="mt-1 text-sm text-bd-ink-muted dark:text-slate-400">
                  {!hasUploadPack
                    ? t('profile.premiumTab.leadFree')
                    : t('profile.premiumTab.leadPremium')}
                </p>
              </div>

              {/* Premium status card */}
              {hasUploadPack && (
                <div className={`${premiumCancelAtPeriodEnd ? 'border-amber-300/60 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/20' : 'border-amber-300/60 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/20'} rounded-[1.5rem] border p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl dark:bg-amber-900/40">
                        <Icon name={premiumCancelAtPeriodEnd ? 'hourglass' : 'star'} size={22} />
                      </span>
                      <div>
                        <p className="font-bold text-amber-800 dark:text-amber-300">
                          {premiumCancelAtPeriodEnd
                            ? t('profile.premiumTab.cancelsOn', { date: formatPremiumDate(premiumUntilDate) })
                            : t('profile.premiumTab.active')}
                        </p>
                        <p className="mt-0.5 text-sm text-amber-700/70 dark:text-amber-400/70">
                          {premiumCancelAtPeriodEnd
                            ? t('profile.premiumTab.loseAccess')
                            : t('profile.premiumTab.renewsOn', { date: formatPremiumDate(premiumUntilDate) })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hasSubscriptionId && !premiumCancelAtPeriodEnd && (
                        <button
                          type="button"
                          onClick={() => void handleCancelSubscription()}
                          disabled={premiumActionLoading}
                          className="rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-amber-700/40 dark:text-amber-400 dark:hover:border-red-500 dark:hover:text-red-400"
                        >
                          {premiumActionLoading ? '...' : t('common.cancel')}
                        </button>
                      )}
                      {hasSubscriptionId && premiumCancelAtPeriodEnd && (
                        <button
                          type="button"
                          onClick={() => void handleReactivate()}
                          disabled={premiumActionLoading}
                          className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                        >
                          <Icon name="star" size={16} />
                          <span>{premiumActionLoading ? '...' : t('profile.premiumTab.reactivate')}</span>
                        </button>
                      )}
                      {hasSubscriptionId && (
                        <button
                          type="button"
                          onClick={() => void handleManageBilling()}
                          className="rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-700/40 dark:text-amber-400 dark:hover:bg-amber-900/30"
                        >
                          {t('profile.premiumTab.manageBilling')}
                        </button>
                      )}
                      {!hasSubscriptionId && (
                        <button
                          type="button"
                          onClick={() => void handleManageBilling()}
                          className="rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-700/40 dark:text-amber-400 dark:hover:bg-amber-900/30"
                        >
                          {t('premium.ctaManage')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Feature overview */}
              <div className={profileSurfaceClassName}>
                <h3 className="mb-4 text-base font-bold text-bd-ink dark:text-white">{t('profile.premiumTab.included')}</h3>

                {/* Free features */}
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-bd-ink-muted dark:text-slate-500">{t('profile.premiumTab.freeForever')}</p>
                <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FREE_FEATURES.map(({ icon, labelKey, descKey }) => (
                    <div key={labelKey} className="flex items-start gap-2.5 rounded-xl border border-bd-line bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                      <span className="mt-0.5"><Icon name={icon} size={18} /></span>
                      <div>
                        <p className="text-sm font-semibold text-bd-ink dark:text-white">{t(labelKey)}</p>
                        <p className="text-xs text-bd-ink-muted dark:text-slate-400">{t(descKey)}</p>
                      </div>
                      <span className="ml-auto shrink-0 text-bd-mint-deep dark:text-bd-mint"><Icon name="check" size={15} /></span>
                    </div>
                  ))}
                </div>

                {/* Premium features */}
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">{t('profile.premiumTab.premiumExclusive')}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PREMIUM_FEATURES.map(({ icon, labelKey, descKey }) => (
                    <div
                      key={labelKey}
                      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                        hasUploadPack
                          ? 'border-amber-200/70 bg-amber-50/60 dark:border-amber-700/30 dark:bg-amber-950/20'
                          : 'border-bd-line bg-white opacity-60 dark:border-slate-700 dark:bg-slate-800/50'
                      }`}
                    >
                      <span className="mt-0.5"><Icon name={icon} size={18} /></span>
                      <div>
                        <p className="text-sm font-semibold text-bd-ink dark:text-white">{t(labelKey)}</p>
                        <p className="text-xs text-bd-ink-muted dark:text-slate-400">{t(descKey)}</p>
                      </div>
                      <span className={`ml-auto shrink-0 text-sm ${hasUploadPack ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>
                        {hasUploadPack ? <Icon name="check" size={15} /> : '—'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Free user CTA */}
                {!hasUploadPack && (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCheckout()}
                      disabled={premiumActionLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_3px_0_#d97706] transition-all hover:-translate-y-px hover:bg-amber-600 hover:shadow-[0_4px_0_#d97706] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {premiumActionLoading ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          <span>{t('common.loading')}</span>
                        </>
                      ) : (
                        <>
                          <Icon name="star" size={16} />
                          <span>{t('profile.premiumTab.getPremium')}</span>
                        </>
                      )}
                    </button>
                    <p className="text-xs text-bd-ink-muted dark:text-slate-500">{t('profile.premiumTab.cancelAnytime')}</p>
                  </div>
                )}
              </div>

              {/* Profile Customization */}
              <div className={profileSurfaceClassName}>
                <h3 className="mb-1 text-lg font-bold text-bd-ink dark:text-white">{t('profile.customization.title')}</h3>
                <p className="mb-5 text-sm text-bd-ink-muted dark:text-slate-400">
                  {t('profile.customization.subtitle')}
                </p>

                {/* Bio — free */}
                <div className="mb-6">
                  <label className="mb-1.5 block text-sm font-semibold text-bd-ink dark:text-white">
                    {t('premium.free.bio.label')} <span className="text-xs font-normal text-bd-ink-muted">{t('profile.customization.bioHint')}</span>
                  </label>
                  <textarea
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value.slice(0, 160))}
                    placeholder={t('profile.customization.bioPlaceholder')}
                    rows={3}
                    className="w-full rounded-xl border border-bd-line bg-white px-3 py-2.5 text-sm text-bd-ink placeholder:text-bd-ink-muted focus:border-bd-ink focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`text-xs font-medium transition-colors ${profileBio.length >= 140 ? 'text-amber-500' : 'text-bd-ink-muted'}`}>
                      {profileBio.length}/160
                    </span>
                    <button
                      type="button"
                      disabled={customizeSaving}
                      onClick={() => void handleSaveCustomization({ bio: profileBio })}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-bd-lav-deep bg-bd-lav px-3 py-1.5 text-xs font-bold text-white shadow-[0_3px_0_#7867E8] transition-all hover:-translate-y-px hover:bg-bd-lav-mid hover:shadow-[0_4px_0_#7867E8] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {customizeSaving ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          {t('profile.saving')}
                        </>
                      ) : t('profile.customization.saveBio')}
                    </button>
                  </div>
                </div>

                <div className="border-t border-bd-line pt-5 dark:border-slate-700">

                {/* Accent color — premium */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <label className="text-sm font-semibold text-bd-ink dark:text-white">{t('profile.customization.accentTitle')}</label>
                    {!hasUploadPack && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Icon name="crown" size={11} /> {t('premium.breadcrumb')}</span>}
                  </div>
                  <p className="mb-2.5 text-xs text-bd-ink-muted dark:text-slate-400">{t('profile.customization.accentHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_COLORS.map(({ hex, nameKey }) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => {
                          if (!hasUploadPack) {
                            showToast.custom('profile.premiumFeatureLocked', <Icon name="crown" size={18} />)
                            return
                          }
                          const next = profileAccentColor === hex ? null : hex
                          setProfileAccentColor(next)
                          void handleSaveCustomization({ accentColor: next })
                        }}
                        aria-label={hasUploadPack
                          ? t(profileAccentColor === hex ? 'profile.customization.accentAriaActive' : 'profile.customization.accentAria', { name: t(nameKey) })
                          : t('profile.customization.premiumRequiredFor', { name: t(nameKey) })}
                        aria-pressed={profileAccentColor === hex}
                        title={hasUploadPack ? t(nameKey) : t('profile.customization.premiumRequired')}
                        style={{
                          width: 32, height: 32, borderRadius: 8, background: hex, border: 'none',
                          outline: profileAccentColor === hex ? `3px solid ${hex}` : '2px solid transparent',
                          outlineOffset: 2, cursor: 'pointer',
                          opacity: hasUploadPack ? 1 : 0.4,
                          transition: 'all 0.15s',
                        }}
                      />
                    ))}
                  </div>
                  {profileAccentColor && (
                    <p className="mt-1.5 text-xs text-bd-ink-muted">
                      {t('profile.customization.accentActive')} <span style={{ color: profileAccentColor, fontWeight: 700 }}>
                        {(() => {
                          const active = ACCENT_COLORS.find((color) => color.hex === profileAccentColor)
                          return active ? t(active.nameKey) : profileAccentColor
                        })()}
                      </span>
                    </p>
                  )}
                </div>

                {/* Featured game — premium */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <label className="text-sm font-semibold text-bd-ink dark:text-white">{t('profile.customization.featuredTitle')}</label>
                    {!hasUploadPack && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Icon name="crown" size={11} /> {t('premium.breadcrumb')}</span>}
                  </div>
                  <p className="mb-2.5 text-xs text-bd-ink-muted dark:text-slate-400">{t('profile.customization.featuredHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {FEATURED_GAMES.map(({ id, glyph, labelKey }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (!hasUploadPack) {
                            showToast.custom('profile.premiumFeatureLocked', <Icon name="crown" size={18} />)
                            return
                          }
                          const next = profileFeaturedGame === id ? null : id
                          setProfileFeaturedGame(next)
                          void handleSaveCustomization({ featuredGame: next })
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                          profileFeaturedGame === id
                            ? 'border-bd-ink bg-bd-ink text-bd-bg dark:border-white dark:bg-white dark:text-bd-ink'
                            : 'border-bd-line bg-white text-bd-ink hover:border-bd-ink dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:border-slate-400'
                        }`}
                        style={{ opacity: hasUploadPack ? 1 : 0.4, cursor: 'pointer' }}
                      >
                        <GameIcon gameId={glyph} accentColor="currentColor" size={14} variant="bare" />
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Premium profile card style */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <label className="text-sm font-semibold text-bd-ink dark:text-white">{t('profile.customization.cardStyleTitle')}</label>
                    {!hasUploadPack && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Icon name="crown" size={11} /> {t('premium.breadcrumb')}</span>}
                  </div>
                  <p className="mb-2.5 text-xs text-bd-ink-muted dark:text-slate-400">{t('profile.customization.cardStyleHint')}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PREMIUM_CARD_STYLES.map(({ id, nameKey, descKey, preview, text }) => {
                      const active = hasUploadPack && (premiumCardStyle ?? 'gold') === id
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          aria-label={hasUploadPack
                            ? t(active ? 'profile.customization.cardStyleAriaActive' : 'profile.customization.cardStyleAria', { name: t(nameKey) })
                            : t('profile.customization.premiumRequiredFor', { name: t(nameKey) })}
                          onClick={() => {
                            if (!hasUploadPack) {
                              showToast.custom('profile.premiumFeatureLocked', <Icon name="crown" size={18} />)
                              return
                            }
                            setPremiumCardStyle(id)
                            void handleSaveCustomization({ premiumCardStyle: id })
                          }}
                          style={{
                            background: preview,
                            opacity: hasUploadPack ? 1 : 0.4,
                            cursor: 'pointer',
                            outline: active ? '3px solid var(--bd-ink)' : '2px solid transparent',
                            outlineOffset: 2,
                          }}
                          className="relative flex flex-col justify-end rounded-xl px-3 py-5 text-left transition"
                        >
                          <span style={{ color: text, fontWeight: 700, fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{t(nameKey)}</span>
                          <span style={{ color: text, fontSize: 10, opacity: 0.75, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>{t(descKey)}</span>
                          {active && (
                            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-bd-ink shadow-sm"><Icon name="check" size={10} /></span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                </div>
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
