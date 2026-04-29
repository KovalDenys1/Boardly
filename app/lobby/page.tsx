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
  LobbyFilterOptions,
  parseFiltersFromSearchParams,
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

interface LoadLobbiesOptions {
  minimumRefreshingMs?: number
  indicatorMode?: 'manual' | 'auto' | 'silent'
}

const AUTO_REFRESH_INTERVAL_MS = 15000
const REFRESH_SPIN_DURATION_MS = 900
const AUTO_REFRESH_FEEDBACK_MS = REFRESH_SPIN_DURATION_MS * 2
const MANUAL_REFRESH_FEEDBACK_MS = REFRESH_SPIN_DURATION_MS * 2
const MANUAL_REFRESH_SUCCESS_MS = 1200

function LobbyListPageContent() {
  const { t, ready } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const authenticatedUserId = session?.user?.id || null
  const hasAuthenticatedSession = Boolean(authenticatedUserId)
  const [lobbies, setLobbies] = useState<LobbyCardData[]>([])
  const [stats, setStats] = useState(EMPTY_LOBBY_STATS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshIndicatorMode, setRefreshIndicatorMode] = useState<'idle' | 'manual' | 'auto' | 'updated'>('idle')
  const [hasLoadError, setHasLoadError] = useState(false)
  const [filters, setFilters] = useState<LobbyFilterOptions>(() =>
    parseFiltersFromSearchParams(searchParams)
  )
  const isFirstRender = useRef(true)
  const loadRequestIdRef = useRef(0)
  const loadAbortControllerRef = useRef<AbortController | null>(null)
  const loadLobbiesRef = useRef<(options?: LoadLobbiesOptions) => Promise<boolean>>(async () => false)
  const initializedRef = useRef(false)
  const refreshIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualRefreshInFlightRef = useRef(false)

  const clearRefreshIndicatorTimeout = useCallback(() => {
    if (refreshIndicatorTimeoutRef.current) {
      clearTimeout(refreshIndicatorTimeoutRef.current)
      refreshIndicatorTimeoutRef.current = null
    }
  }, [])

  const loadLobbies = useCallback(async (options?: LoadLobbiesOptions): Promise<boolean> => {
    const requestId = ++loadRequestIdRef.current
    const isInitialLoad = !initializedRef.current
    const loadStartedAt = Date.now()
    const indicatorMode = isInitialLoad ? 'silent' : options?.indicatorMode ?? 'silent'

    if (indicatorMode === 'auto' && manualRefreshInFlightRef.current) {
      return false
    }

    if (isInitialLoad) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    if (indicatorMode !== 'silent') {
      clearRefreshIndicatorTimeout()
      setRefreshIndicatorMode(indicatorMode)
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
        return false
      }
      
      // Handle case where API returns error but with 200 status
      if ('error' in data) {
        clientLogger.warn('Lobbies loaded with error:', (data as Record<string, unknown>).error)
      }

      setHasLoadError(false)
      setLobbies(data.lobbies || [])
      setStats(data.stats || EMPTY_LOBBY_STATS)
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return false
      }
      clientLogger.error('Failed to load lobbies:', error)
      setHasLoadError(true)
      // Initial failure should still render a stable empty state.
      if (isInitialLoad) {
        setLobbies([])
        setStats(EMPTY_LOBBY_STATS)
      }
      return false
    } finally {
      if (requestId === loadRequestIdRef.current) {
        if (!isInitialLoad) {
          const elapsedMs = Date.now() - loadStartedAt
          const remainingFeedbackMs = Math.max(0, (options?.minimumRefreshingMs ?? 0) - elapsedMs)
          const elapsedAfterFeedbackMs = elapsedMs + remainingFeedbackMs
          const remainderMs = elapsedAfterFeedbackMs % REFRESH_SPIN_DURATION_MS
          const remainingCycleMs = remainderMs === 0 ? 0 : REFRESH_SPIN_DURATION_MS - remainderMs
          const totalRemainingMs = remainingFeedbackMs + remainingCycleMs

          if (totalRemainingMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, totalRemainingMs))
          }
        }

        if (requestId === loadRequestIdRef.current) {
          if (isInitialLoad) {
            setLoading(false)
          } else {
            setRefreshing(false)
          }

          if (indicatorMode === 'auto') {
            setRefreshIndicatorMode('idle')
          }
        }
      }
    }
  }, [clearRefreshIndicatorTimeout, filters])

  const handleRefresh = useCallback(async () => {
    if (loading || manualRefreshInFlightRef.current || refreshIndicatorMode === 'updated') {
      return
    }

    manualRefreshInFlightRef.current = true
    clearRefreshIndicatorTimeout()
    setRefreshIndicatorMode('manual')

    const didRefresh = await loadLobbies({
      minimumRefreshingMs: MANUAL_REFRESH_FEEDBACK_MS,
      indicatorMode: 'manual',
    })
    manualRefreshInFlightRef.current = false

    if (!didRefresh) {
      setRefreshIndicatorMode('idle')
      return
    }

    setRefreshIndicatorMode('updated')
    refreshIndicatorTimeoutRef.current = setTimeout(() => {
      setRefreshIndicatorMode('idle')
      refreshIndicatorTimeoutRef.current = null
    }, MANUAL_REFRESH_SUCCESS_MS)
  }, [clearRefreshIndicatorTimeout, loadLobbies, loading, refreshIndicatorMode])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const params = buildLobbyQueryParams(filters)
    const newPath = params.toString() ? `/lobby?${params.toString()}` : '/lobby'
    router.replace(newPath, { scroll: false })
  }, [filters, router])

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

    // Socket updates are primary; polling is just a fallback to recover from missed events.
    const refreshInterval = setInterval(() => {
      void loadLobbiesRef.current({
        minimumRefreshingMs: AUTO_REFRESH_FEEDBACK_MS,
        indicatorMode: 'auto',
      })
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(refreshInterval)
      loadAbortControllerRef.current?.abort()
      clearRefreshIndicatorTimeout()
      manualRefreshInFlightRef.current = false
    }
  }, [clearRefreshIndicatorTimeout])

  // Socket connection effect
  useEffect(() => {
    if (status === 'loading') {
      return
    }

    if (isGuest && !guestToken) {
      return
    }

    if (status === 'unauthenticated' && !isGuest) {
      clientLogger.log('Skipping lobby list socket connection for anonymous visitor')
      return
    }

    let cancelled = false
    const handleConnect = () => {
      clientLogger.log('✅ Socket connected for lobby list')
      socket?.emit('join-lobby-list')
    }

    const handleLobbyListUpdate = () => {
      clientLogger.log('📡 Lobby list update received')
      void loadLobbiesRef.current({
        minimumRefreshingMs: AUTO_REFRESH_FEEDBACK_MS,
        indicatorMode: 'auto',
      })
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
  }, [authenticatedUserId, hasAuthenticatedSession, isGuest, guestToken, status])

  const hasActiveFilters = hasActiveLobbyFilters(filters)
  const isManualRefreshing = refreshIndicatorMode === 'manual'
  const isAutoRefreshing = refreshIndicatorMode === 'auto'
  const isRefreshUpdated = refreshIndicatorMode === 'updated'
  const isRefreshLocked = loading || isManualRefreshing || isRefreshUpdated
  // Wait for i18n to be ready before rendering
  if (!ready || !i18n.isInitialized) {
    return <LoadingSkeleton />
  }

  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Page header */}
        <div className="bd-card" style={{ padding: '28px 32px', marginBottom: 24, position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg, white 0%, rgba(155,140,255,0.08) 100%)' }}>
          <div className="bd-dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.35 }} />
          <div style={{ position: 'relative', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <button
                type="button"
                onClick={() => router.push('/games')}
                className="bd-btn bd-btn-soft"
                style={{ padding: '8px 14px', fontSize: 14, marginBottom: 16 }}
              >
                ← {t('lobby.backToGames')}
              </button>
              <span className="bd-kicker" style={{ display: 'block', marginBottom: 8 }}>Lobbies</span>
              <h1 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 'clamp(32px,4vw,52px)', lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--bd-ink)', marginBottom: 8 }}>
                {t('lobby.title')}
              </h1>
              <p style={{ color: 'var(--bd-ink-soft)', fontSize: 15, maxWidth: 480 }}>
                {t('lobby.subtitle')}
              </p>
              <div style={{ marginTop: 12 }}>
                <span className="bd-chip">
                  <span className="bd-live-dot" style={{ width: 6, height: 6 }} />
                  {t('lobby.lobbiesCount', { count: lobbies.length })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/lobby/create')}
              style={{
                background: 'var(--bd-coral)', color: 'white', border: '3px solid var(--bd-ink)',
                borderRadius: 24, padding: '24px 28px', textAlign: 'left', cursor: 'pointer',
                boxShadow: '6px 6px 0 var(--bd-ink)', transition: 'transform 0.15s, box-shadow 0.15s',
                minWidth: 280, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 8,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '6px 8px 0 var(--bd-ink)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '6px 6px 0 var(--bd-ink)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <span className="bd-kicker" style={{ color: 'rgba(255,255,255,0.75)' }}>{t('lobby.createLobby')}</span>
                  <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22, marginTop: 6 }}>{t('lobby.createNew')}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{t('lobby.createDescription')}</div>
                </div>
                <span style={{ fontSize: 28 }}>✨</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{t('lobby.getStarted')} →</div>
            </button>
          </div>

          <div style={{ marginTop: 24 }}>
            <LobbyStats
              totalLobbies={stats.totalLobbies}
              waitingLobbies={stats.waitingLobbies}
              playingLobbies={stats.playingLobbies}
              totalPlayers={stats.totalPlayers}
            />
          </div>
        </div>

        {/* Lobbies list */}
        <div className="bd-card" style={{ padding: 24 }}>
          <div style={{ borderBottom: '1px solid var(--bd-line)', paddingBottom: 20, marginBottom: 20 }}>
            <LobbyFilters embedded filters={filters} onFiltersChange={setFilters} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--bd-ink)' }}>
                {t('lobby.activeLobbies')}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--bd-ink-muted)', marginTop: 2 }}>
                {t('lobby.lobbiesCount', { count: lobbies.length })}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading || isManualRefreshing}
              className="bd-btn bd-btn-soft"
              style={{
                padding: '10px 16px', fontSize: 13,
                background: isRefreshUpdated ? 'rgba(79,201,166,0.15)' : undefined,
                borderColor: isRefreshUpdated ? 'rgba(79,201,166,0.4)' : undefined,
                color: isRefreshUpdated ? 'var(--bd-mint-deep)' : undefined,
              }}
              title={t('lobby.refresh')}
            >
              <span style={{ display: 'inline-block', transition: 'transform 0.3s', transform: (isManualRefreshing || isAutoRefreshing) ? 'rotate(360deg)' : 'none' }}>
                {isRefreshUpdated ? '✓' : '↻'}
              </span>
              {isManualRefreshing ? t('lobby.refreshing') : isRefreshUpdated ? t('lobby.updated') : t('lobby.refresh')}
              <span className="sr-only" aria-live="polite">{isAutoRefreshing ? t('lobby.refreshing') : isRefreshUpdated ? t('lobby.updated') : ''}</span>
            </button>
          </div>

          {hasLoadError && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(255,196,77,0.12)', border: '1.5px solid rgba(255,196,77,0.3)', borderRadius: 12, fontSize: 14, color: 'var(--bd-sun-deep)' }}>
              {t('lobby.loadFailed')}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height: 120, borderRadius: 18, background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)', animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎲</div>
              <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 24, color: 'var(--bd-ink)', marginBottom: 8 }}>
                {hasActiveFilters ? t('lobby.noFilterMatches') : t('lobby.noLobbies')}
              </h3>
              <p style={{ fontSize: 15, color: 'var(--bd-ink-muted)', maxWidth: 400, margin: '0 auto 24px' }}>
                {hasActiveFilters ? t('lobby.noFilterMatchesDescription') : t('lobby.noLobbiesDescription')}
              </p>
              <button
                onClick={hasActiveFilters
                  ? () => setFilters({ gameType: undefined, status: 'all', search: '', minPlayers: undefined, maxPlayers: undefined, sortBy: 'createdAt', sortOrder: 'desc' })
                  : () => router.push('/lobby/create')
                }
                className="bd-btn bd-btn-coral bd-btn-lg"
              >
                {hasActiveFilters ? t('lobby.filters.clearAll') : t('lobby.createFirst')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
