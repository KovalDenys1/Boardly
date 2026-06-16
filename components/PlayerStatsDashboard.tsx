'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import BoardlySelect from '@/components/ui/BoardlySelect'
import { clientLogger } from '@/lib/client-logger'
import { getAvailableGameTypes, type SupportedCatalogGameType } from '@/lib/game-catalog'
import { formatGameTypeLabel } from '@/lib/game-display'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'

interface OverallStats {
  totalGames: number
  wins: number
  losses: number
  draws: number
  winRate: number
  avgGameDurationMinutes: number
  favoriteGame: string | null
  currentWinStreak: number | null
  longestWinStreak: number | null
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
  byGame: ByGameStats[] | null
  trends: TrendPoint[] | null
  generatedAt: string
}

const panelClassName =
  'rounded-[1.75rem] border-[1.5px] border-bd-line bg-white shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700/60 dark:bg-slate-900/80'
const warmSurfaceClassName =
  'rounded-[1.5rem] border border-bd-line bg-bd-card-warm/90 dark:border-slate-700/60 dark:bg-slate-800/70'
const tileClassName =
  'rounded-2xl border border-bd-line bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70'
const eyebrowClassName =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400'

function formatPercent(value: number): string {
  return `${value}%`
}

function formatNumber(value: number | null): string {
  return value === null ? '' : String(value)
}

function formatOptionalScore(value: number | null, fallback: string): string {
  return value === null ? fallback : formatNumber(value)
}

function formatRate(numerator: number, denominator: number): string {
  return formatPercent(denominator > 0 ? Math.round((numerator / denominator) * 100) : 0)
}

function getLastPlayedValue(stats: ByGameStats, fallback: string): string {
  return stats.lastPlayed ? new Date(stats.lastPlayed).toLocaleDateString() : fallback
}

type AnalyticsMetric = {
  id: string
  label: string
  value: string | number
  accentClassName?: string
}

type AccentMetric = {
  id: string
  labelKey: TranslationKeys
  value: string | number
}

type GameAnalyticsProfile = {
  titleKey: TranslationKeys
  descriptionKey: TranslationKeys
  accentMetric: (stats: ByGameStats, notAvailable: string) => AccentMetric
  highlights: (stats: ByGameStats, labels: GameAnalyticsLabels) => AnalyticsMetric[]
  quickFacts: (stats: ByGameStats, labels: GameAnalyticsLabels) => AnalyticsMetric[]
}

type GameAnalyticsLabels = {
  played: string
  wins: string
  losses: string
  draws: string
  winRate: string
  drawRate: string
  lossRate: string
  unbeatenRate: string
  avgScore: string
  bestScore: string
  lastPlayed: string
  notAvailable: string
}

const metricAccents = {
  wins: 'bg-bd-mint/20 text-bd-mint-deep dark:bg-bd-mint/15 dark:text-bd-mint',
  losses: 'bg-bd-coral/15 text-bd-coral-deep dark:bg-red-500/15 dark:text-red-300',
  draws: 'bg-bd-bg2 text-bd-ink-soft dark:bg-slate-800 dark:text-slate-300',
  score: 'bg-bd-sun/25 text-[#9b6b00] dark:bg-bd-sun/15 dark:text-bd-sun',
  rate: 'bg-bd-lav/15 text-bd-lav-deep dark:bg-bd-lav/15 dark:text-bd-lav',
}

const defaultAnalyticsProfile: GameAnalyticsProfile = {
  titleKey: 'profile.stats.dashboard.gameProfiles.default.title',
  descriptionKey: 'profile.stats.dashboard.gameProfiles.default.description',
  accentMetric: (stats) => ({
    id: 'winRate',
    labelKey: 'profile.stats.dashboard.summary.winRate',
    value: formatPercent(stats.winRate),
  }),
  highlights: (stats, labels) => [
    {
      id: 'wins',
      label: labels.wins,
      value: stats.wins,
      accentClassName: metricAccents.wins,
    },
    {
      id: 'losses',
      label: labels.losses,
      value: stats.losses,
      accentClassName: metricAccents.losses,
    },
    {
      id: 'draws',
      label: labels.draws,
      value: stats.draws,
      accentClassName: metricAccents.draws,
    },
  ],
  quickFacts: (stats, labels) => [
    { id: 'played', label: labels.played, value: String(stats.gamesPlayed) },
    { id: 'winRate', label: labels.winRate, value: formatPercent(stats.winRate) },
    { id: 'drawRate', label: labels.drawRate, value: formatRate(stats.draws, stats.gamesPlayed) },
    { id: 'lastPlayed', label: labels.lastPlayed, value: getLastPlayedValue(stats, labels.notAvailable) },
  ],
}

