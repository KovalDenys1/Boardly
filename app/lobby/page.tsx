'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import LobbyFilters, { LobbyFilterOptions } from '@/components/LobbyFilters'
import LobbyStats from '@/components/LobbyStats'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'
import i18n from '@/i18n'
import { useGuest } from '@/contexts/GuestContext'

let socket: Socket | null = null
const FILTERABLE_GAME_TYPES = new Set([
  'yahtzee',
  'guess_the_spy',
  'tic_tac_toe',
  'rock_paper_scissors',
])
const LOBBY_CODE_LENGTH = 4
const LOBBY_CODE_SANITIZE_PATTERN = /[^A-Z0-9]/g
type TranslateFn = (...args: any[]) => string

function normalizeGameTypeFilter(value: string | null): string | undefined {
  if (!value) return undefined
  return FILTERABLE_GAME_TYPES.has(value) ? value : undefined
}

function sanitizeLobbyCode(value: string): string {
  return value.toUpperCase().replace(LOBBY_CODE_SANITIZE_PATTERN, '').slice(0, LOBBY_CODE_LENGTH)
}

function buildLobbyQueryParams(filters: LobbyFilterOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.gameType) params.append('gameType', filters.gameType)
  if (filters.status && filters.status !== 'all') params.append('status', filters.status)
  if (filters.search) params.append('search', filters.search)
  if (filters.minPlayers) params.append('minPlayers', filters.minPlayers.toString())
  if (filters.maxPlayers) params.append('maxPlayers', filters.maxPlayers.toString())
  if (filters.sortBy) params.append('sortBy', filters.sortBy)
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)
  return params
}

function getGamePresentation(gameType: string | undefined, t: TranslateFn): { icon: string; label: string } {
  switch (gameType) {
    case 'yahtzee':
      return { icon: '🎲', label: t('games.yahtzee.title', 'Yahtzee') }
    case 'guess_the_spy':
      return { icon: '🕵️', label: t('games.spy.name', 'Guess the Spy') }
    case 'tic_tac_toe':
      return { icon: '❌⭕', label: t('games.tictactoe.name', 'Tic-Tac-Toe') }
    case 'rock_paper_scissors':
      return { icon: '✊✋✌️', label: t('games.rock_paper_scissors.name', 'Rock Paper Scissors') }
    default:
      return { icon: '🎮', label: t('lobby.gameUnknown') }
  }
}

interface Lobby {
  id: string
  code: string
  name: string
  gameType?: string
  isPrivate?: boolean
  maxPlayers: number
  allowSpectators?: boolean
  maxSpectators?: number
  spectatorCount?: number
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

interface LobbyListResponse {
  lobbies: Lobby[]
  stats: {
    totalLobbies: number
    waitingLobbies: number
    playingLobbies: number
    totalPlayers: number
  }
}

function LobbyListPageContent() {
  const { t, ready } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialGameTypeFilter = normalizeGameTypeFilter(searchParams.get('gameType'))
  const { data: session } = useSession()
  const { isGuest, guestToken } = useGuest()
  const authenticatedUserId = session?.user?.id || null
  const hasAuthenticatedSession = Boolean(authenticatedUserId)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [stats, setStats] = useState({
    totalLobbies: 0,
    waitingLobbies: 0,
    playingLobbies: 0,
    totalPlayers: 0,
  })
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [filters, setFilters] = useState<LobbyFilterOptions>({
    gameType: initialGameTypeFilter,
    status: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })
  const loadRequestIdRef = useRef(0)
  const loadAbortControllerRef = useRef<AbortController | null>(null)
  const loadLobbiesRef = useRef<() => Promise<void>>(async () => {})
  const initializedRef = useRef(false)

  const triggerCleanup = useCallback(async () => {
    try {
      // Silently cleanup inactive lobbies in background
      const res = await fetch('/api/lobby/cleanup', {
        method: 'POST',
        cache: 'no-store',
      })

      if (!res.ok) {
        clientLogger.warn('Cleanup returned non-ok status:', res.status)
      }
    } catch (error) {
      // Ignore errors - cleanup is not critical for user experience
      clientLogger.log('Background cleanup skipped (non-critical):', error)
    }
  }, [])

  const loadLobbies = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    loadAbortControllerRef.current?.abort()
    const controller = new AbortController()
    loadAbortControllerRef.current = controller

    try {
      const params = buildLobbyQueryParams(filters)
      const query = params.toString()

      const res = await fetch(query ? `/api/lobby?${query}` : '/api/lobby', {
        cache: 'no-store',
        signal: controller.signal,
      })
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      
      const data: LobbyListResponse = await res.json()

      if (controller.signal.aborted || requestId !== loadRequestIdRef.current) {
        return
      }
      
      // Handle case where API returns error but with 200 status
      if ('error' in data) {
        clientLogger.warn('Lobbies loaded with error:', (data as any).error)
      }
      
      setLobbies(data.lobbies || [])
      setStats(data.stats || { totalLobbies: 0, waitingLobbies: 0, playingLobbies: 0, totalPlayers: 0 })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return
      }
      clientLogger.error('Failed to load lobbies:', error)
      // Set empty array to prevent UI from breaking
      setLobbies([])
      setStats({ totalLobbies: 0, waitingLobbies: 0, playingLobbies: 0, totalPlayers: 0 })
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [filters])

