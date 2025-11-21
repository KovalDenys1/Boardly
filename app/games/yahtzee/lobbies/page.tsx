'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'

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
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const isAuthenticated = status === 'authenticated'

  useEffect(() => {
    if (status === 'unauthenticated') {
      setLoading(false)
      return
    }

    if (status === 'authenticated') {
      loadLobbies()
      triggerCleanup()

      // Auto-refresh lobbies every 5 seconds
      const refreshInterval = setInterval(() => {
        loadLobbies()
      }, 5000)

      // Setup WebSocket for real-time updates
      if (!socket) {
        const url = getBrowserSocketUrl()
        console.log('🔌 Connecting to Socket.IO for Yahtzee lobby list:', url)
        
        // Get auth token - use userId for authenticated users
        const token = session?.user?.id || null
        
        socket = io(url, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          auth: {
            token: token,
            isGuest: false,
          },
          query: {
            token: token,
            isGuest: 'false',
          },
        })

        socket.on('connect', () => {
          console.log('✅ Socket connected for Yahtzee lobby list')
          socket.emit('join-lobby-list')
        })

        socket.on('lobby-list-update', () => {
          console.log('📡 Yahtzee lobby list update received')
          loadLobbies()
        })

        socket.on('disconnect', () => {
          console.log('❌ Socket disconnected from Yahtzee lobby list')
        })
      }

      return () => {
        clearInterval(refreshInterval)
        if (socket && socket.connected) {
          console.log('🔌 Disconnecting socket from Yahtzee lobby list')
          socket.emit('leave-lobby-list')
          socket.disconnect()
          socket = null as any
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router])

  const triggerCleanup = async () => {
    try {
      await fetch('/api/lobby/cleanup', {
        method: 'POST',
      })
    } catch (error) {
      console.log('Background cleanup skipped:', error)
    }
  }

  const loadLobbies = async () => {
    try {
      const res = await fetch('/api/lobby?gameType=yahtzee')
      const data = await res.json()
      setLobbies(data.lobbies || [])
    } catch (error) {
      console.error('Failed to load Yahtzee lobbies:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinByCode = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?returnUrl=${encodeURIComponent('/games/yahtzee/lobbies')}`)
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumbs */}
        <div className="mb-6 flex items-center gap-2 text-white/80 text-sm">
          <button 
            onClick={() => router.push('/')}
            className="hover:text-white transition-colors"
          >
            🏠 Home
          </button>
          <span>›</span>
          <button 
            onClick={() => router.push('/games')}
            className="hover:text-white transition-colors"
          >
            🎮 Games
          </button>
          <span>›</span>
          <span className="text-white font-semibold">🎲 Yahtzee Lobbies</span>
        </div>

        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">🎲 Yahtzee Lobbies</h1>
            <p className="text-xl text-white/90">
              {isAuthenticated ? 'Join a game or create your own lobby!' : 'Browse lobbies and sign in when you want to host or join.'}
            </p>
          </div>
          <button
            onClick={() => router.push('/games')}
            className="px-6 py-3 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-300 hover:scale-105"
          >
            ← Back to Games
          </button>
        </div>

        {!isAuthenticated && (
          <div className="mb-6 p-4 bg-white/10 border border-white/20 rounded-xl text-white/90">
            <p className="font-semibold">Want to play?</p>
            <p className="text-sm">
              Sign in or create an account to host lobbies and join games. Guests can still receive invite links later.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => router.push('/auth/login?returnUrl=/games/yahtzee/lobbies')}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg font-bold hover:bg-blue-50 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/auth/register?returnUrl=/games/yahtzee/lobbies')}
                className="px-4 py-2 border border-white/40 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Create Lobby Card - Made bigger and more prominent */}
          <div
            className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-2xl p-8 text-white hover:shadow-3xl transition-all hover:scale-105 cursor-pointer border-4 border-white/20"
            onClick={() => {
              if (!isAuthenticated) {
                router.push(`/auth/login?returnUrl=${encodeURIComponent('/lobby/create')}`)
                return
              }
              router.push('/lobby/create')
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-6xl">✨</div>
              <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold">
                NEW GAME
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-3">Create New Lobby</h2>
            <p className="text-white/90 mb-6 text-lg">Start your own Yahtzee game and invite friends to join!</p>
            <div className="flex items-center text-white font-bold text-lg">
              <span>Create Now</span>
              <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>

          {/* Quick Join Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-lg p-8 hover:shadow-xl transition-shadow border-2 border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">🔍 Quick Join</h2>
            <p className="text-sm text-white/80 mb-6">
              Have a lobby code? Enter it below to join instantly!
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter 6-digit code"
                className="flex-1 px-4 py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 font-mono text-lg"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                onClick={handleJoinByCode}
                disabled={!joinCode || joinCode.length !== 6 || !isAuthenticated}
                className="px-8 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg"
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
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Active Yahtzee Lobbies</h2>
              <p className="text-sm text-white/80 mt-1">
                {lobbies.length} {lobbies.length === 1 ? 'lobby' : 'lobbies'} available
              </p>
            </div>
            <button
              onClick={loadLobbies}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Refresh"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-white/10 rounded-xl animate-pulse"></div>
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10 mb-4">
                <span className="text-5xl">🎲</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Active Lobbies</h3>
              <p className="text-white/80 mb-6">Be the first to create one and start playing!</p>
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
                  className="group bg-white/10 backdrop-blur-sm rounded-xl p-5 border-2 border-white/20 hover:border-white/60 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 animate-fade-in hover:bg-white/20"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-white mb-1 group-hover:text-yellow-300 transition-colors">
                        {lobby.name}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-white/80">
                        <span className="font-mono bg-white/20 text-white px-2 py-0.5 rounded font-bold">
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
                        ? 'bg-green-500/80 text-white'
                        : 'bg-yellow-500/80 text-white'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        lobby.games.length > 0 && lobby.games[0].status === 'playing' ? 'bg-white animate-pulse' : 'bg-white'
                      }`}></div>
                      {lobby.games.length > 0 && lobby.games[0].status === 'playing' ? (
                        `Playing (${lobby.games[0]._count.players})`
                      ) : (
                        'Waiting'
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/80">
                      👥 Max {lobby.maxPlayers} players
                    </span>
                    <span className="text-yellow-300 font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1">
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


