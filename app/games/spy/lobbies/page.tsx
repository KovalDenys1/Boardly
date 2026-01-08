'use client'

import { useState, useEffect } from 'react'
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
        clientLogger.log('🔌 Connecting to Socket.IO for Spy lobby list:', url)
        
        // Get auth token - use userId for authenticated users
        const token = session?.user?.id || null

        const authPayload: Record<string, unknown> = {}
        if (token) authPayload.token = token
        authPayload.isGuest = false

        const queryPayload: Record<string, string> = {}
        if (token) queryPayload.token = String(token)
        queryPayload.isGuest = 'false'

        socket = io(url, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          auth: authPayload,
          query: queryPayload,
        })

        socket.on('connect', () => {
          clientLogger.log('✅ Socket connected for Spy lobby list')
          socket.emit('join-lobby-list')
        })

        socket.on('lobby-list-update', () => {
          clientLogger.log('📡 Spy lobby list update received')
          loadLobbies()
        })

        socket.on('disconnect', () => {
          clientLogger.log('❌ Socket disconnected from Spy lobby list')
        })
      }

      return () => {
        clearInterval(refreshInterval)
        if (socket && socket.connected) {
          clientLogger.log('🔌 Disconnecting socket from Spy lobby list')
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
      const res = await fetch('/api/lobby?gameType=guess_the_spy')
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      
      const data = await res.json()
      
      // Handle case where API returns error but with 200 status
      if (data.error) {
        clientLogger.warn('Spy lobbies loaded with error:', data.error)
      }
      
      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error('Failed to load Spy lobbies:', error)
      showToast.error('errors.loadFailed')
      // Set empty array to prevent UI from breaking
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }

  const handleJoinByCode = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?returnUrl=${encodeURIComponent('/games/spy/lobbies')}`)
      return
    }
    if (joinCode) {
      router.push(`/lobby/${joinCode.toUpperCase()}`)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">{t('common.loading')}</p>
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
            🏠 <span className="hidden xs:inline">{t('breadcrumbs.home')}</span>
          </button>
          <span>›</span>
          <button 
            onClick={() => router.push('/games')}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            🎮 <span className="hidden xs:inline">{t('breadcrumbs.games')}</span>
          </button>
          <span>›</span>
          <span className="text-white font-semibold whitespace-nowrap">🕵️ <span className="hidden xs:inline">{t('games.spy.name')}</span></span>
        </div>

        {/* Header */}
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2 drop-shadow-lg">
              🕵️ {t('games.spy.lobbies.title')}
            </h1>
            <p className="text-sm sm:text-base lg:text-xl text-white/90">
              {isAuthenticated ? t('games.spy.lobbies.subtitle') : t('games.spy.lobbies.subtitleGuest')}
            </p>
          </div>
          <button
            onClick={() => router.push('/games')}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-300 hover:scale-105 text-sm sm:text-base w-full sm:w-auto"
          >
            ← {t('games.spy.lobbies.backToGames')}
          </button>
        </div>

        {!isAuthenticated && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-white/10 border border-white/20 rounded-xl text-white/90">
            <p className="font-semibold text-sm sm:text-base">{t('games.spy.lobbies.wantToPlay')}</p>
            <p className="text-xs sm:text-sm mt-1">
              {t('games.spy.lobbies.wantToPlayDesc')}
            </p>
            <div className="mt-3 flex flex-col xs:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => router.push('/auth/login?returnUrl=/games/spy/lobbies')}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg font-bold hover:bg-blue-50 transition-colors text-sm sm:text-base"
              >
                {t('games.spy.lobbies.signIn')}
              </button>
              <button
                onClick={() => router.push('/auth/register?returnUrl=/games/spy/lobbies')}
                className="px-4 py-2 border border-white/40 rounded-lg font-semibold hover:bg-white/10 transition-colors text-sm sm:text-base"
              >
                {t('games.spy.lobbies.createAccount')}
              </button>
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Create Lobby Card */}
          <div
            className="bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl shadow-2xl p-5 sm:p-8 text-white hover:shadow-3xl transition-all hover:scale-105 cursor-pointer border-2 sm:border-4 border-white/20"
            onClick={() => {
              if (!isAuthenticated) {
                router.push(`/auth/login?returnUrl=${encodeURIComponent('/lobby/create?gameType=guess_the_spy')}`)
                return
              }
              router.push('/lobby/create?gameType=guess_the_spy')
            }}
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="text-4xl sm:text-6xl">🕵️</div>
              <div className="px-2 sm:px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold">
                {t('games.spy.lobbies.newGame')}
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3">{t('games.spy.lobbies.createNewLobby')}</h2>
            <p className="text-white/90 mb-4 sm:mb-6 text-sm sm:text-base lg:text-lg">{t('games.spy.lobbies.createDescription')}</p>
            <div className="flex items-center text-white font-bold text-base sm:text-lg">
              <span>{t('games.spy.lobbies.createNow')}</span>
              <svg className="w-5 h-5 sm:w-6 sm:h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>

          {/* Quick Join Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-lg p-5 sm:p-8 hover:shadow-xl transition-shadow border-2 border-white/20">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">🔍 {t('games.spy.lobbies.quickJoin')}</h2>
            <p className="text-xs sm:text-sm text-white/80 mb-4 sm:mb-6">
              {t('games.spy.lobbies.quickJoinDesc')}
            </p>
            <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
              <input
                type="text"
                placeholder={t('games.spy.lobbies.enterCode')}
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
                {t('lobby.join')}
              </button>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-white/70 mt-3">
                {t('games.spy.lobbies.signInToJoin')}
              </p>
            )}
          </div>
        </div>

        {/* Active Lobbies */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
          <h2 className="text-white text-2xl font-bold mb-6 flex items-center justify-between">
            <span>🎮 {t('games.spy.lobbies.activeLobbies')}</span>
            <span className="text-lg font-normal text-white/80">({lobbies.length})</span>
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/10 rounded-xl p-6">
                  <div className="h-6 bg-white/20 rounded mb-4"></div>
                  <div className="h-4 bg-white/20 rounded mb-3"></div>
                  <div className="h-10 bg-white/20 rounded"></div>
                </div>
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎲</div>
              <p className="text-white/70 text-lg mb-6">
                {t('games.spy.lobbies.noLobbiesTitle')}
              </p>
              {isAuthenticated && (
                <button
                  onClick={() => router.push('/lobby/create?gameType=guess_the_spy')}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold hover:shadow-lg transition-all hover:scale-105"
                >
                  {t('games.spy.lobbies.createFirstLobby')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lobbies.map((lobby) => {
                const game = lobby.games[0]
                const playerCount = game?._count?.players || 0
                const isWaiting = game?.status === 'waiting'
                const isPlaying = game?.status === 'playing'
                const isFull = playerCount >= lobby.maxPlayers

                return (
                  <div
                    key={lobby.id}
                    className="bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-sm border border-white/30 rounded-xl p-5 hover:from-white/30 hover:to-white/20 hover:border-white/40 transition-all duration-300 cursor-pointer transform hover:scale-105 hover:shadow-2xl"
                    onClick={() => router.push(`/lobby/${lobby.code}`)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-white font-bold text-lg truncate pr-2 flex-1">
                        {lobby.name}
                      </h3>
                      <span className="text-xs bg-purple-500 text-white px-3 py-1 rounded-full font-mono font-bold shadow-lg">
                        {lobby.code}
                      </span>
                    </div>

                    <div className="text-white/80 text-sm mb-4 flex items-center">
                      <span className="mr-2">👤</span>
                      <span className="truncate">
                        {t('games.spy.lobbies.host')}: {lobby.creator.username || lobby.creator.email?.split('@')[0] || 'Anonymous'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-white/20">
                      <div className="flex items-center text-white font-semibold">
                        <span className="mr-2">👥</span>
                        <span className={isFull ? 'text-yellow-300' : ''}>
                          {playerCount}/{lobby.maxPlayers}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isWaiting && (
                          <span className="flex items-center text-xs bg-yellow-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                            <span className="w-2 h-2 bg-white rounded-full mr-1.5 animate-ping"></span>
                            {t('games.spy.lobbies.waiting')}
                          </span>
                        )}
                        {isPlaying && (
                          <span className="flex items-center text-xs bg-green-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                            <span className="w-2 h-2 bg-white rounded-full mr-1.5"></span>
                            {t('games.spy.lobbies.playing')}
                          </span>
                        )}
                        {isFull && (
                          <span className="text-xs bg-red-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                            {t('games.spy.lobbies.full')}
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
