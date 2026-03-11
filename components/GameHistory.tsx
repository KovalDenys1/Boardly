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
  'chess',
  'guess_the_spy',
  'tic_tac_toe',
  'rock_paper_scissors',
  'memory',
  'uno',
] as const

const STATUS_FILTER_OPTIONS = [
  'all',
  'finished',
  'playing',
  'abandoned',
  'cancelled',
] as const

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
  return `w-full appearance-none rounded-xl border bg-white px-4 py-2.5 pr-10 text-sm font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:bg-gray-900 ${
    isActive
      ? 'border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300'
      : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
  }`
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
  }, [statusFilter, gameTypeFilter, offset, t])

  useEffect(() => {
    loadGames()
  }, [loadGames])

  function handleStatusFilterChange(status: string) {
    setStatusFilter(status)
    setOffset(0) // Reset pagination
  }

  function handleGameTypeFilterChange(gameType: string) {
    setGameTypeFilter(gameType)
    setOffset(0) // Reset pagination
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

  if (loading && games.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Game Results Modal */}
      <GameResultsModal
        gameId={selectedGameId}
        onClose={() => setSelectedGameId(null)}
      />
      <ReplayViewerModal
        gameId={selectedReplayGameId}
        onClose={() => setSelectedReplayGameId(null)}
      />

      {/* Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/95 sm:p-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-stretch">
          <fieldset className="min-w-0 lg:flex lg:flex-col lg:justify-center">
            <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
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
                  className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-400"
                >
                  ▾
                </span>
              </div>
            </div>
          </fieldset>

          <fieldset className="min-w-0 lg:flex lg:flex-col lg:justify-center">
            <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
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
                  className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-400"
                >
                  ▾
                </span>
              </div>
            </div>
          </fieldset>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Games list */}
      {games.length === 0 && !loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {t('profile.gameHistory.noGames')}
        </div>
      ) : (
        <div className="space-y-4">
          {games.map((game) => (
            <div
              key={game.id}
              className="w-full p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition-all"
            >
              <button
                onClick={() => setSelectedGameId(game.id)}
                className="w-full text-left"
              >
                <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100" title={game.lobbyName}>
                      {game.lobbyName}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
                      {formatGameTypeLabel(game.gameType)} • {formatDate(game.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`self-start px-3 py-1 rounded-full text-xs font-medium ${getGameStatusBadgeColor(
                      game.status
                    )}`}
                  >
                    {formatStatusLabel(game.status)}
                  </span>
                </div>

                {/* Players */}
                <div className="flex flex-wrap gap-2">
                  {game.players.map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex max-w-full min-w-0 items-center gap-2 px-3 py-1 rounded-lg ${
                        player.isWinner
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className="max-w-[11rem] sm:max-w-[14rem] truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                        title={player.username || `Player ${index + 1}`}
                      >
                        {player.username || `Player ${index + 1}`}
                        {(player.isBot || player.bot) && ' 🤖'}
                      </span>
                      {player.finalScore !== null && (
                        <span className="shrink-0 text-xs text-gray-600 dark:text-gray-400">
                          {player.finalScore} {t('profile.gameResults.points')}
                        </span>
                      )}
                      {player.isWinner && <span className="text-yellow-500">👑</span>}
                    </div>
                  ))}
                </div>
              </button>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedGameId(game.id)}
                  className="w-full text-left text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-400 dark:hover:text-blue-300 sm:w-auto"
                >
                  {t('profile.gameHistory.clickToView')} →
                </button>
                <button
                  onClick={() => setSelectedReplayGameId(game.id)}
                  disabled={!game.hasReplay}
                  className="w-full sm:w-auto px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-700 dark:disabled:text-gray-400 transition-colors"
                >
                  {game.hasReplay
                    ? t('profile.gameReplay.watch')
                    : t('profile.gameReplay.unavailable')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(offset > 0 || hasMore) && (
        <div className="pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={handlePreviousPage}
            disabled={offset === 0}
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('common.previous')}
          </button>

          <span className="text-center text-sm text-gray-600 dark:text-gray-400 break-words">
            {t('profile.gameHistory.showing', {
              start: offset + 1,
              end: Math.min(offset + limit, totalCount),
              total: totalCount,
            })}
          </span>

          <button
            onClick={handleNextPage}
            disabled={!hasMore}
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  )
}
