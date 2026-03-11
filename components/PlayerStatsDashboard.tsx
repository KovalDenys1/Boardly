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

type RangePreset = 30 | 90 | 'all'

function formatPercent(value: number): string {
  return `${value}%`
}

function supportsScoreMetrics(stats: ByGameStats): boolean {
  return stats.avgScore !== null || stats.bestScore !== null
}

function getGameSelectClassName(isActive: boolean): string {
  return `w-full appearance-none rounded-xl border bg-white px-4 py-2.5 pr-10 text-sm font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:bg-gray-900 ${
    isActive
      ? 'border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300'
      : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
  }`
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildDefaultRange(): DateRange {
  return buildRangeForPreset(30)
}

function buildRangeForPreset(preset: RangePreset): DateRange {
  if (preset === 'all') {
    return {
      from: '',
      to: '',
    }
  }

  const now = new Date()
  const from = new Date(now)
  from.setDate(now.getDate() - preset)

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
  const [rangePreset, setRangePreset] = useState<RangePreset>(30)
  const [appliedRange, setAppliedRange] = useState<DateRange>(() => buildDefaultRange())
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [selectedGameType, setSelectedGameType] = useState('')
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

  useEffect(() => {
    if (!stats?.byGame.length) {
      setSelectedGameType('')
      return
    }

    setSelectedGameType((previousValue) => {
      if (stats.byGame.some((item) => item.gameType === previousValue)) {
        return previousValue
      }

      return stats.byGame[0].gameType
    })
  }, [stats])

  const selectPreset = (preset: RangePreset) => {
    setRangePreset(preset)
    setAppliedRange(buildRangeForPreset(preset))
  }

  const summaryCards = useMemo(() => {
    if (!stats) return []

    return [
      {
        id: 'games',
        label: t('profile.stats.dashboard.summary.totalGames'),
        value: String(stats.overall.totalGames),
      },
      {
        id: 'favoriteGame',
        label: t('profile.stats.dashboard.summary.favoriteGame'),
        value: stats.overall.favoriteGame
          ? formatGameTypeLabel(stats.overall.favoriteGame)
          : t('profile.stats.dashboard.common.notAvailable'),
      },
    ]
  }, [stats, t])

  const selectedGameStats = useMemo(() => {
    if (!stats?.byGame.length) {
      return null
    }

    return stats.byGame.find((item) => item.gameType === selectedGameType) ?? stats.byGame[0]
  }, [selectedGameType, stats])

  const selectedGameLabel = selectedGameStats ? formatGameTypeLabel(selectedGameStats.gameType) : ''

  const recordItems = useMemo(() => {
    if (!selectedGameStats) return []

    return [
      {
        id: 'wins',
        label: t('profile.stats.dashboard.summary.wins'),
        value: selectedGameStats.wins,
      },
      {
        id: 'losses',
        label: t('profile.stats.dashboard.summary.losses'),
        value: selectedGameStats.losses,
      },
      {
        id: 'draws',
        label: t('profile.stats.dashboard.summary.draws'),
        value: selectedGameStats.draws,
      },
    ]
  }, [selectedGameStats, t])

  const quickFacts = useMemo(() => {
    if (!selectedGameStats) return []

    const lastPlayedValue = selectedGameStats.lastPlayed
      ? new Date(selectedGameStats.lastPlayed).toLocaleDateString()
      : t('profile.stats.dashboard.common.notAvailable')

    if (supportsScoreMetrics(selectedGameStats)) {
      return [
        {
          id: 'played',
          label: t('profile.stats.dashboard.sections.byGame.columns.played'),
          value: String(selectedGameStats.gamesPlayed),
        },
        {
          id: 'avgScore',
          label: t('profile.stats.dashboard.sections.byGame.columns.avgScore'),
          value:
            selectedGameStats.avgScore === null
              ? t('profile.stats.dashboard.common.notAvailable')
              : String(selectedGameStats.avgScore),
        },
        {
          id: 'bestScore',
          label: t('profile.stats.dashboard.sections.byGame.columns.bestScore'),
          value:
            selectedGameStats.bestScore === null
              ? t('profile.stats.dashboard.common.notAvailable')
              : String(selectedGameStats.bestScore),
        },
        {
          id: 'lastPlayed',
          label: t('profile.stats.dashboard.sections.byGame.columns.lastPlayed'),
          value: lastPlayedValue,
        },
      ]
    }

    const drawRate =
      selectedGameStats.gamesPlayed > 0
        ? Math.round((selectedGameStats.draws / selectedGameStats.gamesPlayed) * 100)
        : 0

    return [
      {
        id: 'played',
        label: t('profile.stats.dashboard.sections.byGame.columns.played'),
        value: String(selectedGameStats.gamesPlayed),
      },
      {
        id: 'winRate',
        label: t('profile.stats.dashboard.summary.winRate'),
        value: formatPercent(selectedGameStats.winRate),
      },
      {
        id: 'drawRate',
        label: t('profile.stats.dashboard.summary.drawRate'),
        value: formatPercent(drawRate),
      },
      {
        id: 'lastPlayed',
        label: t('profile.stats.dashboard.sections.byGame.columns.lastPlayed'),
        value: lastPlayedValue,
      },
    ]
  }, [selectedGameStats, t])

  if (loading && !stats) {
    return (
      <div className="flex justify-center items-center py-10">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {t('profile.stats.dashboard.title')}
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('profile.stats.dashboard.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => selectPreset(30)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                rangePreset === 30
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
              }`}
            >
              {t('profile.stats.dashboard.filters.last30Days')}
            </button>
            <button
              type="button"
              onClick={() => selectPreset(90)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                rangePreset === 90
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
              }`}
            >
              {t('profile.stats.dashboard.filters.last90Days')}
            </button>
            <button
              type="button"
              onClick={() => selectPreset('all')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                rangePreset === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
              }`}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {summaryCards.map((card) => (
              <div
                key={card.id}
                className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {card.label}
                </p>
                <p className="mt-3 text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {t('profile.stats.dashboard.sections.byGame.title')}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t('profile.stats.dashboard.sections.byGame.subtitle')}
                </p>
              </div>

              {stats.byGame.length > 0 && (
                <fieldset className="w-full lg:max-w-sm lg:flex lg:flex-col lg:justify-center">
                  <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                    {t('profile.stats.dashboard.filters.gameLabel')}
                  </legend>
                  <div className="mt-3 lg:flex lg:flex-1 lg:items-center">
                    <div className="relative w-full max-w-sm lg:max-w-md">
                    <select
                      id="profile-stats-game-select"
                      value={selectedGameType}
                      onChange={(event) => setSelectedGameType(event.target.value)}
                      className={getGameSelectClassName(selectedGameType !== '')}
                    >
                      {stats.byGame.map((item) => (
                        <option key={item.gameType} value={item.gameType}>
                          {formatGameTypeLabel(item.gameType)}
                        </option>
                      ))}
                    </select>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-400"
                      >
                        ▾
                      </span>
                    </div>
                  </div>
                </fieldset>
              )}
            </div>

            {stats.byGame.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                {t('profile.stats.dashboard.sections.byGame.empty')}
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/70">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {selectedGameLabel}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {t('profile.stats.dashboard.sections.byGame.selectedDescription')}
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-blue-700 shadow-sm dark:bg-gray-800 dark:text-blue-300">
                      {selectedGameStats?.winRate ?? 0}%
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {recordItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl bg-white px-3 py-4 text-center dark:bg-gray-800"
                      >
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {item.label}
                        </p>
                        <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {t('profile.stats.dashboard.summary.quickFacts')}
                  </h3>
                  <div className="mt-4 space-y-3">
                    {quickFacts.map((fact) => (
                      <div
                        key={fact.id}
                        className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-900/70"
                      >
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {fact.label}
                        </span>
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          {fact.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
