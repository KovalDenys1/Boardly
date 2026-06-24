'use client'

import { type FormEvent, type ReactNode, useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import LoadingSpinner from './LoadingSpinner'
import { buildPublicProfilePath, extractPublicProfileId } from '@/lib/public-profile'
import {
  useOnlinePresence,
  mergeFriendPresence,
  sortFriendsByPresence,
  type FriendPresence,
} from '@/hooks/useFriendPresence'

interface Friend {
  id: string
  username: string | null
  avatar: string | null
  email: string
  publicProfileId: string | null
  friendshipId: string
  friendsSince: string
  isPremium?: boolean
  presence?: FriendPresence
  statistics?: {
    totalGames: number
    totalWins: number
    winRate: number
  }
}

interface FriendRequest {
  id: string
  senderId: string
  receiverId: string
  status: string
  message: string | null
  createdAt: string
  sender?: {
    id: string
    username: string | null
    avatar: string | null
  }
  receiver?: {
    id: string
    username: string | null
    avatar: string | null
  }
}

type TabType = 'friends' | 'requests' | 'sent'
type AddMethod = 'link' | 'code'

const panelClassName =
  'rounded-[1.75rem] border-[1.5px] border-bd-line bg-white shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700/60 dark:bg-slate-900/80'
const warmSurfaceClassName =
  'rounded-[1.5rem] border border-bd-line bg-bd-card-warm/90 dark:border-slate-700/60 dark:bg-slate-800/70'
const tileClassName =
  'rounded-2xl border border-bd-line bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70'
const primaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-4 py-3 text-sm font-bold text-white shadow-[0_4px_0_var(--bd-lav-deep)] transition-all hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)] disabled:cursor-not-allowed disabled:opacity-65'
const secondaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-bd-line bg-white px-4 py-3 text-sm font-semibold text-bd-ink shadow-[0_3px_0_var(--bd-line)] transition-all hover:-translate-y-0.5 hover:bg-bd-card-warm dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-800'
const dangerButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-bd-coral/40 bg-white px-4 py-3 text-sm font-semibold text-bd-coral-deep transition-colors hover:bg-bd-coral/10 dark:border-red-500/30 dark:bg-slate-900/75 dark:text-red-300 dark:hover:bg-red-500/10'
const inputClassName =
  'w-full rounded-2xl border border-bd-line bg-white px-4 py-3 text-sm font-medium text-bd-ink shadow-sm outline-none transition-all placeholder:text-bd-ink-muted focus:border-bd-lav-deep focus:ring-4 focus:ring-bd-lav/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500'
const eyebrowClassName =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400'

function CopyIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10.59 5.3" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l2.24-2.19" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m8 9-4 3 4 3" />
      <path d="m16 9 4 3-4 3" />
      <path d="m14 4-4 16" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15.5 15.5 0 0 1 0 18" />
      <path d="M12 3a15.5 15.5 0 0 0 0 18" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M23 11h-6" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v12H15l-3 3-3-3H4z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 11h18" />
    </svg>
  )
}

