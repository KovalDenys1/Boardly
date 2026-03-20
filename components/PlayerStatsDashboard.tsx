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

const primarySurfaceClassName =
  'rounded-3xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60'
const secondarySurfaceClassName =
  'rounded-2xl border border-slate-200/70 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-800/60'
const tertiarySurfaceClassName =
  'rounded-2xl border border-slate-200/70 bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/65'

function formatPercent(value: number): string {
  return `${value}%`
}

function supportsScoreMetrics(stats: ByGameStats): boolean {
  return stats.avgScore !== null || stats.bestScore !== null
}

function getGameSelectClassName(isActive: boolean): string {
  return `w-full appearance-none rounded-2xl border bg-white px-4 py-3 pr-10 text-sm font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:bg-slate-900 ${
    isActive
      ? 'border-blue-400 text-blue-700 dark:border-blue-400 dark:text-blue-300'
      : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'
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

  function selectPreset(preset: RangePreset) {
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
      {
        id: 'winRate',
        label: t('profile.stats.dashboard.summary.winRate'),
        value: formatPercent(stats.overall.winRate),
      },
      {
        id: 'avgDuration',
        label: t('profile.stats.dashboard.summary.avgDuration'),
        value: `${Math.round(stats.overall.avgGameDurationMinutes)}${t(
          'profile.stats.dashboard.summary.minutesSuffix'
        )}`,
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

  const overallInsightItems = useMemo(() => {
    if (!stats) return []

    return [
      {
        id: 'wins',
        label: t('profile.stats.dashboard.summary.wins'),
        value: stats.overall.wins,
      },
      {
        id: 'losses',
        label: t('profile.stats.dashboard.summary.losses'),
        value: stats.overall.losses,
      },
      {
        id: 'draws',
        label: t('profile.stats.dashboard.summary.draws'),
        value: stats.overall.draws,
      },
      {
        id: 'currentStreak',
        label: t('profile.stats.dashboard.summary.currentStreak'),
        value: stats.overall.currentWinStreak,
      },
      {
        id: 'bestStreak',
        label: t('profile.stats.dashboard.summary.bestStreak'),
        value: stats.overall.longestWinStreak,
      },
    ]
  }, [stats, t])

  if (loading && !stats) {
    return (
      <div className={`${primarySurfaceClassName} flex items-center justify-center py-14`}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className={`${primarySurfaceClassName} overflow-hidden`}>
        <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50/70 px-6 py-5 dark:border-slate-700/50 dark:from-slate-900/70 dark:to-slate-800/70 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {t('profile.stats.title')}
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t('profile.stats.dashboard.title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                {t('profile.stats.dashboard.subtitle')}
              </p>
            </div>

            <div className={`${secondarySurfaceClassName} p-1.5`}>
              <div className="flex gap-1">
                {([
                  { id: 30, label: t('profile.stats.dashboard.filters.last30Days') },
                  { id: 90, label: t('profile.stats.dashboard.filters.last90Days') },
                  { id: 'all', label: t('profile.stats.dashboard.filters.allTime') },
                ] as const).map((preset) => (
                  <button
                    key={String(preset.id)}
                    type="button"
                    onClick={() => selectPreset(preset.id)}
                    className={`min-h-[44px] rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      rangePreset === preset.id
                        ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-blue-400 dark:ring-slate-700/70'
                        : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="overflow-hidden rounded-3xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-orange-50 shadow-sm dark:border-rose-500/30 dark:from-rose-500/10 dark:to-orange-500/5">
          <div className="border-l-4 border-rose-400 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-2xl shadow-sm dark:bg-rose-500/15">
                !
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">{error}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {stats ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.id} className={`${primarySurfaceClassName} min-w-0 p-5`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  {card.label}
                </p>
                <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className={`${primarySurfaceClassName} overflow-hidden`}>
            <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50/70 px-6 py-5 dark:border-slate-700/50 dark:from-slate-900/70 dark:to-slate-800/70 sm:px-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {t('profile.stats.dashboard.sections.byGame.title')}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    {t('profile.stats.dashboard.sections.byGame.subtitle')}
                  </p>
                </div>

                {stats.byGame.length > 0 ? (
                  <fieldset className="w-full lg:max-w-sm">
                    <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                      {t('profile.stats.dashboard.filters.gameLabel')}
                    </legend>
                    <div className="relative mt-3">
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
                        className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400"
                      >
                        ▾
                      </span>
                    </div>
                  </fieldset>
                ) : null}
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {stats.byGame.length === 0 ? (
                <div className={`${secondarySurfaceClassName} p-6 sm:p-8`}>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t('profile.stats.dashboard.sections.byGame.empty')}
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
                  <div className="space-y-5">
                    <div className={`${secondarySurfaceClassName} p-5`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                            {t('profile.stats.dashboard.filters.gameLabel')}
                          </p>
                          <p className="mt-3 truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                            {selectedGameLabel}
                          </p>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                            {t('profile.stats.dashboard.sections.byGame.selectedDescription')}
                          </p>
                        </div>

                        <div className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-blue-300 dark:ring-slate-700/70">
                          {selectedGameStats ? formatPercent(selectedGameStats.winRate) : formatPercent(0)}
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {recordItems.map((item) => (
                          <div key={item.id} className={`${tertiarySurfaceClassName} px-4 py-4 text-center`}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                              {item.label}
                            </p>
                            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`${secondarySurfaceClassName} p-5`}>
                      <h4 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                        {t('profile.stats.dashboard.summary.wld')}
                      </h4>
                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                        {overallInsightItems.map((item) => (
                          <div
                            key={item.id}
                            className={`${tertiarySurfaceClassName} flex min-h-[112px] flex-col justify-center px-3 py-4 text-center sm:px-4`}
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 sm:text-[11px]">
                              {item.label}
                            </p>
                            <p className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={`${secondarySurfaceClassName} flex h-full flex-col p-5`}>
                    <h4 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                      {t('profile.stats.dashboard.summary.quickFacts')}
                    </h4>
                    <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:auto-rows-fr xl:grid-cols-1 xl:grid-rows-4">
                      {quickFacts.map((fact) => (
                        <div
                          key={fact.id}
                          className={`${tertiarySurfaceClassName} flex h-full min-h-[96px] items-center justify-between gap-4 px-4 py-3`}
                        >
                          <span className="text-sm text-slate-600 dark:text-slate-300">{fact.label}</span>
                          <span className="text-base font-semibold text-slate-900 dark:text-white">
                            {fact.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
