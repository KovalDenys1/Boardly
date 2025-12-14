'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation } from 'react-i18next'
import { showToast } from '@/lib/i18n-toast'

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

export default function SpyLobbiesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { t } = useTranslation()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [creatingLobby, setCreatingLobby] = useState(false)
  const isAuthenticated = status === 'authenticated'

  const loadLobbies = useCallback(async () => {
    try {
      const res = await fetch('/api/lobby?gameType=guess_the_spy')
      const data = await res.json()
      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error('Failed to load Spy lobbies:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const setupSocket = useCallback(() => {
    if (socket?.connected) return

    socket = io(getBrowserSocketUrl(), {
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      clientLogger.log('🔌 Connected to socket server')
      socket.emit('join-lobby-list')
    })

    socket.on('disconnect', () => {
      clientLogger.log('🔌 Disconnected from socket server')
    })

    socket.on('lobby-created', () => {
      loadLobbies()
    })

    socket.on('lobby-updated', () => {
      loadLobbies()
    })
  }, [loadLobbies])

  useEffect(() => {
    if (status === 'unauthenticated') {
      setLoading(false)
      return
    }

    if (status === 'authenticated') {
      loadLobbies()

      // Auto-refresh lobbies every 5 seconds
      const refreshInterval = setInterval(() => {
        loadLobbies()
      }, 5000)

      // Setup socket connection
      setupSocket()

      return () => {
        clearInterval(refreshInterval)
        if (socket?.connected) {
          socket.disconnect()
        }
      }
    }
  }, [status, setupSocket, loadLobbies])

  const createLobby = async () => {
    if (!isAuthenticated) {
      showToast.error('errors.authRequired')
      router.push('/auth/signin')
      return
    }

    setCreatingLobby(true)

    try {
      const res = await fetch('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType: 'guess_the_spy',
          maxPlayers: 10,
          name: `Spy Game ${Date.now().toString().slice(-4)}`,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create lobby')
      }

      const { lobby } = await res.json()
      router.push(`/lobby/${lobby.code}`)
    } catch (error) {
      clientLogger.error('Failed to create lobby:', error)
      showToast.error('errors.generic')
    } finally {
      setCreatingLobby(false)
    }
  }

  const joinLobby = async (code: string) => {
    if (!code) {
      showToast.error('errors.invalidCode')
      return
    }

    router.push(`/lobby/${code.toUpperCase()}`)
  }

  const handleQuickJoin = (code: string) => {
    joinLobby(code)
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
          <span className="text-white font-semibold whitespace-nowrap">🕵️ <span className="hidden xs:inline">Guess the Spy</span></span>
        </div>

        {/* Header */}
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2 drop-shadow-lg">🕵️ Guess the Spy</h1>
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
          <div className="mb-4 sm:mb-6 bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-xl p-3 sm:p-4">
            <p className="text-white text-center text-sm sm:text-base">
              ✨ <a href="/auth/login" className="font-semibold underline hover:text-white/80 transition-colors">Sign in</a> to create your own Spy game lobby!
            </p>
          </div>
        )}

        {/* Create/Join Section */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Create Lobby */}
            <div>
              <h2 className="text-white text-lg sm:text-xl font-semibold mb-3">
                {t('lobby.createNew')}
              </h2>
              <button
                onClick={createLobby}
                disabled={!isAuthenticated || creatingLobby}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-sm sm:text-base"
              >
                {creatingLobby ? t('lobby.creating') : t('lobby.create')}
              </button>
              {!isAuthenticated && (
                <p className="text-white/70 text-xs sm:text-sm mt-2">
                  {t('lobby.signInRequired')}
                </p>
              )}
            </div>

            {/* Join Lobby */}
            <div>
              <h2 className="text-white text-lg sm:text-xl font-semibold mb-3">
                {t('lobby.joinWithCode')}
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={t('lobby.enterCode')}
                  maxLength={6}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-white/20 text-white placeholder-white/50 border border-white/30 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm sm:text-base"
                />
                <button
                  onClick={() => joinLobby(joinCode)}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg text-sm sm:text-base"
                >
                  {t('lobby.join')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Game Rules */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 sm:p-6 mb-4 sm:mb-6\">
          <h2 className="text-white text-xl sm:text-2xl font-semibold mb-4">{t('spy.rules.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-white/80">
            <div>
              <h3 className="font-semibold text-white mb-2">{t('spy.rules.setup')}</h3>
              <ul className="space-y-1 text-sm">
                <li>• {t('spy.rules.players', { min: 3, max: 10 })}</li>
                <li>• {t('spy.rules.randomSpy')}</li>
                <li>• {t('spy.rules.regularsSeeLocation')}</li>
                <li>• {t('spy.rules.spySeesCategories')}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">{t('spy.rules.gameplay')}</h3>
              <ul className="space-y-1 text-sm">
                <li>• {t('spy.rules.askQuestions')}</li>
                <li>• {t('spy.rules.identifySpy')}</li>
                <li>• {t('spy.rules.spyBlends')}</li>
                <li>• {t('spy.rules.voting', { time: 5 })}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">{t('spy.rules.winning')}</h3>
              <ul className="space-y-1 text-sm">
                <li>• {t('spy.rules.spyCaught', { points: 100 })}</li>
                <li>• {t('spy.rules.innocentCaught', { points: 300 })}</li>
                <li>• {t('spy.rules.bonusVotes', { points: 50 })}</li>
                <li>• {t('spy.rules.rounds', { count: 3 })}</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">{t('spy.rules.tips')}</h3>
              <ul className="space-y-1 text-sm">
                <li>• {t('spy.rules.dontBeObvious')}</li>
                <li>• {t('spy.rules.watchAnswers')}</li>
                <li>• {t('spy.rules.spyStrategy')}</li>
                <li>• {t('spy.rules.payAttention')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Active Lobbies */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 sm:p-6\">\n          <h2 className="text-white text-xl sm:text-2xl font-semibold mb-4\">\n            {t('lobby.activeLobbies')} ({lobbies.length})\n          </h2>

          {lobbies.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <p className="text-white/70 text-base sm:text-lg mb-4">
                {t('lobby.noLobbies')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {lobbies.map((lobby) => {
                const game = lobby.games[0]
                const playerCount = game?._count?.players || 0
                const isWaiting = game?.status === 'waiting'
                const isPlaying = game?.status === 'playing'

                return (
                  <div
                    key={lobby.id}
                    className="bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl p-4 hover:bg-white/30 hover:border-white/30 transition-all cursor-pointer group"
                    onClick={() => handleQuickJoin(lobby.code)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-semibold text-base sm:text-lg truncate pr-2">
                        {lobby.name}
                      </h3>
                      <span className="text-xs bg-purple-500/80 text-white px-2 py-1 rounded-lg font-mono">
                        {lobby.code}
                      </span>
                    </div>

                    <div className="text-white/70 text-xs sm:text-sm mb-3">
                      {t('lobby.host')}: {lobby.creator.username || lobby.creator.email?.split('@')[0]}
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="text-white text-sm sm:text-base">
                        👥 {playerCount}/{lobby.maxPlayers}
                      </div>
                      <div className="flex items-center gap-2">
                        {isWaiting && (
                          <span className="text-xs bg-yellow-500/80 text-white px-2 py-1 rounded-lg">
                            {t('lobby.waiting')}
                          </span>
                        )}
                        {isPlaying && (
                          <span className="text-xs bg-green-500/80 text-white px-2 py-1 rounded-lg">
                            {t('lobby.playing')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
