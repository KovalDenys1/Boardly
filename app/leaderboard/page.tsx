'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { getAvailableGameTypes, getGameMetadata } from '@/lib/game-catalog'

interface LeaderboardEntry {
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

const getCompactGameIcon = (type: string, icon: string) => COMPACT_GAME_ICONS[type] ?? icon

const GAME_FILTERS = [
  { value: '', label: 'All Games', icon: '🎮', displayIcon: '🎮' },
  ...getAvailableGameTypes().map((type) => {
    const meta = getGameMetadata(type)
    const icon = meta?.icon ?? '🎮'
    return {
      value: type,
      label: meta?.name ?? type,
      icon,
      displayIcon: getCompactGameIcon(type, icon),
    }
  }),
]

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const rankAccent = (rank: number) => {
  if (rank === 1) return 'var(--bd-sun)'
  if (rank === 2) return 'var(--bd-lav)'
  if (rank === 3) return 'var(--bd-mint)'
  return 'var(--bd-bg2)'
}

const winRateColor = (winRate: number) => {
  if (winRate >= 60) return 'var(--bd-mint-deep)'
  if (winRate >= 40) return 'var(--bd-sun-deep)'
  return 'var(--bd-ink-soft)'
}

export default function LeaderboardPage() {
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
      if (!gameMenuRef.current?.contains(event.target as Node)) {
        setGameMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGameMenuOpen(false)
      }
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

  return (
    <div className="bd-page bd-screen page-shell">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_21rem] lg:items-end">
          <div>
            <span className="bd-kicker">Hall of fame</span>
            <h1
              className="mt-3 max-w-3xl text-[clamp(2.5rem,7vw,5rem)] font-extrabold leading-[0.92] text-bd-ink"
              style={{ fontFamily: 'var(--bd-font-display)' }}
            >
              {t('leaderboard.title', 'Leaderboard')}
              <span className="block text-bd-coral">{selectedFilter.label}</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-bd-ink-soft sm:text-lg">
              {t('leaderboard.subtitle', 'Top players ranked by win rate (min 10 games)')}
            </p>
          </div>

          <div className="bd-card relative overflow-hidden p-5">
            <div
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full"
              style={{ background: 'rgba(255,196,77,0.28)' }}
            />
            <div className="relative flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-sun text-3xl shadow-bd-ink-4">
                🏆
              </div>
              <div className="min-w-0">
                <p className="bd-kicker">{period === 'all' ? t('leaderboard.allTime', 'All Time') : t('leaderboard.last30days', 'Last 30 Days')}</p>
                <p className="mt-1 truncate text-lg font-bold text-bd-ink">
                  {topPlayer?.username ?? t('leaderboard.empty', 'No qualifying players yet')}
                </p>
                <p className="text-sm text-bd-ink-muted">
                  {topPlayer ? `${topPlayer.winRate}% ${t('leaderboard.winRate', 'Win %')}` : t('leaderboard.emptyHint', 'Play at least 10 games to appear here')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap gap-2">
            {(['all', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`bd-chip px-4 py-2 text-sm transition-all ${
                  period === p
                    ? 'border-bd-ink bg-bd-ink text-bd-bg'
                    : 'hover:border-bd-ink hover:bg-white'
                }`}
              >
                {p === 'all' ? t('leaderboard.allTime', 'All Time') : t('leaderboard.last30days', 'Last 30 Days')}
              </button>
            ))}
          </div>

          <div className="flex lg:justify-end">
            <div ref={gameMenuRef} className="relative w-full sm:w-auto">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={gameMenuOpen}
                onClick={() => setGameMenuOpen((open) => !open)}
                className={`flex w-full min-w-64 items-center justify-between gap-4 rounded-2xl border-2 bg-white px-4 py-3 text-left shadow-[0_4px_0_#E8DDC8] transition-all sm:w-auto ${
                  gameMenuOpen
                    ? 'border-bd-ink shadow-[0_5px_0_#1F1B16]'
                    : 'border-bd-line hover:border-bd-ink hover:shadow-[0_5px_0_#1F1B16]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-bd-bg2 text-lg leading-none">
                    {selectedFilter.displayIcon}
                  </span>
                  <span className="min-w-0">
                    <span className="bd-kicker block text-[10px]">Game filter</span>
                    <span className="block truncate text-sm font-bold text-bd-ink">{selectedFilter.label}</span>
                  </span>
                </span>
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bd-bg2 text-sm font-bold text-bd-ink transition-transform ${
                    gameMenuOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>

              {gameMenuOpen && (
                <div
                  className="absolute right-0 z-30 mt-3 w-full min-w-72 overflow-hidden rounded-2xl border-2 border-bd-ink bg-white shadow-[0_8px_0_#1F1B16,0_18px_36px_-18px_rgba(31,27,22,0.45)] sm:w-80"
                  role="listbox"
                  aria-label="Game filter"
                >
                  <div className="border-b border-bd-line bg-bd-card-warm px-4 py-3">
                    <p className="bd-kicker">Choose game</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {GAME_FILTERS.map((f) => {
                      const meta = f.value ? getGameMetadata(f.value) : null
                      const icon = f.value ? getCompactGameIcon(f.value, meta?.icon ?? f.icon) : f.displayIcon
                      const label = meta?.name ?? f.label
                      const selected = gameType === f.value

                      return (
                        <button
                          key={f.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => handleGameFilterSelect(f.value)}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? 'bg-bd-lav text-white'
                              : 'text-bd-ink hover:bg-bd-card-warm'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl text-lg leading-none ${
                                selected ? 'bg-white/20' : 'bg-bd-bg2'
                              }`}
                            >
                              {icon}
                            </span>
                            <span className="truncate text-sm font-bold">{label}</span>
                          </span>
                          {selected && (
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-bd-lav-deep">
                              ✓
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="bd-card p-4">
            <p className="bd-kicker">Players</p>
            <p className="mt-2 truncate text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
              {entries.length}
            </p>
          </div>
          <div className="bd-card p-4">
            <p className="bd-kicker">{t('leaderboard.wins', 'Wins')}</p>
            <p className="mt-2 truncate text-2xl font-extrabold text-bd-coral" style={{ fontFamily: 'var(--bd-font-display)' }}>
              {visibleWins}
            </p>
          </div>
          <div className="bd-card p-4">
            <p className="bd-kicker">{t('leaderboard.gamesPlayed', 'Played')}</p>
            <p className="mt-2 truncate text-2xl font-extrabold text-bd-lav-deep" style={{ fontFamily: 'var(--bd-font-display)' }}>
              {entries.reduce((total, entry) => total + entry.gamesPlayed, 0)}
            </p>
          </div>
        </div>

        <div className="bd-card overflow-hidden">
          <div className="hidden grid-cols-[4rem_minmax(0,1fr)_6rem_6rem_6rem] gap-3 border-b border-bd-line bg-bd-card-warm px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-bd-ink-muted sm:grid">
            <span>Rank</span>
            <span>{t('leaderboard.player', 'Player')}</span>
            <span className="text-right">{t('leaderboard.gamesPlayed', 'Played')}</span>
            <span className="text-right">{t('leaderboard.wins', 'Wins')}</span>
            <span className="text-right">{t('leaderboard.winRate', 'Win %')}</span>
          </div>

          {loading && entries.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-sun text-3xl shadow-bd-ink-4">
                🏆
              </div>
              <p className="text-sm font-semibold text-bd-ink-muted">{t('leaderboard.loading', 'Loading leaderboard…')}</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-bd-coral-deep">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-lav text-3xl shadow-bd-ink-4">
                ☆
              </div>
              <p className="font-bold text-bd-ink">{t('leaderboard.empty', 'No qualifying players yet')}</p>
              <p className="mt-1 text-sm text-bd-ink-muted">{t('leaderboard.emptyHint', 'Play at least 10 games to appear here')}</p>
            </div>
          ) : (
            entries.map((entry, idx) => {
              const medal = MEDAL[entry.rank]
              const isTop3 = entry.rank <= 3
              const rowClass = `grid gap-3 px-4 py-4 transition-colors sm:grid-cols-[4rem_minmax(0,1fr)_6rem_6rem_6rem] sm:items-center sm:px-5 ${
                entry.publicProfileId ? 'hover:bg-bd-card-warm' : ''
              } ${idx < entries.length - 1 ? 'border-b border-bd-line' : ''} ${
                isTop3 ? 'bg-white' : 'bg-white/75'
              }`

              const rowContent = (
                <>
                  <div className="flex items-center gap-3 sm:block">
                    <span
                      className="inline-grid h-11 w-11 place-items-center rounded-2xl border-2 border-bd-ink text-sm font-extrabold text-bd-ink shadow-[2px_2px_0_#1F1B16]"
                      style={{ background: rankAccent(entry.rank), fontFamily: 'var(--bd-font-display)' }}
                    >
                      {medal ?? entry.rank}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">
                      Rank
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-base font-bold text-bd-ink">
                      {entry.username}
                    </span>
                    {entry.publicProfileId && (
                      <span className="text-xs font-semibold text-bd-ink-muted">
                        View profile ↗
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:contents">
                    <span className="rounded-xl bg-bd-bg2 px-3 py-2 text-left text-sm font-semibold text-bd-ink-soft sm:bg-transparent sm:p-0 sm:text-right">
                      <span className="block text-[10px] uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.gamesPlayed', 'Played')}</span>
                      {entry.gamesPlayed}
                    </span>
                    <span className="rounded-xl bg-bd-bg2 px-3 py-2 text-left text-sm font-semibold text-bd-ink-soft sm:bg-transparent sm:p-0 sm:text-right">
                      <span className="block text-[10px] uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.wins', 'Wins')}</span>
                      {entry.wins}
                    </span>
                    <span
                      className="rounded-xl bg-bd-bg2 px-3 py-2 text-left text-sm font-extrabold sm:bg-transparent sm:p-0 sm:text-right"
                      style={{ color: winRateColor(entry.winRate) }}
                    >
                      <span className="block text-[10px] uppercase tracking-[0.1em] text-bd-ink-muted sm:hidden">{t('leaderboard.winRate', 'Win %')}</span>
                      {entry.winRate}%
                    </span>
                  </div>
                </>
              )

              return entry.publicProfileId ? (
                <Link key={entry.userId} href={`/u/${entry.publicProfileId}`} className={rowClass}>
                  {rowContent}
                </Link>
              ) : (
                <div key={entry.userId} className={rowClass}>
                  {rowContent}
                </div>
              )
            })
          )}

          {hasMore && (
            <div className="border-t border-bd-line bg-bd-card-warm px-4 py-4">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="bd-btn bd-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? t('leaderboard.loading', 'Loading…') : t('leaderboard.loadMore', 'Load more')}
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
