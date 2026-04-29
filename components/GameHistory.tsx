'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { formatGameTypeLabel } from '@/lib/game-display'
import LoadingSpinner from './LoadingSpinner'
import GameResultsModal from './GameResultsModal'
import ReplayViewerModal from './ReplayViewerModal'
import BoardlySelect from './ui/BoardlySelect'

const GAME_HISTORY_STATUS_KEYS = {
  waiting: 'profile.gameHistory.waiting',
  playing: 'profile.gameHistory.playing',
  finished: 'profile.gameHistory.finished',
  abandoned: 'profile.gameHistory.abandoned',
  cancelled: 'profile.gameHistory.cancelled',
} as const satisfies Record<string, TranslationKeys>

const GAME_TYPE_FILTER_OPTIONS = [
  'all',
  'yahtzee',
  'guess_the_spy',
  'tic_tac_toe',
  'rock_paper_scissors',
  'memory',
] as const

const STATUS_FILTER_OPTIONS = ['all', 'finished', 'playing', 'abandoned', 'cancelled'] as const

const panelClassName =
  'rounded-[1.75rem] border-[1.5px] border-bd-line bg-white shadow-[0_4px_14px_rgba(31,27,22,0.07)] dark:border-slate-700/60 dark:bg-slate-900/80'
const warmSurfaceClassName =
  'rounded-[1.5rem] border border-bd-line bg-bd-card-warm/90 dark:border-slate-700/60 dark:bg-slate-800/70'
const tileClassName =
  'rounded-2xl border border-bd-line bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70'
const primaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[#7867E8] bg-bd-lav px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#7867E8] transition-all hover:-translate-y-0.5 hover:bg-[#8b7dff] hover:shadow-[0_6px_0_#7867E8] disabled:cursor-not-allowed disabled:opacity-65'
const secondaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-bd-line bg-white px-4 py-2.5 text-sm font-semibold text-bd-ink shadow-[0_3px_0_#E8DDC8] transition-all hover:-translate-y-0.5 hover:bg-bd-card-warm disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-800'
const eyebrowClassName =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-bd-ink-muted dark:text-slate-400'

interface Player {
  id: string
  username: string | null
  avatar: string | null
  isBot: boolean
  bot?: {
    id: string
    userId: string
    botType: string
    difficulty: string
  } | null
  score: number
  finalScore: number | null
  placement: number | null
  isWinner: boolean
}

interface GameHistoryItem {
  id: string
  lobbyCode: string
  lobbyName: string
  gameType: string
  status: string
  createdAt: string
  updatedAt: string
  abandonedAt: string | null
  hasReplay: boolean
  players: Player[]
}

interface GameHistoryResponse {
  games: GameHistoryItem[]
  pagination: {
    limit: number
    offset: number
    totalCount: number
    hasMore: boolean
  }
}

function BoardIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 3v18" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function ReplayIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
    </svg>
  )
}

function ViewIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function getStatusAccentClassName(status: string): string {
  switch (status) {
    case 'finished':
      return 'bg-bd-mint'
    case 'playing':
      return 'bg-bd-sun'
    case 'abandoned':
      return 'bg-bd-coral'
    case 'cancelled':
      return 'bg-bd-bg2 dark:bg-slate-700'
    default:
      return 'bg-bd-lav'
  }
}

function getStatusBadgeClassName(status: string): string {
  switch (status) {
    case 'finished':
      return 'bg-bd-mint/20 text-bd-mint-deep dark:bg-bd-mint/15 dark:text-bd-mint'
    case 'playing':
      return 'bg-bd-sun/25 text-[#9b6b00] dark:bg-bd-sun/15 dark:text-bd-sun'
    case 'abandoned':
      return 'bg-bd-coral/15 text-bd-coral-deep dark:bg-red-500/15 dark:text-red-300'
    case 'cancelled':
      return 'bg-bd-bg2 text-bd-ink-soft dark:bg-slate-800 dark:text-slate-300'
    default:
      return 'bg-bd-lav/20 text-[#6758d8] dark:bg-bd-lav/15 dark:text-bd-lav'
  }
}

