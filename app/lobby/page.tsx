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
        clientLogger.warn('Lobbies loaded with error:', (data as Record<string, unknown>).error)
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
      await loadLobbiesRef.current()
      if (!cancelled) {
        initializedRef.current = true
      }
    }

    void initializeLobbyList()

    // Auto-refresh lobbies every 5 seconds
    const refreshInterval = setInterval(() => {
      void loadLobbiesRef.current()
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(refreshInterval)
      loadAbortControllerRef.current?.abort()
    }
  }, [])

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
  // Wait for i18n to be ready before rendering
  if (!ready || !i18n.isInitialized) {
    return <LoadingSkeleton />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/60 to-indigo-100/80 pb-8 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-600/10" />
        <div className="absolute -right-40 top-20 h-96 w-96 rounded-full bg-purple-400/15 blur-3xl dark:bg-purple-600/10" />
        <div className="absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-indigo-400/15 blur-3xl dark:bg-indigo-600/10" />
      </div>

      <div className="relative mx-auto max-w-6xl px-3 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <div className="space-y-6 animate-scale-in">
          <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-xl shadow-slate-200/50 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-slate-950/50">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
            <div className="p-5 sm:p-8 lg:p-10">
              <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => router.push('/games')}
                    className="group inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-blue-50 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                  >
                    <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">←</span>
                    <span>{t('lobby.backToGames')}</span>
                  </button>

                  <div className="mt-5">
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                      {t('lobby.title')}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                      {t('lobby.subtitle')}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700/70">
                      {t('lobby.lobbiesCount', { count: lobbies.length })}
                    </span>
                    {lastUpdatedAt && (
                      <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-400 dark:ring-slate-700/70">
                        {t('lobby.lastUpdated', {
                          time: new Date(lastUpdatedAt).toLocaleTimeString(),
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 xl:w-[280px]">
                  <button
                    type="button"
                    onClick={() => router.push('/lobby/create')}
                    className="group w-full overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-6 text-left text-white shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100/80">
                          {t('lobby.createLobby')}
                        </p>
                        <h2 className="mt-3 text-2xl font-bold leading-tight">
                          {t('lobby.createNew')}
                        </h2>
                        <p className="mt-3 text-sm text-white/75">
                          {t('lobby.createDescription')}
                        </p>
                      </div>
                      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl shadow-lg backdrop-blur-sm">
                        ✨
                      </span>
                    </div>
                    <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white/90">
                      <span>{t('lobby.getStarted')}</span>
                      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <LobbyStats
                  totalLobbies={stats.totalLobbies}
                  waitingLobbies={stats.waitingLobbies}
                  playingLobbies={stats.playingLobbies}
                  totalPlayers={stats.totalPlayers}
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-xl shadow-slate-200/40 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-slate-950/40 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {t('lobby.quickJoin')}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t('lobby.quickJoinDescription')}
                </p>
              </div>
              <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-2xl text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                🔍
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder={t('lobby.enterCode')}
                className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-base text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-900/70 dark:text-white"
                value={joinCode}
                onChange={(e) => setJoinCode(sanitizeLobbyCode(e.target.value))}
                maxLength={LOBBY_CODE_LENGTH}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                onClick={handleJoinByCode}
                disabled={joinCode.length !== LOBBY_CODE_LENGTH}
                className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {t('lobby.join')}
              </button>
            </div>
          </section>

          <LobbyFilters filters={filters} onFiltersChange={setFilters} />

          <section className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-xl shadow-slate-200/40 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-slate-950/40 sm:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
                  {t('lobby.activeLobbies')}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t('lobby.lobbiesCount', { count: lobbies.length })}
                </p>
              </div>
              <button
                onClick={loadLobbies}
                disabled={refreshing || loading}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800"
                title={t('lobby.refresh')}
              >
                <svg
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{t('lobby.refresh')}</span>
              </button>
            </div>

            {hasLoadError && (
              <div className="mb-4 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-orange-500/5 dark:text-amber-200">
                {t('lobby.loadFailed')}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200/70 bg-slate-100/80 dark:border-slate-700/60 dark:bg-slate-800/70" />
                ))}
              </div>
            ) : lobbies.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-5xl dark:bg-slate-800">
                  🎲
                </div>
                <h3 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
                  {hasActiveFilters ? t('lobby.noFilterMatches') : t('lobby.noLobbies')}
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-slate-500 dark:text-slate-400">
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
                  className="mt-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow"
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
          </section>
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
