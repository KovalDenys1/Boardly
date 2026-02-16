'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import LoadingSpinner from './LoadingSpinner'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'

interface Friend {
  id: string
  username: string | null
  avatar: string | null
  email: string
  friendshipId: string
  friendsSince: string
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

export default function Friends() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<TabType>('friends')
  const [friends, setFriends] = useState<Friend[]>([])
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([])
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchUsername, setSearchUsername] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [myFriendCode, setMyFriendCode] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addByCode, setAddByCode] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [socket, setSocket] = useState<Socket | null>(null)

  // Setup Socket.IO for online status
  useEffect(() => {
    if (!session?.user?.id) {
      clientLogger.warn('No session available for online status')
      return
    }

    let isMounted = true
    let activeSocket: Socket | null = null

    const connectSocket = async () => {
      const socketUrl = getBrowserSocketUrl()
      const socketAuth = await resolveSocketClientAuth({ isGuest: false })

      if (!socketAuth) {
        clientLogger.warn('Skipping online status socket connection: auth payload unavailable')
        return
      }

      if (!isMounted) {
        return
      }

      clientLogger.log('🔌 Connecting socket for online status', { socketUrl })

      const newSocket = io(socketUrl, {
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
        transports: ['polling', 'websocket'],
      })
      activeSocket = newSocket

      newSocket.on('connect', () => {
        clientLogger.log('✅ Connected to socket for online status')
      })

      newSocket.on('online-users', (data: { userIds: string[] }) => {
        setOnlineUsers(new Set(data.userIds))
        clientLogger.log('👥 Online users received', { count: data.userIds.length })
      })

      newSocket.on('user-online', (data: { userId: string }) => {
        setOnlineUsers(prev => new Set(prev).add(data.userId))
        clientLogger.log('🟢 User came online', { userId: data.userId })
      })

      newSocket.on('user-offline', (data: { userId: string }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev)
          next.delete(data.userId)
          return next
        })
        clientLogger.log('⚫ User went offline', { userId: data.userId })
      })

      newSocket.on('disconnect', () => {
        clientLogger.log('🔌 Disconnected from socket')
      })

      newSocket.on('connect_error', (error) => {
        clientLogger.error('❌ Socket connection error', { error: error.message })
      })

      setSocket(newSocket)
    }

    void connectSocket()

    return () => {
      isMounted = false
      clientLogger.log('🧹 Cleaning up socket connection')
      activeSocket?.close()
    }
  }, [session?.user?.id])

  const loadFriends = useCallback(async () => {
    try {
      const res = await fetch('/api/friends')
      if (!res.ok) throw new Error('Failed to load friends')
      
      const data = await res.json()
      setFriends(data.friends || [])
      clientLogger.log('Friends loaded', { count: data.friends?.length })
    } catch (error) {
      clientLogger.error('Error loading friends:', error)
      showToast.error('friends.errors.loadFailed')
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
      showToast.error('friends.errors.loadFailed')
    }
  }, [])

  const loadMyFriendCode = useCallback(async () => {
    // Check if email is verified
    if (!session?.user?.emailVerified) {
      clientLogger.warn('Email not verified, skipping friend code load')
      setMyFriendCode('')
      return
    }

    try {
      const res = await fetch('/api/user/friend-code')
      if (!res.ok) throw new Error('Failed to load friend code')
      
      const data = await res.json()
      setMyFriendCode(data.friendCode || '')
      clientLogger.log('My friend code loaded', { code: data.friendCode })
    } catch (error) {
      clientLogger.error('Error loading friend code:', error)
    }
  }, [session?.user?.emailVerified])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        loadFriends(), 
        loadRequests(),
        loadMyFriendCode()
      ])
      setLoading(false)
    }
    loadData()

    // Auto-refresh every 30 seconds to sync friends list
    const refreshInterval = setInterval(() => {
      loadFriends()
      loadRequests()
    }, 30000)

    return () => clearInterval(refreshInterval)
  }, [loadFriends, loadRequests, loadMyFriendCode])

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!searchUsername.trim()) {
      showToast.error('friends.errors.usernameRequired')
      return
    }

    setAddLoading(true)
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverUsername: searchUsername.trim()
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send request')
      }

      showToast.success('friends.requestSent')
      setSearchUsername('')
      setShowAddModal(false)
      await loadRequests()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error sending request:', err)
      showToast.error('errors.generic', undefined, { message: err.message })
    } finally {
      setAddLoading(false)
    }
  }

  const handleSendRequestByCode = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const cleanCode = friendCode.replace(/\s/g, '')
    if (!cleanCode || !/^\d{5}$/.test(cleanCode)) {
      showToast.error('friends.errors.invalidFriendCode')
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

      showToast.success('friends.requestSent')
      setFriendCode('')
      setShowAddModal(false)
      await loadRequests()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error sending request by code:', err)
      showToast.error('errors.generic', undefined, { message: err.message })
    } finally {
      setAddLoading(false)
    }
  }

  const copyFriendCode = async () => {
    if (!myFriendCode) return
    
    try {
      await navigator.clipboard.writeText(myFriendCode)
      showToast.success('friends.friendCodeCopied')
    } catch (error) {
      clientLogger.error('Error copying friend code:', error)
      showToast.error('errors.generic')
    }
  }

  const copyProfileLink = async () => {
    if (!myFriendCode) return
    
    try {
      const profileUrl = `${window.location.origin}/add-friend/${myFriendCode}`
      await navigator.clipboard.writeText(profileUrl)
      showToast.success('friends.profileLinkCopied')
    } catch (error) {
      clientLogger.error('Error copying profile link:', error)
      showToast.error('errors.generic')
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

      showToast.success('friends.requestAccepted')
      await Promise.all([loadFriends(), loadRequests()])
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error accepting request:', err)
      showToast.error('errors.generic', undefined, { message: err.message })
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

      showToast.success('friends.requestRejected')
      await loadRequests()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error rejecting request:', err)
      showToast.error('errors.generic', undefined, { message: err.message })
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

      showToast.success('friends.friendRemoved')
      await loadFriends()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      clientLogger.error('Error removing friend:', err)
      showToast.error('errors.generic', undefined, { message: err.message })
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
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">
                {t('profile.friends.emailVerificationRequired')}
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                {t('profile.friends.emailVerificationRequiredDesc')}
              </p>
              <a
                href="/auth/verify-email"
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
              >
                <span>📧</span>
                {t('profile.friends.verifyEmail')}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* My Friend Code Section - Improved Design */}
      {myFriendCode && session?.user?.emailVerified && (
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl p-[2px]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                  {t('profile.friends.myFriendCode')}
                </h3>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyFriendCode}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
                  title={t('profile.friends.copyCode')}
                >
                  <span className="flex items-center gap-1.5">
                    📋 {t('profile.friends.copyCode')}
                  </span>
                </button>
                <button
                  onClick={copyProfileLink}
                  className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
                  title={t('profile.friends.copyLink')}
                >
                  <span className="flex items-center gap-1.5">
                    🔗 {t('profile.friends.copyLink')}
                  </span>
                </button>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 border-2 border-dashed border-blue-300 dark:border-blue-600">
              <div className="text-4xl font-mono font-bold text-center tracking-[0.5em] text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                {myFriendCode}
              </div>
            </div>
            
            <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-3 flex items-center justify-center gap-1">
              <span>✨</span>
              {t('profile.friends.shareCodeHint')}
            </p>
          </div>
        </div>
      )}

      {/* Action Bar with Tabs and Add Button */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-1">
        <div className="flex items-center justify-between gap-2">
          {/* Tabs */}
          <div className="flex gap-1 flex-1">
            <button
              onClick={() => setActiveTab('friends')}
              className={`flex-1 px-4 py-2.5 font-medium transition-all rounded-lg relative ${
                activeTab === 'friends'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">👥</span>
                <span className="hidden sm:inline">{t('profile.friends.tabs.friends')}</span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  activeTab === 'friends'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {friends.length}
                </span>
              </span>
            </button>
            
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 px-4 py-2.5 font-medium transition-all rounded-lg relative ${
                activeTab === 'requests'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">📬</span>
                <span className="hidden sm:inline">{t('profile.friends.tabs.requests')}</span>
                {receivedRequests.length > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full animate-pulse shadow-lg">
                    {receivedRequests.length}
                  </span>
                )}
              </span>
            </button>
            
            <button
              onClick={() => setActiveTab('sent')}
              className={`flex-1 px-4 py-2.5 font-medium transition-all rounded-lg ${
                activeTab === 'sent'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">📤</span>
                <span className="hidden sm:inline">{t('profile.friends.tabs.sent')}</span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  activeTab === 'sent'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {sentRequests.length}
                </span>
              </span>
            </button>
          </div>

          {/* Add Friend Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md whitespace-nowrap"
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">➕</span>
              <span className="hidden sm:inline">{t('profile.friends.addFriend')}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Friends Tab */}
      {activeTab === 'friends' && (
        <div className="space-y-3">
          {friends.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center">
                <span className="text-5xl">👥</span>
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                {t('profile.friends.noFriends')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t('profile.friends.noFriendsDescription')}
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-medium rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg"
              >
                <span className="flex items-center gap-2">
                  <span>➕</span>
                  {t('profile.friends.addFirstFriend')}
                </span>
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {[...friends]
                .sort((a, b) => {
                  const aOnline = onlineUsers.has(a.id)
                  const bOnline = onlineUsers.has(b.id)
                  if (aOnline && !bOnline) return -1
                  if (!aOnline && bOnline) return 1
                  const aName = a.username || a.email
                  const bName = b.username || b.email
                  return aName.localeCompare(bName)
                })
                .map((friend) => {
                  const isOnline = onlineUsers.has(friend.id)
                  return (
                    <div
                      key={friend.friendshipId}
                      className="group relative overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-xl transition-all hover:scale-[1.02] hover:border-blue-300 dark:hover:border-blue-600"
                    >
                      {/* Online Status Bar */}
                      {isOnline && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-400 animate-pulse"></div>
                      )}
                      
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          {/* Avatar with online indicator */}
                          <div className="relative flex-shrink-0">
                            <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl shadow-lg ring-2 ${
                              isOnline ? 'ring-green-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : 'ring-transparent'
                            }`}>
                              {friend.username?.[0]?.toUpperCase() || '?'}
                            </div>
                            {isOnline && (
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-3 border-white dark:border-gray-800 rounded-full flex items-center justify-center shadow-lg">
                                <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                              </div>
                            )}
                          </div>

                          {/* User Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate text-lg">
                                {friend.username || friend.email}
                              </h4>
                              {isOnline && (
                                <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                                  Online
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                              <span className="flex items-center gap-1">
                                <span>🤝</span>
                                {formatDate(friend.friendsSince)}
                              </span>
                            </div>

                            {/* Statistics */}
                            {friend.statistics && friend.statistics.totalGames > 0 && (
                              <div className="flex items-center gap-3 text-xs">
                                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-medium">
                                  🎮 {friend.statistics.totalGames}
                                </span>
                                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full font-medium">
                                  🏆 {friend.statistics.totalWins}
                                </span>
                                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full font-medium">
                                  📊 {Math.round(friend.statistics.winRate)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => handleRemoveFriend(friend.friendshipId, friend.username)}
                          className="flex-shrink-0 ml-4 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
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
        <div className="space-y-3">
          {receivedRequests.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center">
                <span className="text-5xl">📬</span>
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                {t('profile.friends.noRequests')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {t('profile.friends.noRequestsDescription')}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {receivedRequests.map((request) => (
                <div
                  key={request.id}
                  className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border-2 border-green-200 dark:border-green-800 rounded-xl shadow-sm hover:shadow-md transition-all"
                >
                  {/* New Request Indicator */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-400"></div>
                  
                  <div className="p-5">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="relative flex-shrink-0">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                          {request.sender?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md">
                          ✓
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">
                          {request.sender?.username || 'Unknown'}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <span>📅</span>
                          {formatDate(request.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptRequest(request.id)}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <span>✓</span>
                          {t('profile.friends.accept')}
                        </span>
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request.id)}
                        className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-all hover:scale-105 active:scale-95"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <span>✗</span>
                          {t('profile.friends.reject')}
                        </span>
                      </button>
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
        <div className="space-y-3">
          {sentRequests.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-orange-100 to-yellow-100 dark:from-orange-900/30 dark:to-yellow-900/30 rounded-full flex items-center justify-center">
                <span className="text-5xl">📤</span>
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                {t('profile.friends.noSentRequests')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {t('profile.friends.noSentRequestsDescription')}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {sentRequests.map((request) => (
                <div
                  key={request.id}
                  className="group relative overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-lg transition-all hover:border-orange-300 dark:hover:border-orange-600"
                >
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                          {request.receiver?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-yellow-500 border-2 border-white dark:border-gray-800 rounded-full flex items-center justify-center">
                          <span className="text-xs">⏱️</span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate text-lg mb-1">
                          {request.receiver?.username || 'Unknown'}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <span>📅</span>
                          {formatDate(request.createdAt)}
                        </p>
                      </div>

                      <span className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full flex items-center gap-1.5 shadow-sm">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                        {t('profile.friends.pending')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Friend Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full transform transition-all animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <span>👋</span>
                {t('profile.friends.addFriend')}
              </h3>
              <p className="text-blue-100 text-sm mt-2">
                {t('profile.friends.addFriendDescription')}
              </p>
            </div>

            <div className="p-6">
              {/* Toggle between username and friend code */}
              <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-700/50 p-1.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAddByCode(false)}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                    !addByCode
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-md scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <span className="text-lg">📧</span>
                    {t('profile.friends.byUsername')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddByCode(true)}
                  className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                    addByCode
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-md scale-105'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <span className="text-lg">🔢</span>
                    {t('profile.friends.byFriendCode')}
                  </span>
                </button>
              </div>

              {!addByCode ? (
                <form onSubmit={handleSendRequest} className="space-y-5">
                  <div>
                    <label className="flex text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 items-center gap-2">
                      <span>👤</span>
                      {t('profile.friends.username')}
                    </label>
                    <input
                      type="text"
                      value={searchUsername}
                      onChange={(e) => setSearchUsername(e.target.value)}
                      placeholder={t('profile.friends.usernamePlaceholder')}
                      className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={addLoading}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {addLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <LoadingSpinner />
                          {t('common.loading')}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <span>📨</span>
                          {t('profile.friends.sendRequest')}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false)
                        setSearchUsername('')
                        setFriendCode('')
                        setAddByCode(false)
                      }}
                      className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-all hover:scale-105 active:scale-95"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSendRequestByCode} className="space-y-5">
                  <div>
                    <label className="flex text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 items-center gap-2">
                      <span>🔑</span>
                      {t('profile.friends.friendCode')}
                    </label>
                    <input
                      type="text"
                      value={friendCode}
                      onChange={(e) => setFriendCode(e.target.value)}
                      placeholder="12345"
                      className="w-full px-4 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-center text-2xl tracking-[0.5em] focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      required
                      maxLength={8}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                      {t('profile.friends.friendCodeHint')}
                    </p>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={addLoading}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {addLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <LoadingSpinner />
                          {t('common.loading')}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <span>📨</span>
                          {t('profile.friends.sendRequest')}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false)
                        setSearchUsername('')
                        setFriendCode('')
                        setAddByCode(false)
                      }}
                      className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-all hover:scale-105 active:scale-95"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
