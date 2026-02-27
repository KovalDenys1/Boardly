'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import LobbyFilters from '@/components/LobbyFilters'
import LobbyStats from '@/components/LobbyStats'
import LobbyCard, { LobbyCardData } from '@/components/LobbyCard'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'
import {
  buildLobbyQueryParams,
  hasActiveLobbyFilters,
  LOBBY_CODE_LENGTH,
  LobbyFilterOptions,
  normalizeGameTypeFilter,
  sanitizeLobbyCode,
} from '@/lib/lobby-filters'
import i18n from '@/i18n'
import { useGuest } from '@/contexts/GuestContext'

let socket: Socket | null = null
const EMPTY_LOBBY_STATS = {
  totalLobbies: 0,
  waitingLobbies: 0,
  playingLobbies: 0,
  totalPlayers: 0,
}

interface LobbyListResponse {
  lobbies: LobbyCardData[]
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
  const [lobbies, setLobbies] = useState<LobbyCardData[]>([])
  const [stats, setStats] = useState(EMPTY_LOBBY_STATS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
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
    const isInitialLoad = !initializedRef.current
    if (isInitialLoad) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
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

      setHasLoadError(false)
      setLastUpdatedAt(Date.now())
      setLobbies(data.lobbies || [])
      setStats(data.stats || EMPTY_LOBBY_STATS)
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return
      }
      clientLogger.error('Failed to load lobbies:', error)
      setHasLoadError(true)
      // Initial failure should still render a stable empty state.
      if (isInitialLoad) {
        setLobbies([])
        setStats(EMPTY_LOBBY_STATS)
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        if (isInitialLoad) {
          setLoading(false)
        } else {
          setRefreshing(false)
        }
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

  const hasActiveFilters = hasActiveLobbyFilters(filters)
  const quickRules = [
    {
      gameType: 'yahtzee',
      icon: '🎲',
      label: t('games.yahtzee.title', 'Yahtzee'),
      rule: t('game.ui.howToPlayRuleYahtzee'),
    },
    {
      gameType: 'guess_the_spy',
      icon: '🕵️',
      label: t('games.spy.name', 'Guess the Spy'),
      rule: t('game.ui.howToPlayRuleSpy'),
    },
    {
      gameType: 'tic_tac_toe',
      icon: '❌⭕',
      label: t('games.tictactoe.name', 'Tic-Tac-Toe'),
      rule: t('game.ui.howToPlayRuleTicTacToe'),
    },
    {
      gameType: 'rock_paper_scissors',
      icon: '✊✋✌️',
      label: t('games.rock_paper_scissors.name', 'Rock Paper Scissors'),
      rule: t('game.ui.howToPlayRuleRps'),
    },
    {
      gameType: 'memory',
      icon: '🧠',
      label: t('games.memory.name', 'Memory'),
      rule: t('game.ui.howToPlayRuleMemory'),
    },
  ]
  const selectedQuickRule = quickRules.find((entry) => entry.gameType === filters.gameType) || null

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

        <section className="mb-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
          <h2 className="text-2xl font-bold mb-2">📘 {t('game.ui.howToPlayTitle')}</h2>
          <p className="text-sm text-slate-300 mb-4">{t('game.ui.howToPlayDescription')}</p>

          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <div className="rounded-xl bg-slate-700/60 border border-slate-600 px-4 py-3 text-sm">
              {t('game.ui.howToPlayReady')}
            </div>
            <div className="rounded-xl bg-slate-700/60 border border-slate-600 px-4 py-3 text-sm">
              {t('game.ui.howToPlayStart')}
            </div>
          </div>

          {selectedQuickRule ? (
            <div className="rounded-xl bg-blue-600/20 border border-blue-400/40 px-4 py-3">
              <p className="text-sm font-semibold text-blue-100 mb-1">
                {selectedQuickRule.icon} {selectedQuickRule.label}
              </p>
              <p className="text-sm text-blue-50">{selectedQuickRule.rule}</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {quickRules.map((rule) => (
                <div key={rule.gameType} className="rounded-xl bg-slate-700/40 border border-slate-600 px-4 py-3">
                  <p className="text-sm font-semibold text-white mb-1">
                    {rule.icon} {rule.label}
                  </p>
                  <p className="text-sm text-slate-300">{rule.rule}</p>
                </div>
              ))}
            </div>
          )}
        </section>

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
              {lastUpdatedAt && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('lobby.lastUpdated', {
                    time: new Date(lastUpdatedAt).toLocaleTimeString(),
                  })}
                </p>
              )}
            </div>
            <button
              onClick={loadLobbies}
              disabled={refreshing || loading}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={t('lobby.refresh')}
            >
              <svg
                className={`w-6 h-6 text-gray-600 dark:text-gray-400 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {hasLoadError && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              {t('lobby.loadFailed')}
            </div>
          )}

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
                {hasActiveFilters ? t('lobby.noFilterMatches') : t('lobby.noLobbies')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {hasActiveFilters ? t('lobby.noFilterMatchesDescription') : t('lobby.noLobbiesDescription')}
              </p>
              <button
                onClick={
                  hasActiveFilters
                    ? () =>
                        setFilters({
                          gameType: undefined,
                          status: 'all',
                          search: '',
                          minPlayers: undefined,
                          maxPlayers: undefined,
                          sortBy: 'createdAt',
                          sortOrder: 'desc',
                        })
                    : () => router.push('/lobby/create')
                }
                className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all hover:scale-105"
              >
                {hasActiveFilters ? t('lobby.filters.clearAll') : t('lobby.createFirst')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {lobbies.map((lobby, index) => (
                <LobbyCard
                  key={lobby.id}
                  lobby={lobby}
                  index={index}
                  onOpenLobby={(code) => router.push(`/lobby/${code}`)}
                  onWatchLobby={(code) => router.push(`/lobby/${code}/spectate`)}
                />
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
