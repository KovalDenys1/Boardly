'use client'

import { type ReactNode, useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import LoadingSpinner from './LoadingSpinner'
import { buildPublicProfilePath, extractPublicProfileId } from '@/lib/public-profile'

interface Friend {
  id: string
  username: string | null
  avatar: string | null
  email: string
  publicProfileId: string | null
  friendshipId: string
  friendsSince: string
  presence?: 'offline' | 'online' | 'in_lobby' | 'in_game'
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

export default function Friends() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const router = useRouter()
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

  const loadFriends = useCallback(async () => {
    try {
      const res = await fetch('/api/friends')
      if (!res.ok) throw new Error('Failed to load friends')
      
      const data = await res.json()
      setFriends(data.friends || [])
      clientLogger.log('Friends loaded', { count: data.friends?.length })
    } catch (error) {
      clientLogger.error('Error loading friends:', error)
      showToast.error('profile.friends.errors.loadFailed')
    }
  }, [])

  const loadRequests = useCallback(async () => {
    try {
      // Fetch both received and sent requests in parallel
      const [receivedRes, sentRes] = await Promise.all([
        fetch('/api/friends/request?type=received'),
        fetch('/api/friends/request?type=sent')
      ])
      
      if (!receivedRes.ok || !sentRes.ok) {
        throw new Error('Failed to load requests')
      }
      
      const receivedData = await receivedRes.json()
      const sentData = await sentRes.json()
      
      setReceivedRequests(receivedData.requests || [])
      setSentRequests(sentData.requests || [])
      
      clientLogger.log('Friend requests loaded', {
        received: receivedData.requests?.length || 0,
        sent: sentData.requests?.length || 0
      })
    } catch (error) {
      clientLogger.error('Error loading requests:', error)
      showToast.error('profile.friends.errors.loadFailed')
    }
  }, [])

  const loadMyFriendCode = useCallback(async () => {
    // Check if email is verified
    if (!session?.user?.emailVerified) {
      clientLogger.warn('Email not verified, skipping friend code load')
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
  }, [session?.user?.emailVerified])

  const closeAddModal = useCallback(() => {
    setShowAddModal(false)
    setProfileLinkInput('')
    setFriendCode('')
    setAddMethod('link')
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        await Promise.all([loadFriends(), loadRequests(), loadMyFriendCode()])
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [loadFriends, loadRequests, loadMyFriendCode])

  useEffect(() => {
    // Auto-refresh only the active view to avoid unnecessary DB fan-out.
    const refreshInterval = setInterval(() => {
      if (activeTab === 'friends') {
        void loadFriends()
        return
      }

      void loadRequests()
    }, 60000)

    return () => clearInterval(refreshInterval)
  }, [activeTab, loadFriends, loadRequests])

  const handleSendRequest = useCallback(async (e: React.FormEvent) => {
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
        })
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
  }, [closeAddModal, loadRequests, profileLinkInput])

  const handleSendRequestByCode = useCallback(async (e: React.FormEvent) => {
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
          friendCode: cleanCode
        })
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
  }, [closeAddModal, friendCode, loadRequests])

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
    try {
      const res = await fetch(`/api/friends/request/${requestId}/accept`, {
        method: 'POST'
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
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    try {
      const res = await fetch(`/api/friends/request/${requestId}/reject`, {
        method: 'POST'
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
    }
  }

  const handleRemoveFriend = async (friendshipId: string, username: string | null) => {
    if (!confirm(t('profile.friends.confirmRemove', { username: username || 'this friend' }))) {
      return
    }

    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE'
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
      day: 'numeric'
    })
  }

  const resolvePresence = (friend: Friend): 'offline' | 'online' | 'in_lobby' | 'in_game' => {
    return friend.presence || 'offline'
  }

  const presencePriority: Record<'offline' | 'online' | 'in_lobby' | 'in_game', number> = {
    in_game: 0,
    in_lobby: 1,
    online: 2,
    offline: 3,
  }

  const openFriendPublicProfile = useCallback(
    (friend: Friend) => {
      if (!friend.publicProfileId) {
        return
      }

      router.push(buildPublicProfilePath(friend.publicProfileId))
    },
    [router]
  )

  const primarySurfaceClassName =
    'rounded-3xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60'
  const secondarySurfaceClassName =
    'rounded-2xl border border-slate-200/70 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-800/60'
  const tertiarySurfaceClassName =
    'rounded-2xl border border-slate-200/70 bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/65'

  const renderAvatar = (
    name: string,
    avatar: string | null | undefined,
    fallbackTextClassName = 'text-xl font-bold'
  ) => {
    if (avatar) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={name}
          className="h-full w-full object-cover"
        />
      )
    }

    return (
      <span className={fallbackTextClassName}>
        {name.charAt(0).toUpperCase() || '?'}
      </span>
    )
  }

  const renderEmptyState = ({
    icon,
    title,
    description,
    action,
  }: {
    icon: string
    title: string
    description: string
    action?: ReactNode
  }) => (
    <div className={`${primarySurfaceClassName} overflow-hidden`}>
      <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50/70 px-6 py-5 dark:border-slate-700/50 dark:from-slate-900/70 dark:to-slate-800/70 sm:px-8">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-[22px] border border-slate-200/70 bg-white text-4xl shadow-sm dark:border-slate-700/60 dark:bg-slate-800">
          {icon}
        </div>
        <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h3>
        <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400 sm:text-base">
          {description}
        </p>
      </div>
      {action ? (
        <div className="px-6 py-5 sm:px-8">
          {action}
        </div>
      ) : null}
    </div>
  )

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Email Verification Required Notice */}
      {!session?.user?.emailVerified && (
        <div className="overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/5">
          <div className="border-l-4 border-amber-400 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-2xl shadow-sm dark:bg-amber-500/15">
                ⚠️
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-amber-900 dark:text-amber-200">
                  {t('profile.friends.emailVerificationRequired')}
                </h3>
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300/90">
                  {t('profile.friends.emailVerificationRequiredDesc')}
                </p>
                <a
                  href="/auth/verify-email"
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
                >
                  <span>📧</span>
                  {t('profile.friends.verifyEmail')}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        {myFriendCode && session?.user?.emailVerified ? (
          <div className={`${primarySurfaceClassName} relative overflow-hidden`}>
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500" />
            <div className="p-5 sm:p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    {t('profile.friends.myFriendCode')}
                  </p>
                  <button
                    type="button"
                    onClick={copyFriendCode}
                    className={`${secondarySurfaceClassName} mt-4 block w-full border-dashed p-4 transition-colors hover:border-blue-300/80 hover:bg-blue-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 dark:hover:border-blue-500/40 dark:hover:bg-slate-800/80 sm:p-5`}
                    title={t('profile.friends.copyCode')}
                    aria-label={t('profile.friends.copyCode')}
                  >
                    <p className="text-center font-mono text-3xl font-black tracking-[0.32em] text-slate-900 dark:text-white sm:text-4xl">
                      {myFriendCode}
                    </p>
                  </button>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    {t('profile.friends.shareCodeHint')}
                  </p>
                </div>
                <div className="lg:self-stretch">
                  <div className="flex h-full items-center">
                    <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-[220px] lg:grid-cols-1">
                      <button
                        onClick={copyFriendCode}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
                        title={t('profile.friends.copyCode')}
                      >
                        <span>📋</span>
                        {t('profile.friends.copyCode')}
                      </button>
                      <button
                        onClick={copyProfileLink}
                        disabled={!myPublicProfileId}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-white dark:hover:bg-slate-900"
                        title={t('profile.friends.copyLink')}
                      >
                        <span>🔗</span>
                        {t('profile.friends.copyLink')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={`${primarySurfaceClassName} p-5 sm:p-6`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {t('profile.friends.myFriendCode')}
            </p>
            <h3 className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('profile.friends.addFriend')}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {t('profile.friends.shareCodeHint')}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className={`${primarySurfaceClassName} p-1.5 lg:flex-1`}>
          <div className="flex gap-1">
            {([
              { id: 'friends', icon: '👥', label: t('profile.friends.tabs.friends'), count: friends.length },
              { id: 'requests', icon: '📬', label: t('profile.friends.tabs.requests'), count: receivedRequests.length },
              { id: 'sent', icon: '📤', label: t('profile.friends.tabs.sent'), count: sentRequests.length },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-blue-400 dark:ring-slate-700/70'
                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                }`}
              >
                <span aria-hidden className="text-base">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span
                  className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 lg:min-w-[220px]"
        >
          <span aria-hidden>➕</span>
          {t('profile.friends.addFriend')}
        </button>
      </div>

      {/* Friends Tab */}
      {activeTab === 'friends' && (
        <div className="space-y-4">
          {friends.length === 0 ? (
            renderEmptyState({
              icon: '👥',
              title: t('profile.friends.noFriends'),
              description: t('profile.friends.noFriendsDescription'),
              action: (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
                >
                  <span>➕</span>
                  {t('profile.friends.addFirstFriend')}
                </button>
              ),
            })
          ) : (
            <div className="grid gap-4">
              {[...friends]
                .sort((a, b) => {
                  const aPresence = resolvePresence(a)
                  const bPresence = resolvePresence(b)
                  const priorityDiff = presencePriority[aPresence] - presencePriority[bPresence]
                  if (priorityDiff !== 0) return priorityDiff
                  const aName = a.username || a.email
                  const bName = b.username || b.email
                  return aName.localeCompare(bName)
                })
                .map((friend) => {
                  const presence = resolvePresence(friend)
                  const isOnline = presence !== 'offline'
                  const presenceBadge =
                    presence === 'in_game'
                      ? { label: 'In game', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' }
                      : presence === 'in_lobby'
                        ? { label: 'In lobby', className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' }
                        : presence === 'online'
                          ? { label: 'Online', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
                          : null
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
                      className={`${primarySurfaceClassName} group relative overflow-hidden ${
                        friend.publicProfileId
                          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400/70 dark:hover:border-blue-500/40'
                          : ''
                      }`}
                    >
                      <div
                        className={`absolute inset-y-0 left-0 w-1 ${
                          isOnline ? 'bg-gradient-to-b from-emerald-400 to-cyan-500' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />

                      <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                          <div className="relative shrink-0">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg ring-4 ring-white dark:ring-slate-800">
                              {renderAvatar(friend.username || friend.email, friend.avatar)}
                            </div>
                            {isOnline && (
                              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm dark:border-slate-900">
                                <div className="h-2 w-2 rounded-full bg-white" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                                {friend.username || friend.email}
                              </h4>
                              {presenceBadge && (
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${presenceBadge.className}`}>
                                  {presenceBadge.label}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1.5">
                                <span>🤝</span>
                                {formatDate(friend.friendsSince)}
                              </span>
                            </div>

                            {friend.statistics && friend.statistics.totalGames > 0 && (
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                                  🎮 {friend.statistics.totalGames}
                                </span>
                                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  🏆 {friend.statistics.totalWins}
                                </span>
                                <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                                  📊 {Math.round(friend.statistics.winRate)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleRemoveFriend(friend.friendshipId, friend.username)
                          }}
                          className="shrink-0 rounded-2xl p-2.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                          title={t('profile.friends.remove')}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* Received Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {receivedRequests.length === 0 ? (
            renderEmptyState({
              icon: '📬',
              title: t('profile.friends.noRequests'),
              description: t('profile.friends.noRequestsDescription'),
            })
          ) : (
            <div className="grid gap-4">
              {receivedRequests.map((request) => (
                <div
                  key={request.id}
                  className={`${primarySurfaceClassName} relative overflow-hidden`}
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 to-green-500" />

                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="relative shrink-0">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg ring-4 ring-white dark:ring-slate-800">
                          {renderAvatar(request.sender?.username || 'Unknown', request.sender?.avatar, 'text-2xl font-bold')}
                        </div>
                        <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-xs font-bold text-white shadow-sm dark:border-slate-900">
                          ✓
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                          {request.sender?.username || 'Unknown'}
                        </h4>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                          <span>📅</span>
                          {formatDate(request.createdAt)}
                        </p>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <button
                            onClick={() => handleAcceptRequest(request.id)}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
                          >
                            <span>✓</span>
                            {t('profile.friends.accept')}
                          </button>
                          <button
                            onClick={() => handleRejectRequest(request.id)}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-900"
                          >
                            <span>✗</span>
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

      {/* Sent Requests Tab */}
      {activeTab === 'sent' && (
        <div className="space-y-4">
          {sentRequests.length === 0 ? (
            renderEmptyState({
              icon: '📤',
              title: t('profile.friends.noSentRequests'),
              description: t('profile.friends.noSentRequestsDescription'),
            })
          ) : (
            <div className="grid gap-4">
              {sentRequests.map((request) => (
                <div
                  key={request.id}
                  className={`${primarySurfaceClassName} relative overflow-hidden`}
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" />

                  <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="relative shrink-0">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg ring-4 ring-white dark:ring-slate-800">
                          {renderAvatar(request.receiver?.username || 'Unknown', request.receiver?.avatar)}
                        </div>
                        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-amber-500 shadow-sm dark:border-slate-900">
                          <span className="text-xs">⏱️</span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                          {request.receiver?.username || 'Unknown'}
                        </h4>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                          <span>📅</span>
                          {formatDate(request.createdAt)}
                        </p>
                      </div>

                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      {t('profile.friends.pending')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Friend Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/60 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/95">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500" />

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                      {t('profile.friends.title')}
                    </p>
                    <h3 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {t('profile.friends.addFriend')}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {t('profile.friends.addFriendDescription')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label={t('common.cancel')}
                  >
                    ×
                  </button>
                </div>

                <div className={`${secondarySurfaceClassName} mt-6 p-1.5`}>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setAddMethod('link')}
                      className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                        addMethod === 'link'
                          ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-700/70'
                          : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200'
                      }`}
                    >
                      <span>🔗</span>
                      {t('profile.friends.byProfileLink')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddMethod('code')}
                      className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                        addMethod === 'code'
                          ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-700/70'
                          : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200'
                      }`}
                    >
                      <span>🔢</span>
                      {t('profile.friends.byFriendCode')}
                    </button>
                  </div>
                </div>

                {addMethod === 'link' ? (
                  <form onSubmit={handleSendRequest} className="mt-6 space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {t('profile.friends.profileLink')}
                      </label>
                      <input
                        type="text"
                        value={profileLinkInput}
                        onChange={(e) => setProfileLinkInput(e.target.value)}
                        placeholder={t('profile.friends.profileLinkPlaceholder')}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-500/15"
                        required
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {t('profile.friends.profileLinkHint')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="submit"
                        disabled={addLoading}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {addLoading ? (
                          <>
                            <LoadingSpinner />
                            {t('common.loading')}
                          </>
                        ) : (
                          <>
                            <span>📨</span>
                            {t('profile.friends.sendRequest')}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={closeAddModal}
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-900"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSendRequestByCode} className="mt-6 space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {t('profile.friends.friendCode')}
                      </label>
                      <input
                        type="text"
                        value={friendCode}
                        onChange={(e) => setFriendCode(e.target.value)}
                        placeholder="12345"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center font-mono text-2xl font-bold tracking-[0.34em] text-slate-900 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-500/15"
                        required
                        maxLength={8}
                      />
                      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                        {t('profile.friends.friendCodeHint')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="submit"
                        disabled={addLoading}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {addLoading ? (
                          <>
                            <LoadingSpinner />
                            {t('common.loading')}
                          </>
                        ) : (
                          <>
                            <span>📨</span>
                            {t('profile.friends.sendRequest')}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={closeAddModal}
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-900"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="border-t border-slate-200/70 bg-slate-50/80 p-6 dark:border-slate-700/60 dark:bg-slate-900/70 sm:p-8 lg:border-l lg:border-t-0">
                <div className={tertiarySurfaceClassName}>
                  <div className="p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                      {addMethod === 'link'
                        ? t('profile.friends.byProfileLink')
                        : t('profile.friends.byFriendCode')}
                    </p>
                    <h4 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
                      {t('profile.friends.sendRequest')}
                    </h4>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {addMethod === 'link'
                        ? t('profile.friends.profileLinkHint')
                        : t('profile.friends.friendCodeHint')}
                    </p>
                  </div>
                </div>

                {myFriendCode && session?.user?.emailVerified ? (
                  <div className={`${tertiarySurfaceClassName} mt-4`}>
                    <div className="p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                        {t('profile.friends.myFriendCode')}
                      </p>
                      <button
                        type="button"
                        onClick={copyFriendCode}
                        className={`${secondarySurfaceClassName} mt-3 block w-full border-dashed px-4 py-4 text-center transition-colors hover:border-blue-300/80 hover:bg-blue-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 dark:hover:border-blue-500/40 dark:hover:bg-slate-800/80`}
                        title={t('profile.friends.copyCode')}
                        aria-label={t('profile.friends.copyCode')}
                      >
                        <span className="font-mono text-3xl font-black tracking-[0.28em] text-slate-900 dark:text-white">
                          {myFriendCode}
                        </span>
                      </button>
                      <div className="mt-4 grid gap-2">
                        <button
                          type="button"
                          onClick={copyFriendCode}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
                        >
                          <span>📋</span>
                          {t('profile.friends.copyCode')}
                        </button>
                        <button
                          type="button"
                          onClick={copyProfileLink}
                          disabled={!myPublicProfileId}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <span>🔗</span>
                          {t('profile.friends.copyLink')}
                        </button>
                      </div>
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
