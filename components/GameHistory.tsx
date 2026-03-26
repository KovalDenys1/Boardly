'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { formatGameTypeLabel, getGameStatusBadgeColor } from '@/lib/game-display'
import LoadingSpinner from './LoadingSpinner'
import GameResultsModal from './GameResultsModal'
import ReplayViewerModal from './ReplayViewerModal'

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

const STATUS_FILTER_OPTIONS = [
  'all',
  'finished',
  'playing',
  'abandoned',
  'cancelled',
] as const

const primarySurfaceClassName =
  'rounded-3xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60'
const secondarySurfaceClassName =
  'rounded-2xl border border-slate-200/70 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-800/60'
const tertiarySurfaceClassName =
  'rounded-2xl border border-slate-200/70 bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/65'

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

function getFilterSelectClassName(isActive: boolean): string {
  return `w-full appearance-none rounded-2xl border bg-white px-4 py-3 pr-10 text-sm font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:bg-slate-900 ${
    isActive
      ? 'border-blue-400 text-blue-700 dark:border-blue-400 dark:text-blue-300'
      : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'
  }`
}

function getStatusAccentClassName(status: string): string {
  switch (status) {
    case 'finished':
      return 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500'
    case 'playing':
      return 'bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500'
    case 'abandoned':
      return 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500'
    case 'cancelled':
      return 'bg-gradient-to-r from-slate-400 via-slate-500 to-slate-600'
    default:
      return 'bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500'
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
      <div className={`${primarySurfaceClassName} flex items-center justify-center py-14`}>
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

      <div className={`${primarySurfaceClassName} overflow-hidden`}>
        <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50/70 px-6 py-5 dark:border-slate-700/50 dark:from-slate-900/70 dark:to-slate-800/70 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {t('profile.gameHistory.title')}
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t('profile.gameHistory.title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                {getVisibleRangeLabel()}
              </p>
            </div>

            <div className={`${tertiarySurfaceClassName} px-4 py-3`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {t('profile.gameHistory.status')}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {formatStatusLabel(statusFilter)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className={`${secondarySurfaceClassName} p-4 sm:p-5`}>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-stretch">
              <fieldset className="min-w-0 lg:flex lg:flex-col lg:justify-center">
                <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  {t('profile.gameHistory.gameType')}
                </legend>
                <div className="mt-3 lg:flex lg:flex-1 lg:items-center">
                  <div className="relative w-full max-w-sm lg:max-w-md">
                    <select
                      id="game-history-game-type"
                      name="gameType"
                      value={gameTypeFilter}
                      onChange={(event) => handleGameTypeFilterChange(event.target.value)}
                      className={getFilterSelectClassName(gameTypeFilter !== 'all')}
                    >
                      {GAME_TYPE_FILTER_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {formatGameTypeFilterLabel(option)}
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
                </div>
              </fieldset>

              <fieldset className="min-w-0 lg:flex lg:flex-col lg:justify-center">
                <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  {t('profile.gameHistory.status')}
                </legend>
                <div className="mt-3 lg:flex lg:flex-1 lg:items-center">
                  <div className="relative w-full max-w-sm">
                    <select
                      id="game-history-status"
                      name="status"
                      value={statusFilter}
                      onChange={(event) => handleStatusFilterChange(event.target.value)}
                      className={getFilterSelectClassName(statusFilter !== 'all')}
                    >
                      {STATUS_FILTER_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {formatStatusLabel(option)}
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
                </div>
              </fieldset>
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

          {games.length === 0 && !loading ? (
            <div className={`${secondarySurfaceClassName} overflow-hidden`}>
              <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50/70 px-6 py-5 dark:border-slate-700/50 dark:from-slate-900/70 dark:to-slate-800/70 sm:px-8">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-[22px] border border-slate-200/70 bg-white text-4xl shadow-sm dark:border-slate-700/60 dark:bg-slate-800">
                  🎮
                </div>
                <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {t('profile.gameHistory.noGames')}
                </h3>
                <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                  {getVisibleRangeLabel()}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {games.map((game) => (
                <div key={game.id} className={`${tertiarySurfaceClassName} group relative overflow-hidden`}>
                  <div className={`absolute inset-x-0 top-0 h-1 ${getStatusAccentClassName(game.status)}`} />
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200/70 bg-white text-2xl shadow-sm dark:border-slate-700/60 dark:bg-slate-800">
                            🎮
                          </div>
                          <div className="min-w-0">
                            <h3
                              className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white"
                              title={game.lobbyName}
                            >
                              {game.lobbyName}
                            </h3>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                              {formatGameTypeLabel(game.gameType)} • {formatDate(game.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getGameStatusBadgeColor(
                            game.status
                          )}`}
                        >
                          {formatStatusLabel(game.status)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {game.lobbyCode}
                        </span>
                      </div>
                    </div>

                    <div className={`${secondarySurfaceClassName} mt-5 p-4`}>
                      <div className="flex flex-wrap gap-2.5">
                        {game.players.map((player, index) => (
                          <div
                            key={player.id}
                            className={`inline-flex max-w-full min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 ${
                              player.isWinner
                                ? 'border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-500/40 dark:bg-yellow-500/10 dark:text-yellow-200'
                                : 'border-slate-200/80 bg-white/90 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
                            }`}
                          >
                            <span
                              className="max-w-[10rem] truncate text-sm font-semibold sm:max-w-[14rem]"
                              title={player.username || `Player ${index + 1}`}
                            >
                              {player.username || `Player ${index + 1}`}
                              {(player.isBot || player.bot) && ' 🤖'}
                            </span>
                            {player.finalScore !== null ? (
                              <span className="shrink-0 text-xs opacity-80">
                                {player.finalScore} {t('profile.gameResults.points')}
                              </span>
                            ) : null}
                            {player.isWinner ? <span aria-hidden>👑</span> : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {formatDate(game.updatedAt)}
                      </p>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <button
                          type="button"
                          onClick={() => setSelectedGameId(game.id)}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          {t('profile.gameHistory.clickToView')}
                        </button>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedReplayGameId(game.id)}
                            disabled={!game.hasReplay}
                            className="inline-flex items-center justify-center rounded-2xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
                          >
                            {game.hasReplay ? t('profile.gameReplay.watch') : t('profile.gameReplay.unavailable')}
                          </button>
                          {!game.hasReplay && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
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
            <div className={`${secondarySurfaceClassName} p-4 sm:p-5`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handlePreviousPage}
                  disabled={offset === 0}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  {t('common.previous')}
                </button>

                <span className="text-center text-sm text-slate-600 dark:text-slate-400">
                  {getVisibleRangeLabel()}
                </span>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!hasMore}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                >
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