export default function GameHistory() {
  const { t } = useTranslation()
  const [games, setGames] = useState<GameHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [gameTypeFilter, setGameTypeFilter] = useState<string>('all')
  const [offset, setOffset] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [selectedReplayGameId, setSelectedReplayGameId] = useState<string | null>(null)

  const limit = 20

  const loadGames = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      })

      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      if (gameTypeFilter !== 'all') {
        params.set('gameType', gameTypeFilter)
      }

      const response = await fetch(`/api/user/games?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to load game history')
      }

      const data: GameHistoryResponse = await response.json()
      setGames(data.games)
      setTotalCount(data.pagination.totalCount)
      setHasMore(data.pagination.hasMore)

      clientLogger.log('Game history loaded', { count: data.games.length })
    } catch (err) {
      clientLogger.error('Error loading game history:', err)
      setError(t('errors.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [gameTypeFilter, offset, statusFilter, t])

  useEffect(() => {
    void loadGames()
  }, [loadGames])

  function handleStatusFilterChange(status: string) {
    setStatusFilter(status)
    setOffset(0)
  }

  function handleGameTypeFilterChange(gameType: string) {
    setGameTypeFilter(gameType)
    setOffset(0)
  }

  function handleNextPage() {
    if (hasMore) {
      setOffset(offset + limit)
    }
  }

  function handlePreviousPage() {
    if (offset > 0) {
      setOffset(Math.max(0, offset - limit))
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatStatusLabel(status: string): string {
    if (status === 'all') {
      return t('profile.gameHistory.allStatuses')
    }

    const key = GAME_HISTORY_STATUS_KEYS[status as keyof typeof GAME_HISTORY_STATUS_KEYS]
    if (key) {
      return t(key)
    }
    return status.replace(/_/g, ' ')
  }

  function formatGameTypeFilterLabel(gameType: string): string {
    if (gameType === 'all') {
      return t('profile.gameHistory.allGames')
    }

    return formatGameTypeLabel(gameType)
  }

  function getVisibleRangeLabel(): string {
    if (totalCount === 0) {
      return t('profile.gameHistory.noGames')
    }

    return t('profile.gameHistory.showing', {
      start: offset + 1,
      end: Math.min(offset + limit, totalCount),
      total: totalCount,
    })
  }

  if (loading && games.length === 0) {
    return (
      <div className={`${panelClassName} flex min-h-[220px] items-center justify-center`}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <GameResultsModal
        gameId={selectedGameId}
        onClose={() => setSelectedGameId(null)}
        onWatchReplay={(gameId) => {
          setSelectedGameId(null)
          setSelectedReplayGameId(gameId)
        }}
      />
      <ReplayViewerModal gameId={selectedReplayGameId} onClose={() => setSelectedReplayGameId(null)} />

      <div className={`${panelClassName} overflow-hidden`}>
        <div className="relative p-6 sm:p-7">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className={eyebrowClassName}>{t('profile.gameHistory.title')}</p>
              <h2 className="mt-3 font-display text-3xl font-bold text-bd-ink dark:text-white">
                {t('profile.gameHistory.title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-bd-ink-muted dark:text-slate-400">
                {getVisibleRangeLabel()}
              </p>
            </div>

            <div className={`${warmSurfaceClassName} px-4 py-3`}>
              <p className={eyebrowClassName}>{t('profile.gameHistory.status')}</p>
              <p className="mt-2 text-sm font-semibold text-bd-ink dark:text-white">
                {formatStatusLabel(statusFilter)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className={`${warmSurfaceClassName} p-4 sm:p-5`}>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
              <fieldset className="min-w-0">
                <legend className={eyebrowClassName}>{t('profile.gameHistory.gameType')}</legend>
                <div className="mt-3 max-w-sm lg:max-w-md">
                  <BoardlySelect
                    value={gameTypeFilter}
                    onChange={handleGameTypeFilterChange}
                    ariaLabel={t('profile.gameHistory.gameType')}
                    options={GAME_TYPE_FILTER_OPTIONS.map((option) => ({
                      value: option,
                      label: formatGameTypeFilterLabel(option),
                    }))}
                    renderValue={(option) => (
                      <span className={gameTypeFilter !== 'all' ? 'block truncate text-bd-lav-deep dark:text-bd-lav' : 'block truncate'}>
                        {option?.label ?? ''}
                      </span>
                    )}
                  />
                </div>
              </fieldset>

              <fieldset className="min-w-0">
                <legend className={eyebrowClassName}>{t('profile.gameHistory.status')}</legend>
                <div className="mt-3 max-w-sm">
                  <BoardlySelect
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                    ariaLabel={t('profile.gameHistory.status')}
                    options={STATUS_FILTER_OPTIONS.map((option) => ({
                      value: option,
                      label: formatStatusLabel(option),
                    }))}
                    renderValue={(option) => (
                      <span className={statusFilter !== 'all' ? 'block truncate text-bd-lav-deep dark:text-bd-lav' : 'block truncate'}>
                        {option?.label ?? ''}
                      </span>
                    )}
                  />
                </div>
              </fieldset>
            </div>
          </div>

          {error ? (
            <div className="overflow-hidden rounded-[1.5rem] border border-[#F0B3AC] bg-[#FFF2EF] dark:border-red-500/30 dark:bg-red-500/10">
              <div className="border-l-4 border-bd-coral px-5 py-5 sm:px-6">
                <p className="text-sm font-semibold text-bd-coral-deep dark:text-red-300">{error}</p>
              </div>
            </div>
          ) : null}

          {games.length === 0 && !loading ? (
            <div className={`${panelClassName} relative overflow-hidden`}>
              <div className="dot-grid pointer-events-none absolute inset-0 opacity-25" />
              <div className="relative p-6 sm:p-7">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-[1.15rem] border-2 border-bd-ink bg-bd-sun text-bd-ink shadow-[2px_2px_0_#1F1B16]">
                  <BoardIcon />
                </div>
                <h3 className="mt-5 font-display text-2xl font-bold text-bd-ink dark:text-white">
                  {t('profile.gameHistory.noGames')}
                </h3>
                <p className="mt-2 max-w-xl text-sm text-bd-ink-muted dark:text-slate-400 sm:text-base">
                  {getVisibleRangeLabel()}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {games.map((game) => (
                <div key={game.id} className={`${tileClassName} group relative overflow-hidden`}>
                  <div className={`absolute inset-x-0 top-0 h-1.5 ${getStatusAccentClassName(game.status)}`} />

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] border-2 border-bd-ink bg-bd-sun text-bd-ink shadow-[2px_2px_0_#1F1B16]">
                            <BoardIcon />
                          </div>
                          <div className="min-w-0">
                            <h3
                              className="truncate text-xl font-bold text-bd-ink dark:text-white"
                              title={game.lobbyName}
                            >
                              {game.lobbyName}
                            </h3>
                            <p className="mt-1 text-sm text-bd-ink-muted dark:text-slate-400">
                              {formatGameTypeLabel(game.gameType)} · {formatDate(game.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClassName(game.status)}`}>
                          {formatStatusLabel(game.status)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-bd-bg2 px-3 py-1 font-mono text-xs font-bold text-bd-ink-soft dark:bg-slate-800 dark:text-slate-300">
                          {game.lobbyCode}
                        </span>
                      </div>
                    </div>

                    <div className={`${warmSurfaceClassName} mt-5 p-4`}>
                      <div className="flex flex-wrap gap-2.5">
                        {game.players.map((player, index) => (
                          <div
                            key={player.id}
                            className={`inline-flex max-w-full min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 ${
                              player.isWinner
                                ? 'border-[#E8C46C] bg-bd-sun/20 text-bd-ink'
                                : 'border-bd-line bg-white text-bd-ink-soft dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
                            }`}
                          >
                            <span
                              className="max-w-[10rem] truncate text-sm font-semibold sm:max-w-[14rem]"
                              title={player.username || `Player ${index + 1}`}
                            >
                              {player.username || `Player ${index + 1}`}
                            </span>
                            {(player.isBot || player.bot) && (
                              <span className="rounded-full bg-bd-bg2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-bd-ink-muted dark:bg-slate-800 dark:text-slate-400">
                                Bot
                              </span>
                            )}
                            {player.finalScore !== null ? (
                              <span className="shrink-0 text-xs opacity-80">
                                {player.finalScore} {t('profile.gameResults.points')}
                              </span>
                            ) : null}
                            {player.isWinner ? (
                              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                                Win
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <p className="inline-flex items-center gap-1.5 text-sm text-bd-ink-muted dark:text-slate-400">
                        <ClockIcon />
                        {formatDate(game.updatedAt)}
                      </p>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <button type="button" onClick={() => setSelectedGameId(game.id)} className={secondaryButtonClassName}>
                          <ViewIcon />
                          {t('profile.gameHistory.clickToView')}
                        </button>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedReplayGameId(game.id)}
                            disabled={!game.hasReplay}
                            className={game.hasReplay ? primaryButtonClassName : secondaryButtonClassName}
                          >
                            <ReplayIcon />
                            {game.hasReplay ? t('profile.gameReplay.watch') : t('profile.gameReplay.unavailable')}
                          </button>
                          {!game.hasReplay && (
                            <p className="px-1 text-xs text-bd-ink-muted dark:text-slate-500">
                              {game.status === 'abandoned'
                                ? t('profile.gameResults.replayUnavailableAbandoned')
                                : game.status === 'cancelled'
                                  ? t('profile.gameResults.replayUnavailableCancelled')
                                  : game.status === 'playing' || game.status === 'waiting'
                                    ? t('profile.gameResults.replayUnavailableInProgress')
                                    : t('profile.gameResults.replayUnavailableFinished')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(offset > 0 || hasMore) && (
            <div className={`${warmSurfaceClassName} p-4 sm:p-5`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={handlePreviousPage} disabled={offset === 0} className={secondaryButtonClassName}>
                  {t('common.previous')}
                </button>

                <span className="text-center text-sm text-bd-ink-muted dark:text-slate-400">
                  {getVisibleRangeLabel()}
                </span>

                <button type="button" onClick={handleNextPage} disabled={!hasMore} className={secondaryButtonClassName}>
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
