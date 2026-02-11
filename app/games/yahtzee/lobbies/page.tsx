'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

let socket: Socket

interface Lobby {
  id: string
  code: string
  name: string
  maxPlayers: number
  gameType: string
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

export default function YahtzeeLobbiesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const isAuthenticated = status === 'authenticated' || isGuest

  useEffect(() => {
    // Allow both authenticated users and guests
    if (status === 'unauthenticated' && !isGuest) {
      setLoading(false)
      return
    }

    if (isGuest && !guestToken) {
      return
    }

    if (status === 'authenticated' || isGuest) {
      loadLobbies()
      triggerCleanup()

      // Auto-refresh lobbies every 5 seconds
      const refreshInterval = setInterval(() => {
        loadLobbies()
      }, 5000)

      // Setup WebSocket for real-time updates
      if (!socket) {
        const url = getBrowserSocketUrl()
        clientLogger.log('🔌 Connecting to Socket.IO for Yahtzee lobby list:', url)

        // Get auth token - use userId for authenticated users or guest JWT for guests
        const token = session?.user?.id || guestToken || null

        const authPayload: Record<string, unknown> = {}
        if (token) authPayload.token = token
        authPayload.isGuest = isGuest

        const queryPayload: Record<string, string> = {}
        if (token) queryPayload.token = String(token)
        queryPayload.isGuest = String(isGuest)

        socket = io(url, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          auth: authPayload,
          query: queryPayload,
        })

        socket.on('connect', () => {
          clientLogger.log('✅ Socket connected for Yahtzee lobby list')
          socket.emit('join-lobby-list')
        })

        socket.on('lobby-list-update', () => {
          clientLogger.log('📡 Yahtzee lobby list update received')
          loadLobbies()
        })

        socket.on('disconnect', () => {
          clientLogger.log('❌ Socket disconnected from Yahtzee lobby list')
        })
      }

      return () => {
        clearInterval(refreshInterval)
        if (socket && socket.connected) {
          clientLogger.log('🔌 Disconnecting socket from Yahtzee lobby list')
          socket.emit('leave-lobby-list')
          socket.disconnect()
          socket = null as any
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isGuest, guestToken, router])

  const triggerCleanup = async () => {
    try {
      const res = await fetch('/api/lobby/cleanup', {
        method: 'POST',
      })

      if (!res.ok) {
        clientLogger.warn('Cleanup returned non-ok status:', res.status)
      }
    } catch (error) {
      clientLogger.log('Background cleanup skipped (non-critical):', error)
    }
  }

  const loadLobbies = async () => {
    try {
      const res = await fetchWithGuest('/api/lobby?gameType=yahtzee')

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      // Handle case where API returns error but with 200 status
      if (data.error) {
        clientLogger.warn('Yahtzee lobbies loaded with error:', data.error)
      }

      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error('Failed to load Yahtzee lobbies:', error)
      // Set empty array to prevent UI from breaking
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }

  const handleJoinByCode = () => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    if (joinCode) {
      router.push(`/lobby/${joinCode.toUpperCase()}`)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pt-16 sm:pt-20">
        {/* Breadcrumbs */}
        <div className="mb-4 sm:mb-6 flex items-center gap-1.5 sm:gap-2 text-white/80 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => router.push('/')}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            🏠 <span className="hidden xs:inline">Home</span>
          </button>
          <span>›</span>
          <button
            onClick={() => router.push('/games')}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            🎮 <span className="hidden xs:inline">Games</span>
          </button>
          <span>›</span>
          <span className="text-white font-semibold whitespace-nowrap">🎲 <span className="hidden xs:inline">Yahtzee Lobbies</span></span>
        </div>

        {/* Header */}
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2 drop-shadow-lg">🎲 Yahtzee Lobbies</h1>
            <p className="text-sm sm:text-base lg:text-xl text-white/90">
              {isAuthenticated ? 'Join a game or create your own lobby!' : 'Browse lobbies and sign in when you want to host or join.'}
            </p>
          </div>
          <button
            onClick={() => router.push('/games')}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-300 hover:scale-105 text-sm sm:text-base w-full sm:w-auto"
          >
            ← Back to Games
          </button>
        </div>

        {!isAuthenticated && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-white/10 border border-white/20 rounded-xl text-white/90">
            <p className="font-semibold text-sm sm:text-base">Want to play?</p>
            <p className="text-xs sm:text-sm mt-1">
              Sign in or create an account to host lobbies and join games. Guests can still receive invite links later.
            </p>
            <div className="mt-3 flex flex-col xs:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => router.push('/auth/login?returnUrl=/games/yahtzee/lobbies')}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg font-bold hover:bg-blue-50 transition-colors text-sm sm:text-base"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/auth/register?returnUrl=/games/yahtzee/lobbies')}
                className="px-4 py-2 border border-white/40 rounded-lg font-semibold hover:bg-white/10 transition-colors text-sm sm:text-base"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Create Lobby Card - Made bigger and more prominent */}
          <div
            className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-2xl p-5 sm:p-8 text-white hover:shadow-3xl transition-all hover:scale-105 cursor-pointer border-2 sm:border-4 border-white/20"
            onClick={() => {
              if (!isAuthenticated) {
                router.push(`/auth/login?returnUrl=${encodeURIComponent('/lobby/create')}`)
                return
              }
              router.push('/lobby/create')
            }}
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="text-4xl sm:text-6xl">✨</div>
              <div className="px-2 sm:px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold">
                NEW GAME
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3">Create New Lobby</h2>
            <p className="text-white/90 mb-4 sm:mb-6 text-sm sm:text-base lg:text-lg">Start your own Yahtzee game and invite friends to join!</p>
            <div className="flex items-center text-white font-bold text-base sm:text-lg">
              <span>Create Now</span>
              <svg className="w-5 h-5 sm:w-6 sm:h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>

          {/* Quick Join Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-lg p-5 sm:p-8 hover:shadow-xl transition-shadow border-2 border-white/20">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">🔍 Quick Join</h2>
            <p className="text-xs sm:text-sm text-white/80 mb-4 sm:mb-6">
              Have a lobby code? Enter it below to join instantly!
            </p>
            <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
              <input
                type="text"
                placeholder="Enter 4-digit code"
                className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 font-mono text-base sm:text-lg"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                onClick={handleJoinByCode}
                disabled={!joinCode || joinCode.length !== 4 || !isAuthenticated}
                className="px-6 sm:px-8 py-2 sm:py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg text-sm sm:text-base"
              >
                Join
              </button>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-white/70 mt-3">
                Please sign in before joining a lobby. You can still explore active rooms below.
              </p>
            )}
          </div>
        </div>

        {/* Active Lobbies */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-white">Active Yahtzee Lobbies</h2>
              <p className="text-xs sm:text-sm text-white/80 mt-1">
                {lobbies.length} {lobbies.length === 1 ? 'lobby' : 'lobbies'} available
              </p>
            </div>
            <button
              onClick={loadLobbies}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              title="Refresh"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-white/10 rounded-xl"></div>
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 mb-4">
                <span className="text-4xl sm:text-5xl">🎲</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">No Active Lobbies</h3>
              <p className="text-sm sm:text-base text-white/80 mb-4 sm:mb-6 px-4">Be the first to create one and start playing!</p>
              <button
                onClick={() => router.push('/lobby/create')}
                className="px-5 sm:px-6 py-2 sm:py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all hover:scale-105 text-sm sm:text-base"
              >
                Create First Lobby
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {lobbies.map((lobby, index) => (
                <div
                  key={lobby.id}
                  onClick={() => router.push(`/lobby/${lobby.code}`)}
                  className="group bg-white/10 backdrop-blur-sm rounded-xl p-4 sm:p-5 border-2 border-white/20 hover:border-white/60 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 animate-fade-in hover:bg-white/20"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base sm:text-lg text-white mb-1 group-hover:text-yellow-300 transition-colors truncate">
                        {lobby.name}
                      </h3>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-white/80 flex-wrap">
                        <span className="font-mono bg-white/20 text-white px-1.5 sm:px-2 py-0.5 rounded font-bold text-xs">
                          {lobby.code}
                        </span>
                        <span className="hidden xs:inline">•</span>
                        <span className="truncate">
                          👤 {lobby.creator.username || lobby.creator.email?.split('@')[0] || 'Anonymous'}
                        </span>
                      </div>
                    </div>
                    <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold flex items-center gap-1 sm:gap-1.5 flex-shrink-0 ${lobby.games.length > 0 && lobby.games[0].status === 'playing'
                        ? 'bg-green-500/80 text-white'
                        : 'bg-yellow-500/80 text-white'
                      }`}>
                      <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${lobby.games.length > 0 && lobby.games[0].status === 'playing' ? 'bg-white' : 'bg-white'
                        }`}></div>
                      <span className="hidden xs:inline">
                        {lobby.games.length > 0 && lobby.games[0].status === 'playing' ? (
                          `Playing (${lobby.games[0]._count.players})`
                        ) : (
                          'Waiting'
                        )}
                      </span>
                      <span className="xs:hidden">
                        {lobby.games.length > 0 && lobby.games[0].status === 'playing' ? (
                          lobby.games[0]._count.players
                        ) : (
                          '⏳'
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-white/80">
                      👥 Max {lobby.maxPlayers} players
                    </span>
                    <span className="text-yellow-300 font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      <span className="hidden xs:inline">Join Game</span>
                      <span className="xs:hidden">Join</span>
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