const gameAnalyticsProfiles: Record<string, GameAnalyticsProfile> = {
  yahtzee: {
    titleKey: 'profile.stats.dashboard.gameProfiles.yahtzee.title',
    descriptionKey: 'profile.stats.dashboard.gameProfiles.yahtzee.description',
    accentMetric: (stats, notAvailable) => ({
      id: 'bestScore',
      labelKey: 'profile.stats.dashboard.sections.byGame.columns.bestScore',
      value: formatOptionalScore(stats.bestScore, notAvailable),
    }),
    highlights: (stats, labels) => [
      {
        id: 'avgScore',
        label: labels.avgScore,
        value: formatOptionalScore(stats.avgScore, labels.notAvailable),
        accentClassName: metricAccents.score,
      },
      {
        id: 'bestScore',
        label: labels.bestScore,
        value: formatOptionalScore(stats.bestScore, labels.notAvailable),
        accentClassName: metricAccents.score,
      },
      {
        id: 'wins',
        label: labels.wins,
        value: stats.wins,
        accentClassName: metricAccents.wins,
      },
    ],
    quickFacts: (stats, labels) => [
      { id: 'played', label: labels.played, value: String(stats.gamesPlayed) },
      { id: 'winRate', label: labels.winRate, value: formatPercent(stats.winRate) },
      { id: 'lossRate', label: labels.lossRate, value: formatRate(stats.losses, stats.gamesPlayed) },
      { id: 'lastPlayed', label: labels.lastPlayed, value: getLastPlayedValue(stats, labels.notAvailable) },
    ],
  },
  tic_tac_toe: {
    titleKey: 'profile.stats.dashboard.gameProfiles.ticTacToe.title',
    descriptionKey: 'profile.stats.dashboard.gameProfiles.ticTacToe.description',
    accentMetric: (stats) => ({
      id: 'unbeatenRate',
      labelKey: 'profile.stats.dashboard.summary.unbeatenRate',
      value: formatRate(stats.wins + stats.draws, stats.gamesPlayed),
    }),
    highlights: (stats, labels) => [
      {
        id: 'wins',
        label: labels.wins,
        value: stats.wins,
        accentClassName: metricAccents.wins,
      },
      {
        id: 'draws',
        label: labels.draws,
        value: stats.draws,
        accentClassName: metricAccents.draws,
      },
      {
        id: 'unbeatenRate',
        label: labels.unbeatenRate,
        value: formatRate(stats.wins + stats.draws, stats.gamesPlayed),
        accentClassName: metricAccents.rate,
      },
    ],
    quickFacts: (stats, labels) => [
      { id: 'played', label: labels.played, value: String(stats.gamesPlayed) },
      { id: 'winRate', label: labels.winRate, value: formatPercent(stats.winRate) },
      { id: 'drawRate', label: labels.drawRate, value: formatRate(stats.draws, stats.gamesPlayed) },
      { id: 'lastPlayed', label: labels.lastPlayed, value: getLastPlayedValue(stats, labels.notAvailable) },
    ],
  },
  memory: {
    titleKey: 'profile.stats.dashboard.gameProfiles.memory.title',
    descriptionKey: 'profile.stats.dashboard.gameProfiles.memory.description',
    accentMetric: (stats, notAvailable) => ({
      id: 'bestScore',
      labelKey: 'profile.stats.dashboard.sections.byGame.columns.bestScore',
      value: formatOptionalScore(stats.bestScore, notAvailable),
    }),
    highlights: (stats, labels) => [
      {
        id: 'wins',
        label: labels.wins,
        value: stats.wins,
        accentClassName: metricAccents.wins,
      },
      {
        id: 'avgScore',
        label: labels.avgScore,
        value: formatOptionalScore(stats.avgScore, labels.notAvailable),
        accentClassName: metricAccents.score,
      },
      {
        id: 'bestScore',
        label: labels.bestScore,
        value: formatOptionalScore(stats.bestScore, labels.notAvailable),
        accentClassName: metricAccents.score,
      },
    ],
    quickFacts: (stats, labels) => [
      { id: 'played', label: labels.played, value: String(stats.gamesPlayed) },
      { id: 'winRate', label: labels.winRate, value: formatPercent(stats.winRate) },
      { id: 'lossRate', label: labels.lossRate, value: formatRate(stats.losses, stats.gamesPlayed) },
      { id: 'lastPlayed', label: labels.lastPlayed, value: getLastPlayedValue(stats, labels.notAvailable) },
    ],
  },
  guess_the_spy: {
    titleKey: 'profile.stats.dashboard.gameProfiles.guessTheSpy.title',
    descriptionKey: 'profile.stats.dashboard.gameProfiles.guessTheSpy.description',
    accentMetric: (stats) => ({
      id: 'winRate',
      labelKey: 'profile.stats.dashboard.summary.winRate',
      value: formatPercent(stats.winRate),
    }),
    highlights: (stats, labels) => [
      {
        id: 'played',
        label: labels.played,
        value: stats.gamesPlayed,
        accentClassName: metricAccents.rate,
      },
      {
        id: 'wins',
        label: labels.wins,
        value: stats.wins,
        accentClassName: metricAccents.wins,
      },
      {
        id: 'losses',
        label: labels.losses,
        value: stats.losses,
        accentClassName: metricAccents.losses,
      },
    ],
    quickFacts: (stats, labels) => [
      { id: 'winRate', label: labels.winRate, value: formatPercent(stats.winRate) },
      { id: 'lossRate', label: labels.lossRate, value: formatRate(stats.losses, stats.gamesPlayed) },
      { id: 'drawRate', label: labels.drawRate, value: formatRate(stats.draws, stats.gamesPlayed) },
      { id: 'lastPlayed', label: labels.lastPlayed, value: getLastPlayedValue(stats, labels.notAvailable) },
    ],
  },
}

