'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'

let socket: Socket

interface Lobby {
  id: string
  code: string
  name: string
  maxPlayers: number
  creator: { 
    username: string | null
    email: string | null
  }
  games: {
    id: string
    status: string
    _count: {
      players: number
    }
  }[]
}

export default function LobbyListPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')

  useEffect(() => {
    loadLobbies()
    // Trigger automatic cleanup of inactive lobbies
    triggerCleanup()

    // Auto-refresh lobbies every 5 seconds
    const refreshInterval = setInterval(() => {
      loadLobbies()
    }, 5000)

    // Setup WebSocket for real-time updates
    if (!socket) {
      const url = getBrowserSocketUrl()
      clientLogger.log('🔌 Connecting to Socket.IO for lobby list:', url)
      
      // Get auth token - use userId for authenticated users, null for guests
      const token = session?.user?.id || null
      
      socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: {
          token: token,
          isGuest: !session?.user,
        },
        query: {
          token: token,
          isGuest: !session?.user ? 'true' : 'false',
        },
      })

      socket.on('connect', () => {
        clientLogger.log('✅ Socket connected for lobby list')
        socket.emit('join-lobby-list')
      })

      socket.on('lobby-list-update', () => {
        clientLogger.log('📡 Lobby list update received')
        loadLobbies()
      })

      socket.on('disconnect', () => {
        clientLogger.log('❌ Socket disconnected from lobby list')
      })
    }

    return () => {
      clearInterval(refreshInterval)
      if (socket && socket.connected) {
        clientLogger.log('🔌 Disconnecting socket from lobby list')
        socket.emit('leave-lobby-list')
        socket.disconnect()
        socket = null as any
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerCleanup = async () => {
    try {
      // Silently cleanup inactive lobbies in background
      const res = await fetch('/api/lobby/cleanup', {
        method: 'POST',
      })
      
      if (!res.ok) {
        clientLogger.warn('Cleanup returned non-ok status:', res.status)
      }
    } catch (error) {
      // Ignore errors - cleanup is not critical for user experience
      clientLogger.log('Background cleanup skipped (non-critical):', error)
    }
  }

  const loadLobbies = async () => {
    try {
      const res = await fetch('/api/lobby')
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      
      const data = await res.json()
      
      // Handle case where API returns error but with 200 status
      if (data.error) {
        clientLogger.warn('Lobbies loaded with error:', data.error)
      }
      
      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error('Failed to load lobbies:', error)
      // Set empty array to prevent UI from breaking
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }

  const handleJoinByCode = () => {
    if (joinCode) {
      router.push(`/lobby/${joinCode.toUpperCase()}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">🎮 Game Lobbies</h1>
            <p className="text-gray-600 dark:text-gray-400">Join an existing lobby or create your own!</p>
          </div>
          <button
            onClick={() => router.push('/games')}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
          >
            ← Back to Games
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Quick Join Card */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">🔍 Quick Join</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Have a lobby code? Enter it below to join instantly!
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter 6-digit code (e.g., ABC123)"
                className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-lg"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                onClick={handleJoinByCode}
                disabled={!joinCode || joinCode.length !== 6}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg"
              >
                Join
              </button>
            </div>
          </div>

          {/* Create Lobby Card */}
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg p-6 text-white hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
               onClick={() => router.push('/lobby/create')}>
            <div className="text-5xl mb-4">✨</div>
            <h2 className="text-2xl font-bold mb-2">Create Lobby</h2>
            <p className="text-white/80 mb-4">Start your own game and invite friends!</p>
            <div className="flex items-center text-white/90 font-semibold">
              <span>Get Started</span>
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Active Lobbies */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Active Lobbies</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {lobbies.length} {lobbies.length === 1 ? 'lobby' : 'lobbies'} available
              </p>
            </div>
            <button
              onClick={loadLobbies}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Refresh"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse"></div>
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
                <span className="text-5xl">🎲</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Active Lobbies</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">Be the first to create one and start playing!</p>
              <button
                onClick={() => router.push('/lobby/create')}
                className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all hover:scale-105"
              >
                Create First Lobby
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lobbies.map((lobby, index) => (
                <div
                  key={lobby.id}
                  onClick={() => router.push(`/lobby/${lobby.code}`)}
                  className="group bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-xl p-5 border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {lobby.name}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">
                          {lobby.code}
                        </span>
                        <span>•</span>
                        <span className="truncate">
                          👤 {lobby.creator.username || lobby.creator.email?.split('@')[0] || 'Anonymous'}
                        </span>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      lobby.games.length > 0 && lobby.games[0].status === 'playing'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        lobby.games.length > 0 && lobby.games[0].status === 'playing' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                      }`}></div>
                      {lobby.games.length > 0 && lobby.games[0].status === 'playing' ? (
                        `Playing (${lobby.games[0]._count.players})`
                      ) : (
                        'Waiting'
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      👥 Max {lobby.maxPlayers} players
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      Join Game
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
