'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { clientLogger } from '@/lib/client-logger'
import { getSupabaseClient } from '@/lib/supabase-client'
import {
  buildLobbyQueryParams,
  hasActiveLobbyFilters,
  type LobbyFilterOptions,
  parseFiltersFromSearchParams,
} from '@/lib/lobby-filters'
import type { LobbyCardData } from '@/components/LobbyCard'

export interface LobbyStats {
  totalLobbies: number
  waitingLobbies: number
  playingLobbies: number
  totalPlayers: number
}

interface LobbyListResponse {
  lobbies: LobbyCardData[]
  stats: LobbyStats
}

interface LoadLobbiesOptions {
  minimumRefreshingMs?: number
  indicatorMode?: 'manual' | 'auto' | 'silent'
}

const EMPTY_STATS: LobbyStats = { totalLobbies: 0, waitingLobbies: 0, playingLobbies: 0, totalPlayers: 0 }
const AUTO_REFRESH_INTERVAL_MS = 15000
const REFRESH_SPIN_DURATION_MS = 900
const AUTO_REFRESH_FEEDBACK_MS = REFRESH_SPIN_DURATION_MS * 2
const MANUAL_REFRESH_FEEDBACK_MS = REFRESH_SPIN_DURATION_MS * 2
const MANUAL_REFRESH_SUCCESS_MS = 1200

export function useLobbyList() {
  const { t, ready } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const { isGuest } = useGuest()

  const authenticatedUserId = session?.user?.id ?? null

  const [lobbies, setLobbies] = useState<LobbyCardData[]>([])
  const [stats, setStats] = useState<LobbyStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshIndicatorMode, setRefreshIndicatorMode] = useState<'idle' | 'manual' | 'auto' | 'updated'>('idle')
  const [hasLoadError, setHasLoadError] = useState(false)
  const [filters, setFilters] = useState<LobbyFilterOptions>(() => parseFiltersFromSearchParams(searchParams))

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

    if (indicatorMode === 'auto' && manualRefreshInFlightRef.current) return false
    if (isInitialLoad) setLoading(true)
    else setRefreshing(true)

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
      const res = await fetch(query ? `/api/lobby?${query}` : '/api/lobby', { cache: 'no-store', signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const data: LobbyListResponse = await res.json()
      if (controller.signal.aborted || requestId !== loadRequestIdRef.current) return false
      if ('error' in data) clientLogger.warn('Lobbies loaded with error:', (data as Record<string, unknown>).error)
      setHasLoadError(false)
      setLobbies(data.lobbies || [])
      setStats(data.stats || EMPTY_STATS)
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false
      clientLogger.error('Failed to load lobbies:', error)
      setHasLoadError(true)
      if (!initializedRef.current) { setLobbies([]); setStats(EMPTY_STATS) }
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
          if (totalRemainingMs > 0) await new Promise((resolve) => setTimeout(resolve, totalRemainingMs))
        }
        if (requestId === loadRequestIdRef.current) {
          if (isInitialLoad) setLoading(false)
          else setRefreshing(false)
          if (indicatorMode === 'auto') setRefreshIndicatorMode('idle')
        }
      }
    }
  }, [clearRefreshIndicatorTimeout, filters])

  const handleRefresh = useCallback(async () => {
    if (loading || manualRefreshInFlightRef.current || refreshIndicatorMode === 'updated') return
    manualRefreshInFlightRef.current = true
    clearRefreshIndicatorTimeout()
    setRefreshIndicatorMode('manual')
    const didRefresh = await loadLobbies({ minimumRefreshingMs: MANUAL_REFRESH_FEEDBACK_MS, indicatorMode: 'manual' })
    manualRefreshInFlightRef.current = false
    if (!didRefresh) { setRefreshIndicatorMode('idle'); return }
    setRefreshIndicatorMode('updated')
    refreshIndicatorTimeoutRef.current = setTimeout(() => {
      setRefreshIndicatorMode('idle')
      refreshIndicatorTimeoutRef.current = null
    }, MANUAL_REFRESH_SUCCESS_MS)
  }, [clearRefreshIndicatorTimeout, loadLobbies, loading, refreshIndicatorMode])

  // Sync filters to URL
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const params = buildLobbyQueryParams(filters)
    const newPath = params.toString() ? `/lobby?${params.toString()}` : '/lobby'
    router.replace(newPath, { scroll: false })
  }, [filters, router])

  // Keep ref in sync with latest loadLobbies and re-fetch on filter change
  useEffect(() => {
    loadLobbiesRef.current = loadLobbies
    if (initializedRef.current) void loadLobbies()
  }, [loadLobbies])

  // Initial load + auto-refresh interval
  useEffect(() => {
    let cancelled = false
    const initializeLobbyList = async () => {
      await loadLobbiesRef.current()
      if (!cancelled) initializedRef.current = true
    }
    void initializeLobbyList()
    const refreshInterval = setInterval(() => {
      void loadLobbiesRef.current({ minimumRefreshingMs: AUTO_REFRESH_FEEDBACK_MS, indicatorMode: 'auto' })
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(refreshInterval)
      loadAbortControllerRef.current?.abort()
      clearRefreshIndicatorTimeout()
      manualRefreshInFlightRef.current = false
    }
  }, [clearRefreshIndicatorTimeout])

  // Supabase Realtime: subscribe to Lobbies table changes for live lobby list updates
  useEffect(() => {
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel('lobby-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Lobbies' }, () => {
        clientLogger.log('📡 Lobby list update received via Supabase Realtime')
        void loadLobbiesRef.current({ minimumRefreshingMs: AUTO_REFRESH_FEEDBACK_MS, indicatorMode: 'auto' })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  const clearAllFilters = useCallback(() =>
    setFilters({ gameType: undefined, status: 'all', search: '', minPlayers: undefined, maxPlayers: undefined, sortBy: 'createdAt', sortOrder: 'desc' }),
  [])

  return {
    t,
    ready,
    router,
    lobbies,
    stats,
    loading,
    refreshing,
    hasLoadError,
    hasActiveFilters: hasActiveLobbyFilters(filters),
    filters,
    setFilters,
    handleRefresh,
    clearAllFilters,
    isManualRefreshing: refreshIndicatorMode === 'manual',
    isAutoRefreshing: refreshIndicatorMode === 'auto',
    isRefreshUpdated: refreshIndicatorMode === 'updated',
    isRefreshLocked: loading || refreshIndicatorMode === 'manual' || refreshIndicatorMode === 'updated',
  }
}