interface PlayerStatsDashboardProps {
  userId: string
}

export default function PlayerStatsDashboard({ userId }: PlayerStatsDashboardProps) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [selectedGameType, setSelectedGameType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const availableGameTypes = useMemo(() => new Set(getAvailableGameTypes()), [])

  const loadStats = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/user/${userId}/stats`, {
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
  }, [t, userId])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const availableByGameStats = useMemo(() => {
    return (
      stats?.byGame?.filter((item) =>
        availableGameTypes.has(item.gameType as SupportedCatalogGameType)
      ) ?? []
    )
  }, [availableGameTypes, stats])

  useEffect(() => {
    if (availableByGameStats.length === 0) {
      setSelectedGameType('')
      return
    }

    setSelectedGameType((previousValue) => {
      if (availableByGameStats.some((item) => item.gameType === previousValue)) {
        return previousValue
      }

      return availableByGameStats[0].gameType
    })
  }, [availableByGameStats])

  const summaryCards = useMemo(() => {
    if (!stats) return []

    return [
      {
        id: 'games',
        label: t('profile.stats.dashboard.summary.totalGames'),
        value: String(stats.overall.totalGames),
        accentClassName: 'bg-bd-coral text-bd-coral-deep',
      },
      {
        id: 'favoriteGame',
        label: t('profile.stats.dashboard.summary.favoriteGame'),
        value: stats.overall.favoriteGame
          ? formatGameTypeLabel(stats.overall.favoriteGame)
          : t('profile.stats.dashboard.common.notAvailable'),
        accentClassName: 'bg-bd-mint text-bd-mint-deep',
      },
      {
        id: 'winRate',
        label: t('profile.stats.dashboard.summary.winRate'),
        value: formatPercent(stats.overall.winRate),
        accentClassName: 'bg-bd-lav text-[#6758d8]',
      },
      {
        id: 'bestStreak',
        label: t('profile.stats.dashboard.summary.bestStreak'),
        value:
          stats.overall.longestWinStreak === null
            ? t('profile.stats.dashboard.common.notAvailable')
            : String(stats.overall.longestWinStreak),
        accentClassName: 'bg-bd-mint text-bd-mint-deep',
      },
    ]
  }, [stats, t])

  const selectedGameStats = useMemo(() => {
    if (!availableByGameStats.length) {
      return null
    }

    return (
      availableByGameStats.find((item) => item.gameType === selectedGameType) ??
      availableByGameStats[0]
    )
  }, [availableByGameStats, selectedGameType])

  const selectedGameLabel = selectedGameStats ? formatGameTypeLabel(selectedGameStats.gameType) : ''
  const selectedAnalyticsProfile = selectedGameStats
    ? gameAnalyticsProfiles[selectedGameStats.gameType] ?? defaultAnalyticsProfile
    : defaultAnalyticsProfile

  const gameAnalyticsLabels = useMemo<GameAnalyticsLabels>(
    () => ({
      played: t('profile.stats.dashboard.sections.byGame.columns.played'),
      wins: t('profile.stats.dashboard.summary.wins'),
      losses: t('profile.stats.dashboard.summary.losses'),
      draws: t('profile.stats.dashboard.summary.draws'),
      winRate: t('profile.stats.dashboard.summary.winRate'),
      drawRate: t('profile.stats.dashboard.summary.drawRate'),
      lossRate: t('profile.stats.dashboard.summary.lossRate'),
      unbeatenRate: t('profile.stats.dashboard.summary.unbeatenRate'),
      avgScore: t('profile.stats.dashboard.sections.byGame.columns.avgScore'),
      bestScore: t('profile.stats.dashboard.sections.byGame.columns.bestScore'),
      lastPlayed: t('profile.stats.dashboard.sections.byGame.columns.lastPlayed'),
      notAvailable: t('profile.stats.dashboard.common.notAvailable'),
    }),
    [t]
  )

  const highlightItems = useMemo(() => {
    if (!selectedGameStats) return []

    return selectedAnalyticsProfile.highlights(selectedGameStats, gameAnalyticsLabels)
  }, [gameAnalyticsLabels, selectedAnalyticsProfile, selectedGameStats])

  const quickFacts = useMemo(() => {
    if (!selectedGameStats) return []

    return selectedAnalyticsProfile.quickFacts(selectedGameStats, gameAnalyticsLabels)
  }, [gameAnalyticsLabels, selectedAnalyticsProfile, selectedGameStats])

  const accentMetric = selectedGameStats
    ? selectedAnalyticsProfile.accentMetric(
        selectedGameStats,
        t('profile.stats.dashboard.common.notAvailable')
      )
    : null

  const gameInsightItems = useMemo(() => {
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

  if (loading && !stats) {
    return (
      <div className={`${panelClassName} flex min-h-[220px] items-center justify-center`}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className={`${panelClassName} overflow-hidden`}>
        <div className="relative p-6 sm:p-7">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className={eyebrowClassName}>{t('profile.stats.title')}</p>
              <h2 className="mt-3 font-display text-3xl font-bold text-bd-ink dark:text-white">
                {t('profile.stats.dashboard.title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-bd-ink-muted dark:text-slate-400">
                {t('profile.stats.dashboard.subtitle')}
              </p>
            </div>

            <div className={`${warmSurfaceClassName} px-4 py-3`}>
              <p className={eyebrowClassName}>{t('profile.stats.dashboard.filters.allTime')}</p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="overflow-hidden rounded-[1.5rem] border border-[#F0B3AC] bg-[#FFF2EF] dark:border-red-500/30 dark:bg-red-500/10">
          <div className="border-l-4 border-bd-coral px-5 py-5 sm:px-6">
            <p className="text-sm font-semibold text-bd-coral-deep dark:text-red-300">{error}</p>
          </div>
        </div>
      ) : null}

      {stats ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.id} className={`${panelClassName} min-w-0 overflow-hidden`}>
                <div className="p-5">
                  <p className={eyebrowClassName}>{card.label}</p>
                  <p className="mt-4 text-2xl font-bold text-bd-ink dark:text-white">{card.value}</p>
                </div>
                <div className={`h-2 w-full ${card.accentClassName.split(' ')[0]}`} />
              </div>
            ))}
          </div>

          <div className={`${panelClassName} overflow-hidden`}>
            <div className="relative border-b border-bd-line p-6 sm:p-7 dark:border-slate-700/60">
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <h3 className="text-2xl font-bold text-bd-ink dark:text-white">
                    {t('profile.stats.dashboard.sections.byGame.title')}
                  </h3>
                  <p className="mt-2 text-sm text-bd-ink-muted dark:text-slate-400">
                    {t('profile.stats.dashboard.sections.byGame.subtitle')}
                  </p>
                </div>

                {availableByGameStats.length > 0 ? (
                  <fieldset className="w-full lg:max-w-sm">
                    <legend className={eyebrowClassName}>
                      {t('profile.stats.dashboard.filters.gameLabel')}
                    </legend>
                    <div className="mt-3">
                      <BoardlySelect
                        value={selectedGameType}
                        onChange={setSelectedGameType}
                        ariaLabel={t('profile.stats.dashboard.filters.gameLabel')}
                        options={availableByGameStats.map((item) => ({
                          value: item.gameType,
                          label: formatGameTypeLabel(item.gameType),
                          badge: String(item.gamesPlayed),
                        }))}
                        renderValue={(option) => (
                          <span className="block truncate text-bd-lav-deep dark:text-bd-lav">
                            {option?.label ?? ''}
                          </span>
                        )}
                      />
                    </div>
                  </fieldset>
                ) : null}
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {availableByGameStats.length === 0 ? (
                <div className={`${warmSurfaceClassName} p-6 sm:p-8`}>
                  <p className="text-sm text-bd-ink-muted dark:text-slate-400">
                    {t('profile.stats.dashboard.sections.byGame.empty')}
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
                  <div className="space-y-5">
                    <div className={`${warmSurfaceClassName} p-5`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className={eyebrowClassName}>{t('profile.stats.dashboard.filters.gameLabel')}</p>
                          <p className="mt-3 truncate text-2xl font-bold text-bd-ink dark:text-white">
                            {selectedGameLabel}
                          </p>
                          <p className="mt-2 text-sm text-bd-ink-muted dark:text-slate-400">
                            {t(selectedAnalyticsProfile.descriptionKey)}
                          </p>
                        </div>

                        {accentMetric ? (
                          <div className="inline-flex flex-col items-end rounded-2xl bg-bd-lav/15 px-4 py-2 text-right text-bd-lav-deep dark:bg-bd-lav/15 dark:text-bd-lav">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                              {t(accentMetric.labelKey)}
                            </span>
                            <span className="mt-1 text-lg font-bold">{accentMetric.value}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {highlightItems.map((item) => (
                          <div key={item.id} className={`${tileClassName} px-4 py-4 text-center`}>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${item.accentClassName ?? metricAccents.rate}`}>
                              {item.label}
                            </span>
                            <p className="mt-3 text-3xl font-bold text-bd-ink dark:text-white">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`${warmSurfaceClassName} p-5`}>
                      <h4 className="text-lg font-bold text-bd-ink dark:text-white">
                        {t(selectedAnalyticsProfile.titleKey)}
                      </h4>
                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                        {gameInsightItems.map((item) => (
                          <div
                            key={item.id}
                            className={`${tileClassName} flex min-h-[112px] flex-col justify-center px-3 py-4 text-center sm:px-4`}
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400 sm:text-[11px]">
                              {item.label}
                            </p>
                            <p className="mt-3 text-xl font-bold text-bd-ink dark:text-white sm:text-2xl">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={`${warmSurfaceClassName} flex h-full flex-col p-5`}>
                    <h4 className="text-lg font-bold text-bd-ink dark:text-white">
                      {t('profile.stats.dashboard.summary.quickFacts')}
                    </h4>
                    <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:auto-rows-fr xl:grid-cols-1 xl:grid-rows-4">
                      {quickFacts.map((fact) => (
                        <div
                          key={fact.id}
                          className={`${tileClassName} flex h-full min-h-[96px] items-center justify-between gap-4 px-4 py-3`}
                        >
                          <span className="text-sm text-bd-ink-muted dark:text-slate-300">{fact.label}</span>
                          <span className="text-base font-semibold text-bd-ink dark:text-white">{fact.value}</span>
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
