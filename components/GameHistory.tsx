'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import LoadingSpinner from './LoadingSpinner'
import GameResultsModal from './GameResultsModal'
import ReplayViewerModal from './ReplayViewerModal'

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

  function getStatusBadgeColor(status: string): string {
    switch (status) {
      case 'finished':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'playing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'abandoned':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    }
  }

  function formatGameType(gameType: string): string {
    switch (gameType) {
      case 'yahtzee':
        return 'Yahtzee'
      case 'chess':
        return 'Chess'
      case 'guess_the_spy':
        return 'Guess the Spy'
      case 'tic_tac_toe':
        return 'Tic Tac Toe'
      case 'rock_paper_scissors':
        return 'Rock Paper Scissors'
      case 'memory':
        return 'Memory'
      case 'uno':
        return 'Uno'
      default:
        return gameType
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
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('profile.gameHistory.status')}
          </label>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="all">{t('profile.gameHistory.allStatuses')}</option>
            <option value="finished">{t('profile.gameHistory.finished')}</option>
            <option value="playing">{t('profile.gameHistory.playing')}</option>
            <option value="abandoned">{t('profile.gameHistory.abandoned')}</option>
            <option value="cancelled">{t('profile.gameHistory.cancelled')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('profile.gameHistory.gameType')}
          </label>
          <select
            value={gameTypeFilter}
            onChange={(e) => handleGameTypeFilterChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="all">{t('profile.gameHistory.allGames')}</option>
            <option value="yahtzee">Yahtzee</option>
            <option value="chess">Chess</option>
            <option value="guess_the_spy">Guess the Spy</option>
            <option value="tic_tac_toe">Tic Tac Toe</option>
            <option value="rock_paper_scissors">Rock Paper Scissors</option>
            <option value="memory">Memory</option>
            <option value="uno">Uno</option>
          </select>
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
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {game.lobbyName}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatGameType(game.gameType)} • {formatDate(game.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                      game.status
                    )}`}
                  >
                    {t(`profile.gameHistory.${game.status}` as any)}
                  </span>
                </div>

                {/* Players */}
                <div className="flex flex-wrap gap-2">
                  {game.players.map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
                        player.isWinner
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {player.username || `Player ${index + 1}`}
                        {(player.isBot || player.bot) && ' 🤖'}
                      </span>
                      {player.finalScore !== null && (
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {player.finalScore} {t('profile.gameResults.points')}
                        </span>
                      )}
                      {player.isWinner && <span className="text-yellow-500">👑</span>}
                    </div>
                  ))}
                </div>
              </button>

              <div className="mt-3 flex items-center justify-between gap-3">
                {/* Click hint */}
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  {t('profile.gameHistory.clickToView')} →
                </div>
                <button
                  onClick={() => setSelectedReplayGameId(game.id)}
                  disabled={!game.hasReplay}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-700 dark:disabled:text-gray-400 transition-colors"
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
        <div className="flex justify-between items-center pt-4">
          <button
            onClick={handlePreviousPage}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('common.previous')}
          </button>

          <span className="text-sm text-gray-600 dark:text-gray-400">
            {t('profile.gameHistory.showing', {
              start: offset + 1,
              end: Math.min(offset + limit, totalCount),
              total: totalCount,
            })}
          </span>

          <button
            onClick={handleNextPage}
            disabled={!hasMore}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  )
}
