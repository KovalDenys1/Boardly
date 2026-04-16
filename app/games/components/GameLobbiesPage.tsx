'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, type Socket } from 'socket.io-client'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useGuest } from '@/contexts/GuestContext'
import { clientLogger } from '@/lib/client-logger'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { useTranslation } from '@/lib/i18n-helpers'
import { getLobbyCreateRoute } from '@/lib/public-game-access'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { getBrowserSocketUrl } from '@/lib/socket-url'

type Lobby = {
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

type GameLobbiesPageProps = {
  gameType: string
  pagePath: string
  pageGradientClassName: string
  createCardGradientClassName: string
  accentTextClassName: string
  titleEmoji: string
  gameNameKey: TranslationKeys
  lobbiesNamespace: string
}

export default function GameLobbiesPage({
  gameType,
  pagePath,
  pageGradientClassName,
  createCardGradientClassName,
  accentTextClassName,
  titleEmoji,
  gameNameKey,
  lobbiesNamespace,
}: GameLobbiesPageProps) {
  const router = useRouter()
  const { status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const { t } = useTranslation()
  const socketRef = useRef<Socket | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const isAuthenticated = status === 'authenticated' || isGuest
  const createLobbyPath = getLobbyCreateRoute(gameType) ?? '/lobby/create'

  const tx = useCallback(
    (suffix: string) => t(`${lobbiesNamespace}.${suffix}` as TranslationKeys),
    [lobbiesNamespace, t]
  )

  const loadLobbies = useCallback(async () => {
    try {
      const response = await fetchWithGuest(`/api/lobby?gameType=${encodeURIComponent(gameType)}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      if (data.error) {
        clientLogger.warn(`Lobbies loaded with error for ${gameType}:`, data.error)
      }

      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error(`Failed to load lobbies for ${gameType}:`, error)
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }, [gameType])

  useEffect(() => {
    if (status === 'unauthenticated' && !isGuest) {
      setLoading(false)
      return
    }

    if (isGuest && !guestToken) {
      return
    }

    if (status !== 'authenticated' && !isGuest) {
      return
    }

    loadLobbies()
    let isMounted = true

    const refreshInterval = setInterval(() => {
      loadLobbies()
    }, 5000)

    const initSocket = async () => {
      if (socketRef.current) {
        return
      }

      const socketAuth = await resolveSocketClientAuth({
        isGuest: isGuest && status !== 'authenticated',
        guestToken: isGuest && status !== 'authenticated' ? guestToken : null,
      })

      if (!socketAuth) {
        clientLogger.warn(`Skipping lobby socket connection for ${gameType}: auth payload unavailable`)
        return
      }

      if (!isMounted) {
        return
      }

      const nextSocket = io(getBrowserSocketUrl(), {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })

      nextSocket.on('connect', () => {
        nextSocket.emit('join-lobby-list')
      })

      nextSocket.on('lobby-list-update', () => {
        loadLobbies()
      })

      socketRef.current = nextSocket
    }

    void initSocket()

    return () => {
      isMounted = false
      clearInterval(refreshInterval)

      if (socketRef.current?.connected) {
        socketRef.current.emit('leave-lobby-list')
        socketRef.current.disconnect()
      }

      socketRef.current = null
    }
  }, [gameType, guestToken, isGuest, loadLobbies, status])

  const handleJoinByCode = () => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }

    if (joinCode.length === 4) {
      router.push(`/lobby/${joinCode.toUpperCase()}`)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className={`page-shell bg-gradient-to-br ${pageGradientClassName}`}>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
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
            <span className="text-white font-semibold whitespace-nowrap">
              {titleEmoji} <span className="hidden xs:inline">{t(gameNameKey)}</span>
            </span>
          </div>

          <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2 drop-shadow-lg">
                {titleEmoji} {tx('title')}
              </h1>
              <p className="text-sm sm:text-base lg:text-xl text-white/90">
                {isAuthenticated ? tx('subtitle') : tx('subtitleGuest')}
              </p>
            </div>
            <button
              onClick={() => router.push('/games')}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-300 hover:scale-105 text-sm sm:text-base w-full sm:w-auto"
            >
              ← {tx('backToGames')}
            </button>
          </div>

          {!isAuthenticated && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-white/10 border border-white/20 rounded-xl text-white/90">
              <p className="font-semibold text-sm sm:text-base">{tx('wantToPlay')}</p>
              <p className="text-xs sm:text-sm mt-1">{tx('wantToPlayDesc')}</p>
              <div className="mt-3 flex flex-col xs:flex-row gap-2 sm:gap-3">
                <button
                  onClick={() => router.push(`/auth/login?returnUrl=${encodeURIComponent(pagePath)}`)}
                  className={`px-4 py-2 bg-white rounded-lg font-bold transition-colors text-sm sm:text-base ${accentTextClassName}`}
                >
                  {tx('signIn')}
                </button>
                <button
                  onClick={() => router.push(`/auth/register?returnUrl=${encodeURIComponent(pagePath)}`)}
                  className="px-4 py-2 border border-white/40 rounded-lg font-semibold hover:bg-white/10 transition-colors text-sm sm:text-base"
                >
                  {tx('createAccount')}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div
              className={`bg-gradient-to-br ${createCardGradientClassName} rounded-2xl shadow-2xl p-5 sm:p-8 text-white hover:shadow-3xl transition-all hover:scale-105 cursor-pointer border-2 sm:border-4 border-white/20`}
              onClick={() => {
                if (!isAuthenticated) {
                  router.push(`/auth/login?returnUrl=${encodeURIComponent(createLobbyPath)}`)
                  return
                }

                router.push(createLobbyPath)
              }}
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="text-4xl sm:text-6xl">{titleEmoji}</div>
                <div className="px-2 sm:px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold">
                  {tx('newGame')}
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3">{tx('createNewLobby')}</h2>
              <p className="text-white/90 mb-4 sm:mb-6 text-sm sm:text-base lg:text-lg">{tx('createDescription')}</p>
              <div className="flex items-center text-white font-bold text-base sm:text-lg">
                <span>{tx('createNow')}</span>
                <svg className="w-5 h-5 sm:w-6 sm:h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-lg p-5 sm:p-8 hover:shadow-xl transition-shadow border-2 border-white/20">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">🔍 {tx('quickJoin')}</h2>
              <p className="text-xs sm:text-sm text-white/80 mb-4 sm:mb-6">{tx('quickJoinDesc')}</p>
              <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
                <input
                  type="text"
                  placeholder={tx('enterCode')}
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 font-mono text-base sm:text-lg"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 4))}
                  maxLength={4}
                  onKeyDown={(event) => event.key === 'Enter' && handleJoinByCode()}
                />
                <button
                  onClick={handleJoinByCode}
                  disabled={joinCode.length !== 4 || !isAuthenticated}
                  className={`px-6 sm:px-8 py-2 sm:py-3 bg-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg text-sm sm:text-base ${accentTextClassName}`}
                >
                  {t('lobby.join')}
                </button>
              </div>
              {!isAuthenticated && (
                <p className="text-xs text-white/70 mt-3">{tx('signInToJoin')}</p>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
            <h2 className="text-white text-2xl font-bold mb-6 flex items-center justify-between">
              <span>🎮 {tx('activeLobbies')}</span>
              <span className="text-lg font-normal text-white/80">({lobbies.length})</span>
            </h2>

            {lobbies.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">{titleEmoji}</div>
                <p className="text-white/70 text-lg mb-6">{tx('noLobbiesTitle')}</p>
                {isAuthenticated && (
                  <button
                    onClick={() => router.push(createLobbyPath)}
                    className={`px-6 py-3 bg-gradient-to-r ${createCardGradientClassName} text-white rounded-xl font-bold hover:shadow-lg transition-all hover:scale-105`}
                  >
                    {tx('createFirstLobby')}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lobbies.map((lobby) => {
                  const activeGame = lobby.games.find((game) => game.status === 'waiting' || game.status === 'playing')
                  const playerCount = activeGame?._count?.players ?? 0
                  const isWaiting = activeGame?.status === 'waiting'
                  const isPlaying = activeGame?.status === 'playing'
                  const isFull = playerCount >= lobby.maxPlayers
                  const hostName = lobby.creator.username || lobby.creator.email?.split('@')[0] || 'Anonymous'

                  return (
                    <div
                      key={lobby.id}
                      className="bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-sm border border-white/30 rounded-xl p-5 hover:from-white/30 hover:to-white/20 hover:border-white/40 transition-all duration-300 cursor-pointer transform hover:scale-105 hover:shadow-2xl"
                      onClick={() => router.push(`/lobby/${lobby.code}`)}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-white font-bold text-lg truncate pr-2 flex-1">{lobby.name}</h3>
                        <span className="text-xs bg-purple-500 text-white px-3 py-1 rounded-full font-mono font-bold shadow-lg">
                          {lobby.code}
                        </span>
                      </div>

                      <div className="text-white/80 text-sm mb-4 flex items-center">
                        <span className="mr-2">👤</span>
                        <span className="truncate">
                          {tx('host')}: {hostName}
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
                              {tx('waiting')}
                            </span>
                          )}
                          {isPlaying && (
                            <span className="flex items-center text-xs bg-green-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                              <span className="w-2 h-2 bg-white rounded-full mr-1.5"></span>
                              {tx('playing')}
                            </span>
                          )}
                          {isFull && (
                            <span className="text-xs bg-red-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                              {tx('full')}
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
    </div>
  )
}