  useEffect(() => {
    const gameTypeFromQuery = normalizeGameTypeFilter(searchParams.get('gameType'))
    if (!gameTypeFromQuery) {
      return
    }

    setFilters((prev) => {
      if (prev.gameType === gameTypeFromQuery) {
        return prev
      }

      return {
        ...prev,
        gameType: gameTypeFromQuery,
      }
    })
  }, [searchParams])

  useEffect(() => {
    loadLobbiesRef.current = loadLobbies
    if (initializedRef.current) {
      void loadLobbies()
    }
  }, [loadLobbies])

  useEffect(() => {
    let cancelled = false

    const initializeLobbyList = async () => {
      // Clean first to avoid showing stale waiting lobbies on initial render.
      await triggerCleanup()
      if (!cancelled) {
        await loadLobbiesRef.current()
        initializedRef.current = true
      }
    }

    void initializeLobbyList()

    // Auto-refresh lobbies every 5 seconds
    const refreshInterval = setInterval(() => {
      void loadLobbiesRef.current()
    }, 5000)

    // Run periodic cleanup so stale waiting lobbies disappear without full page reload.
    const cleanupInterval = setInterval(() => {
      void triggerCleanup()
    }, 60000)

    return () => {
      cancelled = true
      clearInterval(refreshInterval)
      clearInterval(cleanupInterval)
      loadAbortControllerRef.current?.abort()
    }
  }, [triggerCleanup])

