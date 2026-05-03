import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { getAvailableGameTypes, getGameMetadata } from '@/lib/game-catalog'

export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  publicProfileId: string | null
  gamesPlayed: number
  wins: number
  winRate: number
}

const COMPACT_GAME_ICONS: Record<string, string> = {
  tic_tac_toe: '❌',
  rock_paper_scissors: '✊',
}

export const getCompactGameIcon = (type: string, icon: string) => COMPACT_GAME_ICONS[type] ?? icon

export const GAME_FILTERS = [
  { value: '', label: 'All Games', icon: '🎮', displayIcon: '🎮' },
  ...getAvailableGameTypes().map((type) => {
    const meta = getGameMetadata(type)
    const icon = meta?.icon ?? '🎮'
    return { value: type, label: meta?.name ?? type, icon, displayIcon: getCompactGameIcon(type, icon) }
  }),
]

export function useLeaderboard() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [gameType, setGameType] = useState('')
  const [period, setPeriod] = useState<'all' | '30d'>('all')
  const [hasMore, setHasMore] = useState(false)
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
    fetchLeaderboard(0, true)
  }, [gameType, period, fetchLeaderboard])

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
