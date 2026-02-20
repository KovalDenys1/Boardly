'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { ALL_CATEGORIES, YahtzeeCategory } from '@/lib/yahtzee'
import Modal from './Modal'
import LoadingSpinner from './LoadingSpinner'
import { clientLogger } from '@/lib/client-logger'

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

interface GameResult {
  id: string
  lobbyCode: string
  lobbyName: string
  gameType: string
  status: string
  createdAt: string
  updatedAt: string
  finishedAt: string | null
  abandonedAt: string | null
  players: Player[]
  state: any // Game-specific state (Yahtzee scorecard, etc.)
}

interface GameResultsModalProps {
  gameId: string | null
  onClose: () => void
}

export default function GameResultsModal({ gameId, onClose }: GameResultsModalProps) {
  const { t } = useTranslation()
  const [game, setGame] = useState<GameResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) {
      setLoading(false)
      return
    }

    const loadGameDetails = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/game/${gameId}/results`)
        
        if (!response.ok) {
          throw new Error('Failed to load game details')
        }

        const data = await response.json()
        setGame(data)
        
        clientLogger.log('Game details loaded', { gameId })
      } catch (err) {
        clientLogger.error('Error loading game details:', err)
        setError(t('errors.failedToLoad'))
      } finally {
        setLoading(false)
      }
    }

    loadGameDetails()
  }, [gameId, t])

  if (!gameId) return null

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
      case 'uno':
        return 'Uno'
      default:
        return gameType
    }
  }

  function renderYahtzeeScorecard() {
    if (!game || game.gameType !== 'yahtzee' || !game.state?.gameData) return null

    const gameData = game.state.gameData
    const categories: YahtzeeCategory[] = [...ALL_CATEGORIES]

    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">{t('profile.gameResults.scorecard')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">
                  {t('profile.gameResults.category')}
                </th>
                {game.players.map((player) => (
                  <th
                    key={player.id}
                    className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center"
                  >
                    {player.username || 'Player'}
                    {(player.isBot || player.bot) && ' 🤖'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 font-medium capitalize">
                    {t(`yahtzee.categories.${category}`)}
                  </td>
                  {game.players.map((player) => {
                    const playerData = gameData.players?.[player.id]
                    const score = playerData?.scores?.[category]
                    return (
                      <td
                        key={player.id}
                        className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center"
                      >
                        {score !== null && score !== undefined ? score : '-'}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="bg-yellow-50 dark:bg-yellow-900/20 font-bold">
                <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">
                  {t('profile.gameResults.total')}
                </td>
                {game.players.map((player) => (
                  <td
                    key={player.id}
                    className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center"
                  >
                    {player.finalScore ?? player.score}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <Modal isOpen={!!gameId} onClose={onClose} title={game?.lobbyName || t('profile.gameResults.title')}>
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
          {error}
        </div>
      ) : game ? (
        <div className="space-y-6">
          {/* Game Info */}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatGameType(game.gameType)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {formatDate(game.createdAt)}
                {game.finishedAt && ` - ${formatDate(game.finishedAt)}`}
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

          {/* Players Rankings */}
          <div>
            <h3 className="text-lg font-semibold mb-3">{t('profile.gameResults.rankings')}</h3>
            <div className="space-y-2">
              {[...game.players]
                .sort((a, b) => (b.finalScore ?? b.score) - (a.finalScore ?? a.score))
                .map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      player.isWinner
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600'
                        : 'bg-gray-100 dark:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-gray-500 dark:text-gray-400 w-8">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {player.username || `Player ${index + 1}`}
                          {(player.isBot || player.bot) && ' 🤖'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {player.finalScore ?? player.score} {t('profile.gameResults.points')}
                      </span>
                      {player.isWinner && <span className="text-2xl">👑</span>}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Game-specific details */}
          {renderYahtzeeScorecard()}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {t('errors.gameNotFound')}
        </div>
      )}
    </Modal>
  )
}