  // Socket connection effect
  useEffect(() => {
    if (isGuest && !guestToken) {
      return
    }

    let cancelled = false
    const handleConnect = () => {
      clientLogger.log('✅ Socket connected for lobby list')
      socket?.emit('join-lobby-list')
    }

    const handleLobbyListUpdate = () => {
      clientLogger.log('📡 Lobby list update received')
      void loadLobbiesRef.current()
    }

    const handleDisconnect = () => {
      clientLogger.log('❌ Socket disconnected from lobby list')
    }

    const initSocket = async () => {
      const url = getBrowserSocketUrl()
      clientLogger.log('🔌 Connecting to Socket.IO for lobby list:', url)

      const useGuestAuth = !hasAuthenticatedSession && isGuest
      const socketAuth = await resolveSocketClientAuth({
        isGuest: useGuestAuth,
        guestToken: useGuestAuth ? guestToken : null,
      })

      if (!socketAuth) {
        clientLogger.warn('Skipping lobby list socket connection: auth payload unavailable')
        return
      }

      if (cancelled) {
        return
      }

      // Re-create socket when disconnected or absent.
      if (!socket || socket.disconnected) {
        socket = io(url, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          auth: socketAuth.authPayload,
          query: socketAuth.queryPayload,
        })
      }

      socket.off('connect', handleConnect)
      socket.off('lobby-list-update', handleLobbyListUpdate)
      socket.off('disconnect', handleDisconnect)

      socket.on('connect', handleConnect)
      socket.on('lobby-list-update', handleLobbyListUpdate)
      socket.on('disconnect', handleDisconnect)

      if (socket.connected) {
        handleConnect()
      }
    }

    void initSocket()

    return () => {
      cancelled = true
      if (socket) {
        clientLogger.log('🔌 Disconnecting socket from lobby list')
        if (socket.connected) {
          socket.emit('leave-lobby-list')
        }
        socket.off('connect', handleConnect)
        socket.off('lobby-list-update', handleLobbyListUpdate)
        socket.off('disconnect', handleDisconnect)
        socket.disconnect()
        socket = null
      }
    }
  }, [authenticatedUserId, hasAuthenticatedSession, isGuest, guestToken])

  const handleJoinByCode = () => {
    const normalizedCode = sanitizeLobbyCode(joinCode)
    setJoinCode(normalizedCode)
    if (normalizedCode.length !== LOBBY_CODE_LENGTH) return
    router.push(`/lobby/${normalizedCode}`)
  }

  // Wait for i18n to be ready before rendering
  if (!ready || !i18n.isInitialized) {
    return <LoadingSkeleton />
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              🎮 {t('lobby.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{t('lobby.subtitle')}</p>
          </div>
          <button
            onClick={() => router.push('/games')}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
          >
            ← {t('lobby.backToGames')}
          </button>
        </div>

        {/* Stats */}
        <LobbyStats
          totalLobbies={stats.totalLobbies}
          waitingLobbies={stats.waitingLobbies}
          playingLobbies={stats.playingLobbies}
          totalPlayers={stats.totalPlayers}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Quick Join Card */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              🔍 {t('lobby.quickJoin')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('lobby.quickJoinDescription')}
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder={t('lobby.enterCode')}
                className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-lg"
                value={joinCode}
                onChange={(e) => setJoinCode(sanitizeLobbyCode(e.target.value))}
                maxLength={LOBBY_CODE_LENGTH}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                onClick={handleJoinByCode}
                disabled={joinCode.length !== LOBBY_CODE_LENGTH}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg"
              >
                {t('lobby.join')}
              </button>
            </div>
          </div>

          {/* Create Lobby Card */}
          <button
            type="button"
            className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg p-6 text-white hover:shadow-xl transition-all hover:scale-105 cursor-pointer text-left"
            onClick={() => router.push('/lobby/create')}
          >
            <div className="text-5xl mb-4">✨</div>
            <h2 className="text-2xl font-bold mb-2">{t('lobby.createLobby')}</h2>
            <p className="text-white/80 mb-4">{t('lobby.createDescription')}</p>
            <div className="flex items-center text-white/90 font-semibold">
              <span>{t('lobby.getStarted')}</span>
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        {/* Filters */}
        <LobbyFilters filters={filters} onFiltersChange={setFilters} />

        {/* Active Lobbies */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('lobby.activeLobbies')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('lobby.lobbiesCount', { count: lobbies.length })}
              </p>
            </div>
            <button
              onClick={loadLobbies}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t('lobby.refresh')}
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
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {t('lobby.noLobbies')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t('lobby.noLobbiesDescription')}
              </p>
              <button
                onClick={() => router.push('/lobby/create')}
                className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all hover:scale-105"
              >
                {t('lobby.createFirst')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {lobbies.map((lobby, index) => (
                <article
                  key={lobby.id}
                  className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-all hover:shadow-lg animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  {(() => {
                    const activeGame = lobby.games[0]
                    const isPlaying = activeGame?.status === 'playing'
                    const playerCount = activeGame?._count?.players ?? 0
                    const canSpectate = Boolean(lobby.allowSpectators && isPlaying)
                    const creatorName =
                      lobby.creator.username ||
                      lobby.creator.email?.split('@')[0] ||
                      t('lobby.ownerFallback')
                    const gamePresentation = getGamePresentation(lobby.gameType, t)
                    const statusClass = isPlaying
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'

                    return (
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                              {lobby.name}
                            </h3>
                            <span className="font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold text-sm">
                              {lobby.code}
                            </span>
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                lobby.isPrivate
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                              }`}
                            >
                              {lobby.isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
                            </span>
                          </div>

                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            👤 {creatorName}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`px-2.5 py-1 rounded-full font-semibold ${statusClass}`}>
                              {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
                            </span>
                            <span className="px-2.5 py-1 rounded-full font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                              {gamePresentation.icon + ' '}
                              {gamePresentation.label}
                            </span>
                            {lobby.allowSpectators && (
                              <span className="px-2.5 py-1 rounded-full font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                                {t('lobby.spectators', {
                                  count: lobby.spectatorCount ?? 0,
                                  max: lobby.maxSpectators ?? 0,
                                })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
                          <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                            {t('lobby.playerOccupancy', {
                              current: playerCount,
                              max: lobby.maxPlayers,
                            })}
                          </span>
                          <div className="flex w-full gap-2 lg:w-auto">
                            {canSpectate && (
                              <button
                                type="button"
                                onClick={() => router.push(`/lobby/${lobby.code}/spectate`)}
                                className="flex-1 lg:flex-none px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
                              >
                                {t('lobby.watch')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => router.push(`/lobby/${lobby.code}`)}
                              className="flex-1 lg:flex-none px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                            >
                              {t('lobby.openLobby')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LobbyListPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LobbyListPageContent />
    </Suspense>
  )
}
