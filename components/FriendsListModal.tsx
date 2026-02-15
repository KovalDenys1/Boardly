'use client'

import { useState, useEffect } from 'react'
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
}

interface FriendsListModalProps {
  isOpen: boolean
  onClose: () => void
  onInvite: (friendIds: string[]) => Promise<void>
  lobbyCode: string
}

export default function FriendsListModal({ 
  isOpen, 
  onClose, 
  onInvite,
  lobbyCode 
}: FriendsListModalProps) {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [socket, setSocket] = useState<Socket | null>(null)

  // Setup socket connection for online status
  useEffect(() => {
    if (!isOpen || !session?.user?.id) return

    let isMounted = true
    let activeSocket: Socket | null = null

    const connectSocket = async () => {
      const socketUrl = getBrowserSocketUrl()
      const socketAuth = await resolveSocketClientAuth({ isGuest: false })

      if (!socketAuth || !isMounted) {
        return
      }

      const newSocket = io(socketUrl, {
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
        transports: ['polling', 'websocket'],
      })
      activeSocket = newSocket

      newSocket.on('online-users', (data: { userIds: string[] }) => {
        setOnlineUsers(new Set(data.userIds))
      })

      newSocket.on('user-online', (data: { userId: string }) => {
        setOnlineUsers(prev => new Set(prev).add(data.userId))
      })

      newSocket.on('user-offline', (data: { userId: string }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev)
          next.delete(data.userId)
          return next
        })
      })

      setSocket(newSocket)
    }

    void connectSocket()

    return () => {
      isMounted = false
      activeSocket?.close()
    }
  }, [isOpen, session?.user?.id])

  useEffect(() => {
    if (isOpen) {
      loadFriends()
    }
  }, [isOpen])

  const loadFriends = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/friends')
      if (!res.ok) throw new Error('Failed to load friends')
      
      const data = await res.json()
      setFriends(data.friends || [])
      clientLogger.log('Friends loaded for invite', { count: data.friends?.length })
    } catch (error) {
      clientLogger.error('Error loading friends:', error)
      showToast.error('friends.errors.loadFailed')
    } finally {
      setLoading(false)
    }
  }

  const toggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriends)
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId)
    } else {
      newSelected.add(friendId)
    }
    setSelectedFriends(newSelected)
  }

  const handleInvite = async () => {
    if (selectedFriends.size === 0) {
      showToast.error('lobby.invite.selectFriends')
      return
    }

    setInviting(true)
    try {
      await onInvite(Array.from(selectedFriends))
      showToast.success('lobby.invite.sent', undefined, { count: selectedFriends.size })
      setSelectedFriends(new Set())
      onClose()
    } catch (error) {
      clientLogger.error('Error inviting friends:', error)
      showToast.error('errors.generic')
    } finally {
      setInviting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('lobby.invite.title')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">👥</p>
            <p>{t('lobby.invite.noFriends')}</p>
            <p className="text-sm mt-2">{t('lobby.invite.addFriendsFirst')}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('lobby.invite.description')}
            </p>

            <div className="space-y-2 mb-6">
              {/* Sort friends: online first, then alphabetically */}
              {[...friends]
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
                .map((friend) => {
                  const isOnline = onlineUsers.has(friend.id)
                  
                  return (
                    <button
                      key={friend.id}
                      onClick={() => toggleFriend(friend.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                        selectedFriends.has(friend.id)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                          {friend.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        {/* Online Status Indicator */}
                        {isOnline && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {friend.username || friend.email}
                          </span>
                          {isOnline && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              Online
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedFriends.has(friend.id) && (
                        <span className="text-blue-600 dark:text-blue-400">✓</span>
                      )}
                    </button>
                  )
                })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleInvite}
                disabled={inviting || selectedFriends.size === 0}
                className="flex-1 btn btn-primary disabled:opacity-50"
              >
                {inviting
                  ? t('common.loading')
                  : t('lobby.invite.send', { count: selectedFriends.size })}
              </button>
              <button
                onClick={onClose}
                className="flex-1 btn btn-secondary"
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
