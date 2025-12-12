'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'

type GameType = 'yahtzee'

type GameInfo = {
  name: string
  emoji: string
  description: string
  gradient: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
}

const GAME_INFO: Record<GameType, GameInfo> = {
  yahtzee: {
    name: 'Yahtzee',
    emoji: '🎲',
    description: 'Roll five dice, score combos, and race friends to the highest total.',
    gradient: 'from-purple-600 via-pink-500 to-orange-400',
    allowedPlayers: [2, 3, 4],
    defaultMaxPlayers: 4,
  },
}

function CreateLobbyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  
  const gameType = (searchParams.get('gameType') || 'yahtzee') as GameType
  const gameInfo = GAME_INFO[gameType]
  
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    maxPlayers: 4, // Will be updated by useEffect
    gameType: 'yahtzee' as GameType, // Will be updated by useEffect
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Update formData when gameType changes from URL
  useEffect(() => {
    clientLogger.log('🎮 Game type from URL:', gameType)
    if (gameInfo) {
      setFormData(prev => ({
        ...prev,
        maxPlayers: gameInfo.defaultMaxPlayers,
        gameType: gameType,
      }))
    }
  }, [gameType, gameInfo])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login')
    }
  }, [status, router])
  
  // Validate game type - show error UI if invalid
  if (!gameInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-4">Game Not Found</h1>
          <p className="text-white/80 mb-6">
            The game type &quot;{gameType}&quot; is not supported yet.
          </p>
          <button
            onClick={() => router.push('/games')}
            className="w-full bg-white text-purple-600 rounded-xl px-6 py-3 font-semibold hover:bg-white/90 transition-colors"
          >
            ← Back to Games
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!session) {
        router.push('/auth/login')
        return
      }

      clientLogger.log('📤 Sending lobby creation request:', formData)

      const res = await fetch('/api/lobby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      clientLogger.log('📥 Received response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create lobby')
      }

      // Notify lobby list about new lobby via WebSocket
      const socketUrl = getBrowserSocketUrl()
      const token = session?.user?.id || null
      
      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false, // Don't reconnect for this one-time notification
        timeout: 5000,
        auth: {
          token: token,
          isGuest: false,
        },
        query: {
          token: token,
          isGuest: 'false',
        },
      })
      
      // Set a timeout to force cleanup after 10 seconds
      const cleanupTimeout = setTimeout(() => {
        if (socket.connected) {
          socket.disconnect()
        }
      }, 10000)
      
      socket.on('connect', () => {
        socket.emit('lobby-created')
        clearTimeout(cleanupTimeout)
        socket.disconnect()
      })
      
      socket.on('connect_error', (error) => {
        clientLogger.warn('Socket notification failed (non-critical):', error.message)
        clearTimeout(cleanupTimeout)
        socket.disconnect()
      })

      clientLogger.log('✅ Lobby created successfully, redirecting to:', data.lobby.code)
      // Redirect to the new lobby
      router.push(`/lobby/${data.lobby.code}`)
    } catch (err) {
      clientLogger.error('❌ Lobby creation error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to create lobby'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${gameInfo.gradient} py-12 px-4`}>
      <div className="max-w-2xl mx-auto">
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
          <button 
            onClick={() => router.push(`/games/${gameType}/lobbies`)}
            className="hover:text-white transition-colors"
          >
            {gameInfo.emoji} {gameInfo.name}
          </button>
          <span>›</span>
          <span className="text-white font-semibold">Create Lobby</span>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-6">
            <span className="text-5xl">{gameInfo.emoji}</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">Create {gameInfo.name} Lobby</h1>
          <p className="text-xl text-white/90">{gameInfo.description}</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border-2 border-white/20">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Lobby Name */}
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                🎮 Lobby Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Friday Night Game"
                className="w-full px-4 py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <p className="text-xs text-white/80 mt-1">
                Choose a memorable name for your lobby
              </p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                🔒 Password (Optional)
              </label>
              <input
                type="password"
                placeholder="Leave empty for public lobby"
                className="w-full px-4 py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <p className="text-xs text-white/80 mt-1">
                Set a password to make your lobby private
              </p>
            </div>

            {/* Max Players */}
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                👥 Maximum Players *
              </label>
              <div className={`grid gap-3 ${gameInfo.allowedPlayers.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {gameInfo.allowedPlayers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setFormData({ ...formData, maxPlayers: num })}
                    className={`px-4 py-3 rounded-xl font-bold transition-all ${
                      formData.maxPlayers === num
                        ? 'bg-white text-blue-600 shadow-lg scale-105'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/80 mt-2">
                Select how many players can join
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/20 border-2 border-red-400 text-white px-4 py-3 rounded-xl flex items-center gap-2 backdrop-blur-sm">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => router.push(`/games/${gameType}/lobbies`)}
                className="flex-1 px-6 py-3 bg-white/20 text-white rounded-xl font-bold hover:bg-white/30 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Create Lobby
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Info Section */}
          <div className="mt-8 pt-6 border-t-2 border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3">💡 Quick Tips:</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>You'll be automatically added as the first player</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>Share the lobby code with friends to invite them</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>Start the game when everyone is ready!</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// Wrap component with Suspense for useSearchParams
export default function CreateLobbyPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600"><div className="text-white text-xl">Loading...</div></div>}>
      <CreateLobbyPage />
    </Suspense>
  )
}
