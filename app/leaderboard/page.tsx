'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { getGameMetadata } from '@/lib/game-catalog'

interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  gamesPlayed: number
  wins: number
  winRate: number
}

const GAME_FILTERS = [
  { value: '', label: 'All Games', icon: '🎮' },
  { value: 'yahtzee', label: 'Yahtzee', icon: '🎲' },
  { value: 'tic_tac_toe', label: 'Tic Tac Toe', icon: '❌' },
  { value: 'rock_paper_scissors', label: 'Rock Paper Scissors', icon: '🍂' },
  { value: 'guess_the_spy', label: 'Guess the Spy', icon: '🕵️' },
  { value: 'memory', label: 'Memory', icon: '🧠' },
]

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function LeaderboardPage() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [gameType, setGameType] = useState('')
  const [period, setPeriod] = useState<'all' | '30d'>('all')
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(
    async (nextPage: number, replace: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          period,
          page: String(nextPage),
        })
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

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    fetchLeaderboard(next, false)
  }

  return (
    <div className="page-shell bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-white drop-shadow-lg mb-2">
            🏆 {t('leaderboard.title', 'Leaderboard')}
          </h1>
          <p className="text-white/60 text-sm">
            {t('leaderboard.subtitle', 'Top players ranked by win rate (min 10 games)')}
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-3">
          {/* Period toggle */}
          <div className="flex gap-2">
            {(['all', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all border ${
                  period === p
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/40'
                    : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'
                }`}
              >
                {p === 'all' ? t('leaderboard.allTime', 'All Time') : t('leaderboard.last30days', 'Last 30 Days')}
              </button>
            ))}
          </div>

          {/* Game type filter */}
          <div className="flex flex-wrap gap-2">
            {GAME_FILTERS.map((f) => {
              const meta = f.value ? getGameMetadata(f.value) : null
              const icon = meta?.icon ?? f.icon
              const label = meta?.name ?? f.label
              return (
                <button
                  key={f.value}
                  onClick={() => setGameType(f.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-xs transition-all border ${
                    gameType === f.value
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem] gap-2 px-4 py-2.5 border-b border-white/10 text-xs font-semibold uppercase tracking-wide text-white/40">
            <span>#</span>
            <span>{t('leaderboard.player', 'Player')}</span>
            <span className="text-right">{t('leaderboard.gamesPlayed', 'Played')}</span>
            <span className="text-right">{t('leaderboard.wins', 'Wins')}</span>
            <span className="text-right">{t('leaderboard.winRate', 'Win %')}</span>
          </div>

          {loading && entries.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3 animate-bounce">🏆</div>
              <p className="text-white/50 text-sm">{t('leaderboard.loading', 'Loading leaderboard…')}</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-white/40 text-sm">{t('leaderboard.empty', 'No qualifying players yet')}</p>
              <p className="text-white/25 text-xs mt-1">{t('leaderboard.emptyHint', 'Play at least 10 games to appear here')}</p>
            </div>
          ) : (
            entries.map((entry, idx) => {
              const medal = MEDAL[entry.rank]
              const isTop3 = entry.rank <= 3
              return (
                <Link
                  key={entry.userId}
                  href={`/profile/${entry.userId}`}
                  className={`grid grid-cols-[3rem_1fr_5rem_5rem_5rem] gap-2 px-4 py-3 items-center transition-colors hover:bg-white/8 ${
                    idx < entries.length - 1 ? 'border-b border-white/8' : ''
                  } ${isTop3 ? 'bg-white/3' : ''}`}
                >
                  <span
                    className={`text-center font-bold text-sm ${
                      medal ? 'text-xl' : 'text-white/50'
                    }`}
                  >
                    {medal ?? entry.rank}
                  </span>
                  <span className="font-semibold text-white text-sm truncate">
                    {entry.username}
                  </span>
                  <span className="text-right text-white/60 text-sm">{entry.gamesPlayed}</span>
                  <span className="text-right text-white/60 text-sm">{entry.wins}</span>
                  <span
                    className={`text-right font-bold text-sm ${
                      entry.winRate >= 60
                        ? 'text-emerald-300'
                        : entry.winRate >= 40
                          ? 'text-amber-300'
                          : 'text-white/60'
                    }`}
                  >
                    {entry.winRate}%
                  </span>
                </Link>
              )
            })
          )}

          {hasMore && (
            <div className="px-4 py-3 border-t border-white/10">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-sm font-semibold transition-all disabled:opacity-40"
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
