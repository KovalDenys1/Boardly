import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { getAvailableGameTypes, getGameMetadata } from '@/lib/game-catalog'
import type { LeaderboardEntry, LeaderboardPage } from '@/lib/leaderboard'

export type { LeaderboardEntry }

export type GameFilter = { value: string; label: string; svgId: string | null; accentColor: string }

export const GAME_FILTERS: GameFilter[] = [
  { value: '', label: '', svgId: null, accentColor: 'var(--bd-ink)' },
  ...getAvailableGameTypes().map((type) => {
    const meta = getGameMetadata(type)
    return {
      value: type,
      label: meta?.name ?? type,
      svgId: meta?.svgId ?? null,
      accentColor: meta?.accentColor ?? 'var(--bd-ink)',
    }
  }),
]

/**
 * `initial` is the first page the server already rendered for the current
 * URL (#922); the hook starts from it and skips the mount fetch, then owns
 * every later fetch (filter changes, load more).
 */
export function useLeaderboard(initial: LeaderboardPage | null = null) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFirstRender = useRef(true)
  const skipMountFetch = useRef(initial !== null)

  const initialPeriod = searchParams.get('period') === '30d' ? '30d' : 'all'
  const rawGameType = searchParams.get('gameType') ?? ''
  const initialGameType = GAME_FILTERS.some((f) => f.value === rawGameType) ? rawGameType : ''

  const [entries, setEntries] = useState<LeaderboardEntry[]>(initial?.entries ?? [])
  const [loading, setLoading] = useState(initial === null)
  const [gameType, setGameType] = useState(initialGameType)
  const [period, setPeriod] = useState<'all' | '30d'>(initialPeriod)
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [gameMenuOpen, setGameMenuOpen] = useState(false)
  const gameMenuRef = useRef<HTMLDivElement>(null)

  const fetchLeaderboard = useCallback(
    async (nextPage: number, replace: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ period, page: String(nextPage) })
        if (gameType) params.set('gameType', gameType)
        const res = await fetch(`/api/leaderboard?${params}`)
        if (!res.ok) throw new Error('Failed to fetch leaderboard')
        const data = await res.json()
        setEntries((prev) => (replace ? data.entries : [...prev, ...data.entries]))
        setHasMore(data.hasMore)
      } catch {
        setError(t('errors.general', 'Something went wrong'))
      } finally {
        setLoading(false)
      }
    },
    [gameType, period, t]
  )

  useEffect(() => {
    setPage(0)
    if (skipMountFetch.current) { skipMountFetch.current = false; return }
    fetchLeaderboard(0, true)
  }, [gameType, period, fetchLeaderboard])

  // Sync filter state to URL
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const params = new URLSearchParams()
    if (period !== 'all') params.set('period', period)
    if (gameType) params.set('gameType', gameType)
    const newPath = params.toString() ? `/leaderboard?${params.toString()}` : '/leaderboard'
    router.replace(newPath, { scroll: false })
  }, [period, gameType, router])

  useEffect(() => {
    if (!gameMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!gameMenuRef.current?.contains(event.target as Node)) setGameMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGameMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [gameMenuOpen])

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    fetchLeaderboard(next, false)
  }

  const handleGameFilterSelect = (value: string) => {
    setGameType(value)
    setGameMenuOpen(false)
  }

  const selectedFilter = GAME_FILTERS.find((f) => f.value === gameType) ?? GAME_FILTERS[0]
  const topPlayer = entries[0]
  const visibleWins = entries.reduce((total, entry) => total + entry.wins, 0)
  const totalGamesPlayed = entries.reduce((total, entry) => total + entry.gamesPlayed, 0)

  return {
    t,
    entries,
    loading,
    error,
    hasMore,
    gameType,
    period,
    setPeriod,
    gameMenuOpen,
    setGameMenuOpen,
    gameMenuRef,
    selectedFilter,
    topPlayer,
    visibleWins,
    totalGamesPlayed,
    handleLoadMore,
    handleGameFilterSelect,
  }
}