export default function Friends() {
  const { t } = useTranslation()
  const { data: session, status } = useSession()
  const router = useRouter()
  const onlineUserIds = useOnlinePresence()
  const [activeTab, setActiveTab] = useState<TabType>('friends')
  const [friends, setFriends] = useState<Friend[]>([])
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([])
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [profileLinkInput, setProfileLinkInput] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [myFriendCode, setMyFriendCode] = useState<string>('')
  const [myPublicProfileId, setMyPublicProfileId] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addMethod, setAddMethod] = useState<AddMethod>('link')
  const [addLoading, setAddLoading] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const canLoadFriendData = status === 'authenticated' && Boolean(session?.user?.emailVerified)

  const loadFriends = useCallback(async () => {
    if (!canLoadFriendData) {
      setFriends([])
      return
    }

    try {
      const res = await fetch('/api/friends')

      if (res.status === 401 || res.status === 403) {
        setFriends([])
        return
      }

      if (!res.ok) throw new Error('Failed to load friends')

      const data = await res.json()
      setFriends(data.friends || [])
      clientLogger.log('Friends loaded', { count: data.friends?.length })
    } catch (error) {
      clientLogger.error('Error loading friends:', error)
      showToast.error('profile.friends.errors.loadFailed')
    }
  }, [canLoadFriendData])

  const loadRequests = useCallback(async () => {
    if (!canLoadFriendData) {
      setReceivedRequests([])
      setSentRequests([])
      return
    }

    try {
      const [receivedRes, sentRes] = await Promise.all([
        fetch('/api/friends/request?type=received'),
        fetch('/api/friends/request?type=sent'),
      ])

      if (
        receivedRes.status === 401 ||
        receivedRes.status === 403 ||
        sentRes.status === 401 ||
        sentRes.status === 403
      ) {
        setReceivedRequests([])
        setSentRequests([])
        return
      }

      if (!receivedRes.ok || !sentRes.ok) {
        throw new Error('Failed to load requests')
      }

      const receivedData = await receivedRes.json()
      const sentData = await sentRes.json()

      setReceivedRequests(receivedData.requests || [])
      setSentRequests(sentData.requests || [])

      clientLogger.log('Friend requests loaded', {
        received: receivedData.requests?.length || 0,
        sent: sentData.requests?.length || 0,
      })
    } catch (error) {
      clientLogger.error('Error loading requests:', error)
      showToast.error('profile.friends.errors.loadFailed')
    }
  }, [canLoadFriendData])

  const loadMyFriendCode = useCallback(async () => {
    if (!canLoadFriendData) {
      setMyFriendCode('')
      setMyPublicProfileId('')
      return
    }

    try {
      const res = await fetch('/api/user/friend-code')
      if (!res.ok) throw new Error('Failed to load friend code')

      const data = await res.json()
      setMyFriendCode(data.friendCode || '')
      setMyPublicProfileId(data.publicProfileId || '')
      clientLogger.log('My friend code loaded', {
        code: data.friendCode,
        publicProfileId: data.publicProfileId,
      })
    } catch (error) {
      clientLogger.error('Error loading friend code:', error)
    }
  }, [canLoadFriendData])

  const closeAddModal = useCallback(() => {
    setShowAddModal(false)
    setProfileLinkInput('')
    setFriendCode('')
    setAddMethod('link')
  }, [])

  useEffect(() => {
    if (status === 'loading') {
      setLoading(true)
      return
    }

    if (!canLoadFriendData) {
      setFriends([])
      setReceivedRequests([])
      setSentRequests([])
      setMyFriendCode('')
      setMyPublicProfileId('')
      setLoading(false)
      return
    }

    const loadData = async () => {
      setLoading(true)
      try {
        await Promise.all([loadFriends(), loadRequests(), loadMyFriendCode()])
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [canLoadFriendData, loadFriends, loadRequests, loadMyFriendCode, status])

  useEffect(() => {
    if (!canLoadFriendData) {
      return
    }

    const refreshInterval = setInterval(() => {
      if (activeTab === 'friends') {
        void loadFriends()
        return
      }

      void loadRequests()
    }, 60000)

    return () => clearInterval(refreshInterval)
  }, [activeTab, canLoadFriendData, loadFriends, loadRequests])

  const handleSendRequest = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()

      const publicProfileId = extractPublicProfileId(profileLinkInput)

      if (!publicProfileId) {
        showToast.error('profile.friends.errors.invalidProfileLink')
        return
      }

      setAddLoading(true)
      try {
        const res = await fetch('/api/friends/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiverPublicProfileId: publicProfileId,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to send request')
        }

        showToast.success('profile.friends.requestSent')
        closeAddModal()
        await loadRequests()
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        clientLogger.error('Error sending request:', err)
        showToast.errorFrom(err, 'profile.friends.errors.sendRequestFailed')
      } finally {
        setAddLoading(false)
      }
    },
    [closeAddModal, loadRequests, profileLinkInput]
  )

  const handleSendRequestByCode = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()

      const cleanCode = friendCode.replace(/\s/g, '')
      if (!cleanCode || !/^\d{5}$/.test(cleanCode)) {
        showToast.error('profile.friends.errors.invalidFriendCode')
        return
      }

      setAddLoading(true)
      try {
        const res = await fetch('/api/friends/add-by-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            friendCode: cleanCode,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to send request')
        }

        showToast.success('profile.friends.requestSent')
        closeAddModal()
        await loadRequests()
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        clientLogger.error('Error sending request by code:', err)
        showToast.errorFrom(err, 'profile.friends.errors.sendRequestFailed')
      } finally {
        setAddLoading(false)
      }
    },
    [closeAddModal, friendCode, loadRequests]
  )

  const copyFriendCode = async () => {
    if (!myFriendCode) return

    try {
      await navigator.clipboard.writeText(myFriendCode)
      showToast.success('profile.friends.friendCodeCopied')
    } catch (error) {
      clientLogger.error('Error copying friend code:', error)
      showToast.error('profile.friends.errors.copyCodeFailed')
    }
  }

  const copyProfileLink = async () => {
    if (!myPublicProfileId) return

    try {
      const profileUrl = `${window.location.origin}${buildPublicProfilePath(myPublicProfileId)}`
      await navigator.clipboard.writeText(profileUrl)
      showToast.success('profile.friends.profileLinkCopied')
    } catch (error) {
      clientLogger.error('Error copying profile link:', error)
      showToast.error('profile.friends.errors.copyLinkFailed')
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    setAcceptingId(requestId)
    try {
      const res = await fetch(`/api/friends/request/${requestId}/accept`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to accept request')
      }

      showToast.success('profile.friends.requestAccepted')
      await Promise.all([loadFriends(), loadRequests()])
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error accepting request:', err)
      showToast.errorFrom(err, 'profile.friends.errors.acceptFailed')
    } finally {
      setAcceptingId(null)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    setDecliningId(requestId)
    try {
      const res = await fetch(`/api/friends/request/${requestId}/reject`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to reject request')
      }

      showToast.success('profile.friends.requestRejected')
      await loadRequests()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error rejecting request:', err)
      showToast.errorFrom(err, 'profile.friends.errors.rejectFailed')
    } finally {
      setDecliningId(null)
    }
  }

  const handleRemoveFriend = async (friendshipId: string, username: string | null) => {
    if (!confirm(t('profile.friends.confirmRemove', { username: username || 'this friend' }))) {
      return
    }

    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove friend')
      }

      showToast.success('profile.friends.friendRemoved')
      await loadFriends()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error removing friend:', err)
      showToast.errorFrom(err, 'profile.friends.errors.removeFailed')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const resolvePresence = (friend: Friend): FriendPresence =>
    mergeFriendPresence(friend.presence, onlineUserIds.has(friend.id))

  const openFriendPublicProfile = useCallback(
    (friend: Friend) => {
      if (!friend.publicProfileId) {
        return
      }

      router.push(buildPublicProfilePath(friend.publicProfileId))
    },
    [router]
  )

  const renderAvatar = (
    name: string,
    avatar: string | null | undefined,
    fallbackTextClassName = 'text-xl font-bold'
  ) => {
    if (avatar) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={name} className="h-full w-full object-cover" />
      )
    }

    return <span className={fallbackTextClassName}>{name.charAt(0).toUpperCase() || '?'}</span>
  }

  const renderEmptyState = ({
    icon,
    title,
    description,
    action,
  }: {
    icon: ReactNode
    title: string
    description: string
    action?: ReactNode
  }) => (
    <div className={`${panelClassName} overflow-hidden`}>
      <div className="relative p-6 sm:p-7">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-[1.15rem] border-2 border-bd-ink bg-bd-sun text-bd-ink shadow-[2px_2px_0_var(--bd-ink)]">
            {icon}
          </div>
          <h3 className="mt-5 font-display text-2xl font-bold text-bd-ink dark:text-white">{title}</h3>
          <p className="mt-2 max-w-xl text-sm text-bd-ink-muted dark:text-slate-400 sm:text-base">
            {description}
          </p>
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className={`${panelClassName} flex min-h-[220px] items-center justify-center`}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!session?.user?.emailVerified && (
        <div className="overflow-hidden rounded-[1.75rem] border-[1.5px] border-bd-sun/50 bg-bd-sun/15 shadow-[0_4px_14px_rgba(31,27,22,0.05)] dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="border-l-4 border-bd-sun px-5 py-5 sm:px-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bd-sun/35 text-bd-ink-soft">
                <MailIcon />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-bd-ink-soft dark:text-amber-200">
                  {t('profile.friends.emailVerificationRequired')}
                </h3>
                <p className="mt-2 text-sm text-bd-ink-soft dark:text-amber-300/90">
                  {t('profile.friends.emailVerificationRequiredDesc')}
                </p>
                <a href="/auth/verify-email" className={`${secondaryButtonClassName} mt-4 inline-flex`}>
                  <MailIcon />
                  {t('profile.friends.verifyEmail')}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {myFriendCode && session?.user?.emailVerified ? (
        <div className={`${panelClassName} relative overflow-hidden`}>
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-30" />
          <div className="absolute -right-12 top-4 h-24 w-24 rounded-full bg-bd-lav/15" />
          <div className="absolute -bottom-8 left-10 h-20 w-20 rotate-12 rounded-[1.5rem] bg-bd-mint/15" />
          <div className="relative p-5 sm:p-6">
            <p className={eyebrowClassName}>{t('profile.friends.myFriendCode')}</p>
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
              <button
                type="button"
                onClick={copyFriendCode}
                className={`${warmSurfaceClassName} block w-full border-dashed px-4 py-5 text-left transition-colors hover:border-bd-lav-deep hover:bg-white dark:hover:bg-slate-900`}
                title={t('profile.friends.copyCode')}
                aria-label={t('profile.friends.copyCode')}
              >
                <p className="font-display text-sm font-bold text-bd-ink-muted dark:text-slate-400">
                  {t('profile.friends.shareCodeHint')}
                </p>
                <p className="mt-3 text-center font-mono text-4xl font-black tracking-[0.28em] text-bd-ink dark:text-white sm:text-5xl">
                  {myFriendCode}
                </p>
              </button>

              <div className="flex flex-col gap-3">
                <button onClick={copyFriendCode} className={`${primaryButtonClassName} w-full`} title={t('profile.friends.copyCode')}>
                  <CopyIcon />
                  {t('profile.friends.copyCode')}
                </button>
                <button
                  onClick={copyProfileLink}
                  disabled={!myPublicProfileId}
                  className={`${secondaryButtonClassName} w-full`}
                  title={t('profile.friends.copyLink')}
                >
                  <LinkIcon />
                  {t('profile.friends.copyLink')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${panelClassName} p-5 sm:p-6`}>
          <p className={eyebrowClassName}>{t('profile.friends.myFriendCode')}</p>
          <h3 className="mt-4 font-display text-2xl font-bold text-bd-ink dark:text-white">
            {t('profile.friends.addFriend')}
          </h3>
          <p className="mt-2 text-sm text-bd-ink-muted dark:text-slate-400">
            {t('profile.friends.shareCodeHint')}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className={`${warmSurfaceClassName} p-1.5 lg:flex-1`}>
          <div className="grid grid-cols-3 gap-1">
            {([
              { id: 'friends', icon: <UsersIcon />, label: t('profile.friends.tabs.friends'), count: friends.length },
              { id: 'requests', icon: <InboxIcon />, label: t('profile.friends.tabs.requests'), count: receivedRequests.length },
              { id: 'sent', icon: <SendIcon />, label: t('profile.friends.tabs.sent'), count: sentRequests.length },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-bd-lav text-white shadow-[0_4px_0_var(--bd-lav-deep)]'
                    : 'text-bd-ink-soft hover:bg-white/80 hover:text-bd-ink dark:text-slate-300 dark:hover:bg-slate-900/70'
                }`}
              >
                <span aria-hidden className="shrink-0">
                  {tab.icon}
                </span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span
                  className={`inline-flex min-w-[1.8rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-bd-bg2 text-bd-ink-muted dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => setShowAddModal(true)} className={`${primaryButtonClassName} lg:min-w-[220px]`}>
          <PlusIcon />
          {t('profile.friends.addFriend')}
        </button>
      </div>

      {activeTab === 'friends' && (
        <div className="space-y-4">
          {friends.length === 0 ? (
            renderEmptyState({
              icon: <UsersIcon />,
              title: t('profile.friends.noFriends'),
              description: t('profile.friends.noFriendsDescription'),
              action: (
                <button onClick={() => setShowAddModal(true)} className={primaryButtonClassName}>
                  <PlusIcon />
                  {t('profile.friends.addFirstFriend')}
                </button>
              ),
            })
          ) : (
            <div className="grid gap-4">
              {sortFriendsByPresence(friends, resolvePresence, (friend) => friend.username ?? '')
                .map((friend) => {
                  const presence = resolvePresence(friend)
                  const isOnline = presence !== 'offline'
                  const presenceBadge =
                    presence === 'in_game'
                      ? { label: t('profile.friends.presence.inGame'), className: 'bg-bd-lav/20 text-bd-lav-deep dark:bg-bd-lav/15 dark:text-bd-lav' }
                      : presence === 'in_lobby'
                        ? { label: t('profile.friends.presence.inLobby'), className: 'bg-bd-sun/25 text-bd-ink-soft dark:bg-bd-sun/15 dark:text-bd-sun' }
                        : presence === 'online'
                          ? { label: t('profile.friends.presence.online'), className: 'bg-bd-mint/20 text-bd-mint-deep dark:bg-bd-mint/15 dark:text-bd-mint' }
                          : null
                  const presenceStripClassName =
                    presence === 'in_game'
                      ? 'bg-bd-lav'
                      : presence === 'in_lobby'
                        ? 'bg-bd-sun'
                        : presence === 'online'
                          ? 'bg-bd-mint'
                          : 'bg-bd-bg2 dark:bg-slate-700'

                  return (
                    <div
                      key={friend.friendshipId}
                      role={friend.publicProfileId ? 'link' : undefined}
                      tabIndex={friend.publicProfileId ? 0 : undefined}
                      onClick={friend.publicProfileId ? () => openFriendPublicProfile(friend) : undefined}
                      onKeyDown={
                        friend.publicProfileId
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openFriendPublicProfile(friend)
                              }
                            }
                          : undefined
                      }
                      className={`${panelClassName} group relative overflow-hidden ${
                        friend.publicProfileId
                          ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-bd-lav/40 hover:shadow-[0_10px_24px_-14px_rgba(120,103,232,0.8)] focus:outline-none focus:ring-2 focus:ring-bd-lav/50'
                          : ''
                      }`}
                    >
                      <div className={`absolute inset-y-0 left-0 w-1.5 ${presenceStripClassName}`} />

                      <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                          <div className="relative shrink-0">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1.1rem] border-2 border-bd-ink bg-bd-lav text-white shadow-[2px_2px_0_var(--bd-ink)]">
                              {renderAvatar(friend.username || 'Unknown', friend.avatar)}
                            </div>
                            {isOnline && (
                              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-bd-mint dark:border-slate-900" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="flex items-center gap-1.5 truncate text-lg font-bold text-bd-ink dark:text-white">
                                {friend.username || 'Unknown'}
                                {friend.isPremium && <span className="shrink-0 text-sm" title="Premium">👑</span>}
                              </h4>
                              {presenceBadge && (
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${presenceBadge.className}`}>
                                  {presenceBadge.label}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-bd-ink-muted dark:text-slate-400">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-bd-bg2 px-3 py-1 text-xs font-semibold text-bd-ink-soft dark:bg-slate-800 dark:text-slate-300">
                                <CalendarIcon />
                                {formatDate(friend.friendsSince)}
                              </span>
                              {friend.publicProfileId ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-bd-lav-deep dark:bg-slate-900 dark:text-bd-lav">
                                  View profile
                                  <ArrowRightIcon />
                                </span>
                              ) : null}
                            </div>

                            {friend.statistics && friend.statistics.totalGames > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full bg-bd-card-warm px-2.5 py-1 font-semibold text-bd-ink-soft dark:bg-slate-800 dark:text-slate-200">
                                  Games {friend.statistics.totalGames}
                                </span>
                                <span className="rounded-full bg-bd-mint/20 px-2.5 py-1 font-semibold text-bd-mint-deep dark:bg-bd-mint/15 dark:text-bd-mint">
                                  Wins {friend.statistics.totalWins}
                                </span>
                                <span className="rounded-full bg-bd-lav/20 px-2.5 py-1 font-semibold text-bd-lav-deep dark:bg-bd-lav/15 dark:text-bd-lav">
                                  Win rate {Math.round(friend.statistics.winRate)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleRemoveFriend(friend.friendshipId, friend.username)
                          }}
                          className="shrink-0 rounded-2xl p-3 text-bd-coral-deep transition-colors hover:bg-bd-coral/10 dark:text-red-300 dark:hover:bg-red-500/10"
                          title={t('profile.friends.remove')}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-4">
          {receivedRequests.length === 0 ? (
            renderEmptyState({
              icon: <InboxIcon />,
              title: t('profile.friends.noRequests'),
              description: t('profile.friends.noRequestsDescription'),
            })
          ) : (
            <div className="grid gap-4">
              {receivedRequests.map((request) => (
                <div key={request.id} className={`${panelClassName} relative overflow-hidden`}>
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-bd-mint" />

                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="relative shrink-0">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.15rem] border-2 border-bd-ink bg-bd-mint text-white shadow-[2px_2px_0_var(--bd-ink)]">
                          {renderAvatar(request.sender?.username || 'Unknown', request.sender?.avatar, 'text-2xl font-bold')}
                        </div>
                        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-bd-lav text-white dark:border-slate-900">
                          <MailIcon />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg font-bold text-bd-ink dark:text-white">
                          {request.sender?.username || 'Unknown'}
                        </h4>
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-bd-bg2 px-3 py-1 text-xs font-semibold text-bd-ink-soft dark:bg-slate-800 dark:text-slate-300">
                          <CalendarIcon />
                          {formatDate(request.createdAt)}
                        </p>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <button onClick={() => void handleAcceptRequest(request.id)} className={`${primaryButtonClassName} flex-1`} disabled={acceptingId === request.id || decliningId === request.id}>
                            <CheckIcon />
                            {t('profile.friends.accept')}
                          </button>
                          <button onClick={() => void handleRejectRequest(request.id)} className={`${secondaryButtonClassName} flex-1`} disabled={acceptingId === request.id || decliningId === request.id}>
                            <CloseIcon />
                            {t('profile.friends.reject')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sent' && (
        <div className="space-y-4">
          {sentRequests.length === 0 ? (
            renderEmptyState({
              icon: <SendIcon />,
              title: t('profile.friends.noSentRequests'),
              description: t('profile.friends.noSentRequestsDescription'),
            })
          ) : (
            <div className="grid gap-4">
              {sentRequests.map((request) => (
                <div key={request.id} className={`${panelClassName} relative overflow-hidden`}>
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-bd-sun" />

                  <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="relative shrink-0">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1.1rem] border-2 border-bd-ink bg-bd-sun text-bd-ink shadow-[2px_2px_0_var(--bd-ink)]">
                          {renderAvatar(request.receiver?.username || 'Unknown', request.receiver?.avatar)}
                        </div>
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-bd-sun-deep dark:border-slate-900" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-lg font-bold text-bd-ink dark:text-white">
                          {request.receiver?.username || 'Unknown'}
                        </h4>
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-bd-bg2 px-3 py-1 text-xs font-semibold text-bd-ink-soft dark:bg-slate-800 dark:text-slate-300">
                          <CalendarIcon />
                          {formatDate(request.createdAt)}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full bg-bd-sun/25 px-3 py-1.5 text-xs font-bold text-bd-ink-soft dark:bg-bd-sun/15 dark:text-bd-sun">
                      {t('profile.friends.pending')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(31,27,22,0.55)] p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="friends-add-dialog-title"
            className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border-[1.5px] border-bd-line bg-white shadow-[0_12px_40px_-16px_rgba(31,27,22,0.4)] dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="dot-grid pointer-events-none absolute inset-0 opacity-25" />
            <div className="absolute -right-10 top-6 h-28 w-28 rounded-full bg-bd-lav/15" />
            <div className="absolute bottom-6 left-8 h-20 w-20 rotate-12 rounded-[1.5rem] bg-bd-mint/12" />

            <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className={eyebrowClassName}>{t('profile.friends.title')}</p>
                    <h3 id="friends-add-dialog-title" className="mt-3 font-display text-3xl font-bold text-bd-ink dark:text-white">
                      {t('profile.friends.addFriend')}
                    </h3>
                    <p className="mt-2 text-sm text-bd-ink-muted dark:text-slate-400">
                      {t('profile.friends.addFriendDescription')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-bd-bg2 text-bd-ink-soft transition-colors hover:bg-bd-line dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label={t('common.cancel')}
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className={`${warmSurfaceClassName} mt-6 p-1.5`}>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setAddMethod('link')}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                        addMethod === 'link'
                          ? 'bg-bd-lav text-white shadow-[0_4px_0_var(--bd-lav-deep)]'
                          : 'text-bd-ink-soft hover:bg-white/80 hover:text-bd-ink dark:text-slate-300 dark:hover:bg-slate-900/70'
                      }`}
                    >
                      <LinkIcon />
                      {t('profile.friends.byProfileLink')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddMethod('code')}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                        addMethod === 'code'
                          ? 'bg-bd-lav text-white shadow-[0_4px_0_var(--bd-lav-deep)]'
                          : 'text-bd-ink-soft hover:bg-white/80 hover:text-bd-ink dark:text-slate-300 dark:hover:bg-slate-900/70'
                      }`}
                    >
                      <CodeIcon />
                      {t('profile.friends.byFriendCode')}
                    </button>
                  </div>
                </div>

                {addMethod === 'link' ? (
                  <form onSubmit={handleSendRequest} className="mt-6 space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-bd-ink dark:text-slate-200">
                        {t('profile.friends.profileLink')}
                      </label>
                      <input
                        type="text"
                        value={profileLinkInput}
                        onChange={(e) => setProfileLinkInput(e.target.value)}
                        placeholder={t('profile.friends.profileLinkPlaceholder')}
                        className={inputClassName}
                        required
                      />
                      <p className="mt-2 text-xs text-bd-ink-muted dark:text-slate-400">
                        {t('profile.friends.profileLinkHint')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button type="submit" disabled={addLoading} className={`${primaryButtonClassName} flex-1`}>
                        {addLoading ? (
                          <>
                            <LoadingSpinner />
                            {t('common.loading')}
                          </>
                        ) : (
                          <>
                            <MailIcon />
                            {t('profile.friends.sendRequest')}
                          </>
                        )}
                      </button>
                      <button type="button" onClick={closeAddModal} className={secondaryButtonClassName}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSendRequestByCode} className="mt-6 space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-bd-ink dark:text-slate-200">
                        {t('profile.friends.friendCode')}
                      </label>
                      <input
                        type="text"
                        value={friendCode}
                        onChange={(e) => setFriendCode(e.target.value)}
                        placeholder="12345"
                        className={`${inputClassName} py-4 text-center font-mono text-2xl font-bold tracking-[0.34em]`}
                        required
                        maxLength={8}
                      />
                      <p className="mt-2 text-center text-xs text-bd-ink-muted dark:text-slate-400">
                        {t('profile.friends.friendCodeHint')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button type="submit" disabled={addLoading} className={`${primaryButtonClassName} flex-1`}>
                        {addLoading ? (
                          <>
                            <LoadingSpinner />
                            {t('common.loading')}
                          </>
                        ) : (
                          <>
                            <MailIcon />
                            {t('profile.friends.sendRequest')}
                          </>
                        )}
                      </button>
                      <button type="button" onClick={closeAddModal} className={secondaryButtonClassName}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="border-t border-bd-line bg-bd-card-warm/85 p-6 dark:border-slate-700 dark:bg-slate-900/70 sm:p-8 lg:border-l lg:border-t-0">
                <div className={`${tileClassName} p-5`}>
                  <p className={eyebrowClassName}>
                    {addMethod === 'link'
                      ? t('profile.friends.byProfileLink')
                      : t('profile.friends.byFriendCode')}
                  </p>
                  <h4 className="mt-3 text-lg font-bold text-bd-ink dark:text-white">
                    {t('profile.friends.sendRequest')}
                  </h4>
                  <p className="mt-2 text-sm text-bd-ink-muted dark:text-slate-400">
                    {addMethod === 'link'
                      ? t('profile.friends.profileLinkHint')
                      : t('profile.friends.friendCodeHint')}
                  </p>
                </div>

                {myFriendCode && session?.user?.emailVerified ? (
                  <div className={`${tileClassName} mt-4 p-5`}>
                    <p className={eyebrowClassName}>{t('profile.friends.myFriendCode')}</p>
                    <button
                      type="button"
                      onClick={copyFriendCode}
                      className={`${warmSurfaceClassName} mt-3 block w-full border-dashed px-4 py-4 text-center transition-colors hover:border-bd-lav-deep hover:bg-white dark:hover:bg-slate-900`}
                      title={t('profile.friends.copyCode')}
                      aria-label={t('profile.friends.copyCode')}
                    >
                      <span className="font-mono text-3xl font-black tracking-[0.28em] text-bd-ink dark:text-white">
                        {myFriendCode}
                      </span>
                    </button>
                    <div className="mt-4 flex flex-col gap-2">
                      <button type="button" onClick={copyFriendCode} className={`${primaryButtonClassName} w-full`}>
                        <CopyIcon />
                        {t('profile.friends.copyCode')}
                      </button>
                      <button
                        type="button"
                        onClick={copyProfileLink}
                        disabled={!myPublicProfileId}
                        className={`${secondaryButtonClassName} w-full`}
                      >
                        <LinkIcon />
                        {t('profile.friends.copyLink')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
