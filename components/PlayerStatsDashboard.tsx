'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { clientLogger } from '@/lib/client-logger'
import { formatGameTypeLabel } from '@/lib/game-display'
import { useTranslation } from '@/lib/i18n-helpers'

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
  const { t } = useTranslation()
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
        throw new Error(data?.error || t('profile.stats.dashboard.errors.failedToLoad'))
      }

      setStats(data)
    } catch (err) {
      clientLogger.error('Failed to load player statistics', err)
      setError((err as Error).message || t('profile.stats.dashboard.errors.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [appliedRange.from, appliedRange.to, t, userId])

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
      setError(t('profile.stats.dashboard.filters.invalidRange'))
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
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {t('profile.stats.dashboard.title')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('profile.stats.dashboard.subtitle')}
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              {t('profile.stats.dashboard.filters.from')}
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
              {t('profile.stats.dashboard.filters.to')}
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
            {t('profile.stats.dashboard.filters.apply')}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
            >
              {t('profile.stats.dashboard.filters.last30Days')}
            </button>
            <button
              type="button"
              onClick={() => applyPreset(90)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
            >
              {t('profile.stats.dashboard.filters.last90Days')}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold"
            >
              {t('profile.stats.dashboard.filters.allTime')}
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
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.totalGames')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.totalGames}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.winRate')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.winRate}%</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.avgDuration')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.overall.avgGameDurationMinutes}
                {t('profile.stats.dashboard.summary.minutesSuffix')}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.favoriteGame')}
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                {stats.overall.favoriteGame
                  ? formatGameTypeLabel(stats.overall.favoriteGame)
                  : t('profile.stats.dashboard.common.notAvailable')}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.wld')}
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {stats.overall.wins} / {stats.overall.losses} / {stats.overall.draws}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.currentStreak')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.currentWinStreak}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.bestStreak')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.overall.longestWinStreak}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('profile.stats.dashboard.summary.generated')}
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {new Date(stats.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
              {t('profile.stats.dashboard.sections.byGame.title')}
            </h3>
            {stats.byGame.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('profile.stats.dashboard.sections.byGame.empty')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 pr-4">{t('profile.stats.dashboard.sections.byGame.columns.game')}</th>
                      <th className="py-2 pr-4">{t('profile.stats.dashboard.sections.byGame.columns.played')}</th>
                      <th className="py-2 pr-4">{t('profile.stats.dashboard.sections.byGame.columns.wld')}</th>
                      <th className="py-2 pr-4">{t('profile.stats.dashboard.sections.byGame.columns.winRate')}</th>
                      <th className="py-2 pr-4">{t('profile.stats.dashboard.sections.byGame.columns.avgScore')}</th>
                      <th className="py-2 pr-4">{t('profile.stats.dashboard.sections.byGame.columns.bestScore')}</th>
                      <th className="py-2">{t('profile.stats.dashboard.sections.byGame.columns.lastPlayed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byGame.map((item) => (
                      <tr key={item.gameType} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                          {formatGameTypeLabel(item.gameType)}
                        </td>
                        <td className="py-2 pr-4">{item.gamesPlayed}</td>
                        <td className="py-2 pr-4">
                          {item.wins}/{item.losses}/{item.draws}
                        </td>
                        <td className="py-2 pr-4">{item.winRate}%</td>
                        <td className="py-2 pr-4">{item.avgScore ?? t('profile.stats.dashboard.common.notAvailable')}</td>
                        <td className="py-2 pr-4">{item.bestScore ?? t('profile.stats.dashboard.common.notAvailable')}</td>
                        <td className="py-2">
                          {item.lastPlayed
                            ? new Date(item.lastPlayed).toLocaleDateString()
                            : t('profile.stats.dashboard.common.notAvailable')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t('profile.stats.dashboard.sections.recentTrend.title')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {t('profile.stats.dashboard.sections.recentTrend.subtitle')}
            </p>
            {trendPoints.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('profile.stats.dashboard.sections.recentTrend.empty')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-2 min-w-[720px] h-44">
                  {trendPoints.map((point) => (
                    <div key={point.date} className="flex flex-col items-center gap-2">
                      <div className="flex items-end gap-1 h-36">
                        <div
                          className="w-2 rounded-t bg-blue-500"
                          style={{ height: `${(point.gamesPlayed / trendMax) * 100}%` }}
                          title={t('profile.stats.dashboard.sections.recentTrend.gamesTooltip', {
                            date: point.date,
                            count: point.gamesPlayed,
                          })}
                        />
                        <div
                          className="w-2 rounded-t bg-emerald-500"
                          style={{ height: `${(point.wins / trendMax) * 100}%` }}
                          title={t('profile.stats.dashboard.sections.recentTrend.winsTooltip', {
                            date: point.date,
                            count: point.wins,
                          })}
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
