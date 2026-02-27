'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { clientLogger } from '@/lib/client-logger'

interface OverallStats {
  totalGames: number
  wins: number
  losses: number
  draws: number
  winRate: number
  avgGameDurationMinutes: number
  favoriteGame: string | null
  currentWinStreak: number
  longestWinStreak: number
}

interface ByGameStats {
  gameType: string
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
  winRate: number
  avgScore: number | null
  bestScore: number | null
  lastPlayed: string | null
}

interface TrendPoint {
  date: string
  gamesPlayed: number
  wins: number
}

interface StatsResponse {
  userId: string
  overall: OverallStats
  byGame: ByGameStats[]
  trends: TrendPoint[]
  generatedAt: string
}

interface DateRange {
  from: string
  to: string
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatGameType(gameType: string): string {
  switch (gameType) {
    case 'yahtzee':
      return 'Yahtzee'
    case 'guess_the_spy':
      return 'Guess the Spy'
    case 'tic_tac_toe':
      return 'Tic-Tac-Toe'
    case 'rock_paper_scissors':
      return 'Rock Paper Scissors'
    case 'uno':
      return 'Uno'
    case 'chess':
      return 'Chess'
    default:
      return gameType
  }
}

function buildDefaultRange(): DateRange {
  const now = new Date()
  const from = new Date(now)
  from.setDate(now.getDate() - 30)

  return {
    from: toDateInputValue(from),
    to: toDateInputValue(now),
  }
}

interface PlayerStatsDashboardProps {
  userId: string
}

export default function PlayerStatsDashboard({ userId }: PlayerStatsDashboardProps) {
  const [draftRange, setDraftRange] = useState<DateRange>(() => buildDefaultRange())
  const [appliedRange, setAppliedRange] = useState<DateRange>(() => buildDefaultRange())
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (appliedRange.from) params.set('from', appliedRange.from)
      if (appliedRange.to) params.set('to', appliedRange.to)

      const response = await fetch(`/api/user/${userId}/stats?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load statistics')
      }

      setStats(data)
    } catch (err) {
      clientLogger.error('Failed to load player statistics', err)
      setError((err as Error).message || 'Failed to load statistics')
    } finally {
      setLoading(false)
    }
  }, [appliedRange.from, appliedRange.to, userId])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const trendPoints = useMemo(() => {
    if (!stats) return []
    return stats.trends.slice(-30)
  }, [stats])

  const trendMax = useMemo(() => {
    const maxValue = trendPoints.reduce((acc, point) => Math.max(acc, point.gamesPlayed), 0)
    return maxValue > 0 ? maxValue : 1
  }, [trendPoints])

  const applyDateRange = () => {
    if (draftRange.from && draftRange.to && draftRange.from > draftRange.to) {
      setError('`From` must be earlier than `To`.')
      return
    }
    setAppliedRange(draftRange)
  }

  const applyPreset = (days: number | 'all') => {
    if (days === 'all') {
      setDraftRange({ from: '', to: '' })
      setAppliedRange({ from: '', to: '' })
      return
    }

    const now = new Date()
    const from = new Date(now)
    from.setDate(now.getDate() - days)
    const range = {
      from: toDateInputValue(from),
      to: toDateInputValue(now),
    }
    setDraftRange(range)
    setAppliedRange(range)
  }

  if (loading && !stats) {
    return (
      <div className="flex justify-center items-center py-10">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">📊 Statistics Dashboard</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Performance summary, per-game breakdown, and recent trend.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              From
            </label>
            <input
              type="date"
              value={draftRange.from}
              onChange={(event) => setDraftRange((prev) => ({ ...prev, from: event.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              To
            </label>
            <input
              type="date"
              value={draftRange.to}
              onChange={(event) => setDraftRange((prev) => ({ ...prev, to: event.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={applyDateRange}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            Apply
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
            >
              30d
            </button>
            <button
              type="button"
              onClick={() => applyPreset(90)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
            >
              90d
            </button>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
            >
              All time
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total games</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.totalGames}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Win rate</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.winRate}%</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg duration</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.overall.avgGameDurationMinutes}m
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Favorite game</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                {stats.overall.favoriteGame ? formatGameType(stats.overall.favoriteGame) : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Wins / Losses / Draws</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {stats.overall.wins} / {stats.overall.losses} / {stats.overall.draws}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current streak</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.currentWinStreak}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Best streak</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.longestWinStreak}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Generated</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {new Date(stats.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Per-game performance</h3>
            {stats.byGame.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">No completed games in selected range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 pr-4">Game</th>
                      <th className="py-2 pr-4">Played</th>
                      <th className="py-2 pr-4">W/L/D</th>
                      <th className="py-2 pr-4">Win rate</th>
                      <th className="py-2 pr-4">Avg score</th>
                      <th className="py-2 pr-4">Best score</th>
                      <th className="py-2">Last played</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byGame.map((item) => (
                      <tr key={item.gameType} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                          {formatGameType(item.gameType)}
                        </td>
                        <td className="py-2 pr-4">{item.gamesPlayed}</td>
                        <td className="py-2 pr-4">
                          {item.wins}/{item.losses}/{item.draws}
                        </td>
                        <td className="py-2 pr-4">{item.winRate}%</td>
                        <td className="py-2 pr-4">{item.avgScore ?? '—'}</td>
                        <td className="py-2 pr-4">{item.bestScore ?? '—'}</td>
                        <td className="py-2">
                          {item.lastPlayed ? new Date(item.lastPlayed).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Recent trend</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Blue = games played, Green = wins (last 30 activity points).
            </p>
            {trendPoints.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">No trend data in selected range.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-2 min-w-[720px] h-44">
                  {trendPoints.map((point) => (
                    <div key={point.date} className="flex flex-col items-center gap-2">
                      <div className="flex items-end gap-1 h-36">
                        <div
                          className="w-2 rounded-t bg-blue-500"
                          style={{ height: `${(point.gamesPlayed / trendMax) * 100}%` }}
                          title={`${point.date}: ${point.gamesPlayed} games`}
                        />
                        <div
                          className="w-2 rounded-t bg-emerald-500"
                          style={{ height: `${(point.wins / trendMax) * 100}%` }}
                          title={`${point.date}: ${point.wins} wins`}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">{point.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
