'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'react-i18next'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import LoadingSpinner from './LoadingSpinner'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'

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
  const [requestMessage, setRequestMessage] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [socket, setSocket] = useState<Socket | null>(null)

  // Setup Socket.IO for online status
  useEffect(() => {
    if (!session?.user?.id) {
      clientLogger.warn('No session available for online status')
      return
    }

    const socketUrl = getBrowserSocketUrl()
    const token = session.user.id
    
    clientLogger.log('🔌 Connecting socket for online status', { socketUrl })

    const newSocket = io(socketUrl, {
      auth: { token, isGuest: false },
      transports: ['polling', 'websocket'],
    })

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

    return () => {
      clientLogger.log('🧹 Cleaning up socket connection')
      newSocket.close()
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
      const res = await fetch('/api/friends/request')
      if (!res.ok) throw new Error('Failed to load requests')
      
      const data = await res.json()
      setReceivedRequests(data.receivedRequests || [])
      setSentRequests(data.sentRequests || [])
      clientLogger.log('Friend requests loaded', {
        received: data.receivedRequests?.length,
        sent: data.sentRequests?.length
      })
    } catch (error) {
      clientLogger.error('Error loading requests:', error)
      showToast.error('friends.errors.loadFailed')
    }
  }, [])

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
  }, [loadFriends, loadRequests])

  const loadMyFriendCode = async () => {
    try {
      const res = await fetch('/api/user/friend-code')
      if (!res.ok) throw new Error('Failed to load friend code')
      
      const data = await res.json()
      setMyFriendCode(data.friendCode || '')
      clientLogger.log('My friend code loaded', { code: data.friendCode })
    } catch (error) {
      clientLogger.error('Error loading friend code:', error)
    }
  }

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
          receiverUsername: searchUsername.trim(),
          message: requestMessage.trim() || null
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send request')
      }

      showToast.success('friends.requestSent')
      setSearchUsername('')
      setRequestMessage('')
      setShowAddModal(false)
      await loadRequests()
    } catch (error: any) {
      clientLogger.error('Error sending request:', error)
      showToast.error('errors.generic', undefined, { message: error.message })
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
          friendCode: cleanCode,
          message: requestMessage.trim() || null
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send request')
      }

      showToast.success('friends.requestSent')
      setFriendCode('')
      setRequestMessage('')
      setShowAddModal(false)
      await loadRequests()
    } catch (error: any) {
      clientLogger.error('Error sending request by code:', error)
      showToast.error('errors.generic', undefined, { message: error.message })
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
    } catch (error: any) {
      clientLogger.error('Error accepting request:', error)
      showToast.error('errors.generic', undefined, { message: error.message })
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
    } catch (error: any) {
      clientLogger.error('Error rejecting request:', error)
      showToast.error('errors.generic', undefined, { message: error.message })
    }
  }

  const handleRemoveFriend = async (friendshipId: string, username: string | null) => {
    if (!confirm(t('friends.confirmRemove', { username: username || 'this friend' }))) {
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
    } catch (error: any) {
      clientLogger.error('Error removing friend:', error)
      showToast.error('errors.generic', undefined, { message: error.message })
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
      {/* My Friend Code Section */}
      {myFriendCode && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            {t('friends.myFriendCode')}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg p-3 border-2 border-blue-300 dark:border-blue-600">
              <div className="text-2xl font-mono font-bold text-center tracking-wider text-blue-600 dark:text-blue-400">
                {myFriendCode}
              </div>
            </div>
            <button
              onClick={copyFriendCode}
              className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              title={t('friends.copyCode')}
            >
              📋
            </button>
            <button
              onClick={copyProfileLink}
              className="p-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
              title={t('friends.copyLink')}
            >
              🔗
            </button>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
            {t('friends.shareCodeHint')}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('friends')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'friends'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          {t('friends.tabs.friends')} ({friends.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'requests'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          {t('friends.tabs.requests')} 
          {receivedRequests.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {receivedRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'sent'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          {t('friends.tabs.sent')} ({sentRequests.length})
        </button>
      </div>

      {/* Add Friend Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
        >
          ➕ {t('friends.addFriend')}
        </button>
      </div>

      {/* Friends Tab */}
      {activeTab === 'friends' && (
        <div className="space-y-3">
          {friends.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg mb-2">👥</p>
              <p>{t('friends.noFriends')}</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t('friends.addFirstFriend')}
              </button>
            </div>
          ) : (
            // Sort friends: online first, then by username
            [...friends]
              .sort((a, b) => {
                const aOnline = onlineUsers.has(a.id)
                const bOnline = onlineUsers.has(b.id)
                
                // Online friends first
                if (aOnline && !bOnline) return -1
                if (!aOnline && bOnline) return 1
                
                // If both online or both offline, sort alphabetically
                const aName = a.username || a.email
                const bName = b.username || b.email
                return aName.localeCompare(bName)
              })
              .map((friend) => (
              <div
                key={friend.friendshipId}
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                      {friend.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    {/* Online Status Indicator */}
                    {onlineUsers.has(friend.id) && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {friend.username || friend.email}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {t('friends.friendsSince', { date: formatDate(friend.friendsSince) })}
                    </div>
                    {friend.statistics && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {friend.statistics.totalGames} {t('friends.games')} • 
                        {friend.statistics.totalWins} {t('friends.wins')} • 
                        {Math.round(friend.statistics.winRate)}% {t('friends.winRate')}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFriend(friend.friendshipId, friend.username)}
                  className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  {t('friends.remove')}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Received Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-3">
          {receivedRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg mb-2">📬</p>
              <p>{t('friends.noRequests')}</p>
            </div>
          ) : (
            receivedRequests.map((request) => (
              <div
                key={request.id}
                className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg">
                      {request.sender?.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {request.sender?.username || 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(request.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
                {request.message && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 italic">
                    "{request.message}"
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    ✓ {t('friends.accept')}
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.id)}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                  >
                    ✗ {t('friends.reject')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sent Requests Tab */}
      {activeTab === 'sent' && (
        <div className="space-y-3">
          {sentRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg mb-2">📤</p>
              <p>{t('friends.noSentRequests')}</p>
            </div>
          ) : (
            sentRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-lg">
                    {request.receiver?.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {request.receiver?.username || 'Unknown'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {t('friends.sentOn', { date: formatDate(request.createdAt) })}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full">
                  {t('friends.pending')}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Friend Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              {t('friends.addFriend')}
            </h3>

            {/* Toggle between username and friend code */}
            <div className="flex gap-2 mb-4 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setAddByCode(false)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  !addByCode
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                📧 {t('friends.byUsername')}
              </button>
              <button
                type="button"
                onClick={() => setAddByCode(true)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  addByCode
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                🔢 {t('friends.byFriendCode')}
              </button>
            </div>

            {!addByCode ? (
              <form onSubmit={handleSendRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('friends.username')}
                  </label>
                  <input
                    type="text"
                    value={searchUsername}
                    onChange={(e) => setSearchUsername(e.target.value)}
                    placeholder={t('friends.usernamePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('friends.message')} ({t('common.optional')})
                  </label>
                  <textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder={t('friends.messagePlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                    maxLength={200}
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {requestMessage.length}/200
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="flex-1 btn btn-primary disabled:opacity-50"
                  >
                    {addLoading ? t('common.loading') : t('friends.sendRequest')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false)
                      setSearchUsername('')
                      setRequestMessage('')
                      setFriendCode('')
                      setAddByCode(false)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSendRequestByCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('friends.friendCode')}
                  </label>
                  <input
                    type="text"
                    value={friendCode}
                    onChange={(e) => setFriendCode(e.target.value)}
                    placeholder="12345"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-center text-lg tracking-wider"
                    required
                    maxLength={8}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('friends.friendCodeHint')}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('friends.message')} ({t('common.optional')})
                  </label>
                  <textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder={t('friends.messagePlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                    maxLength={200}
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {requestMessage.length}/200
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="flex-1 btn btn-primary disabled:opacity-50"
                  >
                    {addLoading ? t('common.loading') : t('friends.sendRequest')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false)
                      setSearchUsername('')
                      setRequestMessage('')
                      setFriendCode('')
                      setAddByCode(false)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
