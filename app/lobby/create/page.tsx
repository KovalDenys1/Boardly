'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'

type GameType = 'yahtzee' | 'guess_the_spy'

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
  guess_the_spy: {
    name: 'Guess the Spy',
    emoji: '🕵️‍♂️',
    description: 'Find the spy among you! Most players know the location, but one is the spy. Can you spot them before time runs out?',
    gradient: 'from-blue-600 via-cyan-500 to-green-400',
    allowedPlayers: [3, 4, 5, 6, 7, 8],
    defaultMaxPlayers: 6,
  },
}


import { Disclosure } from '@headlessui/react'

function CreateLobbyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const [selectedGameType, setSelectedGameType] = useState<GameType>((searchParams.get('gameType') as GameType) || 'yahtzee')
  const gameInfo = GAME_INFO[selectedGameType]

  const [formData, setFormData] = useState({
    name: '',
    password: '',
    maxPlayers: GAME_INFO[selectedGameType].defaultMaxPlayers,
    gameType: selectedGameType as GameType,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showTips, setShowTips] = useState(false)

  useEffect(() => {
    clientLogger.log('🎮 Game type selected:', selectedGameType)
    if (gameInfo) {
      setFormData(prev => ({
        ...prev,
        maxPlayers: gameInfo.defaultMaxPlayers,
        gameType: selectedGameType,
      }))
    }
  }, [selectedGameType, gameInfo])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login')
    }
  }, [status, router])

  if (!gameInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-4">Game Not Found</h1>
          <p className="text-white/80 mb-6">
            The game type &quot;{selectedGameType}&quot; is not supported yet.
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
      
      const authPayload: Record<string, unknown> = {}
      if (token) authPayload.token = token
      authPayload.isGuest = false

      const queryPayload: Record<string, string> = {}
      if (token) queryPayload.token = String(token)
      queryPayload.isGuest = 'false'

      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false, // Don't reconnect for this one-time notification
        timeout: 5000,
        auth: authPayload,
        query: queryPayload,
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
    <div className={`bg-gradient-to-br ${gameInfo.gradient} flex flex-col`}>
      <section
        className="flex flex-col w-full px-4 py-4 md:py-0 md:h-[calc(100vh-64px)] md:items-center md:justify-center flex-shrink-0"
      >
        <div className="w-full max-w-4xl flex flex-col items-center justify-center">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-white/20 flex flex-col md:flex-row md:gap-0 gap-4 overflow-hidden w-full">
            {/* 1. Game Type Selector - in separate column */}
            <div className="md:w-1/4 w-full flex flex-row md:flex-col items-center justify-center md:justify-start gap-2 md:gap-4 p-3 md:p-4 bg-white/5 border-b-2 md:border-b-0 md:border-r-2 border-white/10 order-1">
              {Object.entries(GAME_INFO).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedGameType(key as GameType)}
                  className={`flex flex-col items-center px-3 py-3 rounded-2xl font-bold transition-all border-2 min-w-[70px] text-base md:text-lg shadow-sm ${selectedGameType === key ? 'bg-white text-blue-600 border-blue-500 scale-105 shadow-lg' : 'bg-white/20 text-white border-transparent hover:bg-white/30'}`}
                  aria-label={`Select ${info.name}`}
                >
                  <span className="text-2xl md:text-3xl mb-1">{info.emoji}</span>
                  <span className="truncate font-bold">{info.name}</span>
                </button>
              ))}
            </div>
            {/* 2. Form */}
            <form onSubmit={handleSubmit} className="md:w-2/4 w-full p-4 md:p-6 space-y-2.5 md:space-y-3 flex flex-col justify-center order-3 md:order-2 overflow-y-auto max-h-[70vh] md:max-h-none">
              <div>
                <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                  🎮 Lobby Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Friday Night Game"
                  className="w-full px-4 py-2.5 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                  🔒 Password (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Leave empty for public lobby"
                  className="w-full px-4 py-2.5 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                  👥 Maximum Players *
                </label>
                <div className="flex gap-2 flex-wrap">
                  {gameInfo.allowedPlayers.map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setFormData({ ...formData, maxPlayers: num })}
                      className={`px-4 py-2 rounded-xl font-bold transition-all min-w-[48px] text-base ${formData.maxPlayers === num ? 'bg-white text-blue-600 shadow-lg scale-105' : 'bg-white/20 text-white hover:bg-white/30'}`}
                      aria-label={`Set max players to ${num}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
              {error && (
                <div className="bg-red-500/20 border-2 border-red-400 text-white px-4 py-3 rounded-xl flex items-center gap-2 backdrop-blur-sm">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.push(`/games/${selectedGameType}/lobbies`)}
                  className="flex-1 px-4 py-2.5 bg-white/20 text-white rounded-xl font-bold hover:bg-white/30 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2"
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
              {/* Tips - compact under the form */}
              <Disclosure defaultOpen={false}>
                {({ open }) => (
                  <div className="bg-white/10 rounded-2xl p-3 mt-2">
                    <Disclosure.Button className="w-full flex items-center justify-between text-white font-bold text-base focus:outline-none">
                      <span>💡 Quick Tips</span>
                      <span className="ml-2">{open ? '▲' : '▼'}</span>
                    </Disclosure.Button>
                    <Disclosure.Panel>
                      <ul className="space-y-2 text-sm text-white/80 mt-3">
                        <li className="flex items-start gap-2">
                          <span className="text-green-400 font-bold mt-0.5">✓</span>
                          <span>You'll be automatically added as the first player</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-400 font-bold mt-0.5">✓</span>
                          <span>Share the lobby code with friends to invite them</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-400 font-bold mt-0.5">✓</span>
                          <span>Start the game when everyone is ready!</span>
                        </li>
                      </ul>
                    </Disclosure.Panel>
                  </div>
                )}
              </Disclosure>
            </form>
            {/* 3. Preview/Info */}
            <div className="md:w-1/4 w-full bg-white/5 md:bg-white/10 p-4 md:p-6 flex flex-col items-center justify-center text-center border-t-2 md:border-t-0 md:border-l-2 border-white/10 order-2 md:order-3">
              <div className="text-5xl mb-2">{gameInfo.emoji}</div>
              <div className="text-2xl font-bold text-white mb-1">{gameInfo.name}</div>
              <div className="text-white/80 mb-2 text-sm">{gameInfo.description}</div>
              <div className="flex items-center justify-center gap-3 mt-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/30 text-white text-sm font-semibold">
                  👥 {formData.maxPlayers} players
                </span>
                {formData.password && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/30 text-white text-sm font-semibold">
                    🔒 Private
                  </span>
                )}
              </div>
              <div className="mt-4 text-xs text-white/70">
                Lobby name: <span className="font-semibold text-white">{formData.name || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
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
