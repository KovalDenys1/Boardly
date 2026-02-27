'use client'

import { PlayerResults } from '@/lib/yahtzee-results'
import { useTranslation } from '@/lib/i18n-helpers'
import { ALL_CATEGORIES } from '@/lib/yahtzee'

interface YahtzeeResultsProps {
  results: PlayerResults[]
  currentUserId: string | null
  canStartGame: boolean
  canRequestRematch?: boolean
  isRequestRematchPending?: boolean
  onPlayAgain: () => void
  onRequestRematch?: () => void
  onBackToLobby: () => void
}

function getRankIcon(rank: number) {
  if (rank === 0) return '🥇'
  if (rank === 1) return '🥈'
  if (rank === 2) return '🥉'
  return `#${rank + 1}`
}

function getPlacementCardClass(rank: number) {
  if (rank === 0) {
    return 'border-yellow-400 bg-gradient-to-r from-yellow-100/90 via-orange-50/90 to-yellow-100/90 dark:from-yellow-900/25 dark:via-orange-900/20 dark:to-yellow-900/25 shadow-lg'
  }
  if (rank === 1) {
    return 'border-slate-300 bg-slate-100/80 dark:border-slate-600 dark:bg-slate-800/70'
  }
  if (rank === 2) {
    return 'border-orange-300 bg-orange-100/70 dark:border-orange-700 dark:bg-orange-900/25'
  }
  return 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
}

export default function YahtzeeResults({
  results,
  currentUserId,
  canStartGame,
  canRequestRematch = false,
  isRequestRematchPending = false,
  onPlayAgain,
  onRequestRematch,
  onBackToLobby,
}: YahtzeeResultsProps) {
  const { t } = useTranslation()
  const totalRounds = ALL_CATEGORIES.length

  if (results.length === 0) {
    return null
  }

  const winner = results[0]
  const isWinner = winner.playerId === currentUserId
  const secondPlace = results[1] ?? null
  const winnerMargin = secondPlace ? winner.totalScore - secondPlace.totalScore : winner.totalScore
  const winnerScoreBase = Math.max(1, winner.totalScore)

  return (
    <div className="fixed inset-0 top-20 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-5">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto mb-3 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 text-5xl shadow-2xl sm:h-24 sm:w-24 sm:text-6xl">
            🏆
          </div>
          <h2 className="mb-1 bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
            {t('yahtzee.results.gameOver')}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 sm:text-base">
            {t('yahtzee.results.roundsCompleted', { count: totalRounds })} • {results.length}{' '}
            {t('yahtzee.results.players', { count: results.length })}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-center dark:border-yellow-700/60 dark:bg-yellow-900/20 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-yellow-800 dark:text-yellow-200">Winner Score</p>
            <p className="mt-1 text-2xl font-extrabold text-yellow-700 dark:text-yellow-300 sm:text-3xl">{winner.totalScore}</p>
          </div>
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center dark:border-emerald-700/60 dark:bg-emerald-900/20 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Win Margin</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 sm:text-3xl">+{winnerMargin}</p>
          </div>
          <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-center dark:border-blue-700/60 dark:bg-blue-900/20 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200">Players</p>
            <p className="mt-1 text-2xl font-extrabold text-blue-700 dark:text-blue-300 sm:text-3xl">{results.length}</p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-100 via-orange-100 to-yellow-50 p-4 shadow-lg dark:border-yellow-600 dark:from-yellow-900/30 dark:via-orange-900/25 dark:to-yellow-900/20 sm:mb-8 sm:p-5">
          <div className="mb-2 flex items-center justify-center gap-2 text-yellow-700 dark:text-yellow-300">
            <span className="text-xl sm:text-2xl">👑</span>
            <span className="text-xs font-bold uppercase tracking-wide sm:text-sm">Winner</span>
          </div>
          <p className="text-center text-xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">
            {isWinner ? t('yahtzee.results.youWon') : t('yahtzee.results.playerWins', { player: winner.playerName })}
          </p>
          <p className="mt-1 text-center text-3xl font-black text-yellow-700 dark:text-yellow-300 sm:text-5xl">
            {t('yahtzee.results.points', { count: winner.totalScore })}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-white/60 p-3 dark:bg-slate-800/70">
              <p className="text-xs text-slate-500 dark:text-slate-300">{t('yahtzee.results.upperSection')}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
                {winner.upperSectionScore}
                {winner.bonusAchieved && (
                  <span className="ml-1 text-sm font-semibold text-green-600 dark:text-green-400 sm:text-base">
                    +{winner.bonusPoints}
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-lg bg-white/60 p-3 dark:bg-slate-800/70">
              <p className="text-xs text-slate-500 dark:text-slate-300">{t('yahtzee.results.lowerSection')}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{winner.lowerSectionScore}</p>
            </div>
          </div>
          {winner.achievements.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {winner.achievements.map((achievement, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-900/35 dark:text-purple-200 sm:text-sm"
                >
                  <span>{achievement.icon}</span>
                  <span>{achievement.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6 sm:mb-8">
          <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white sm:mb-4 sm:text-2xl">
            {t('yahtzee.results.finalStandings')}
          </h3>
          <div className="space-y-3">
            {results.map((player) => {
              const isCurrentUser = player.playerId === currentUserId
              const scorePercent = Math.max(0, Math.min(100, Math.round((player.totalScore / winnerScoreBase) * 100)))

              return (
                <div
                  key={player.playerId}
                  className={`rounded-xl border p-3 transition-all sm:p-4 ${getPlacementCardClass(player.rank)} ${
                    isCurrentUser ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900' : ''
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold sm:text-2xl">{getRankIcon(player.rank)}</span>
                        <p className="truncate text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                          {player.playerName}
                        </p>
                        {isCurrentUser && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                            {t('yahtzee.results.you')}
                          </span>
                        )}
                        {player.rank === 0 && (
                          <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-bold text-yellow-800 dark:bg-yellow-800/50 dark:text-yellow-200">
                            WINNER
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">{player.totalScore}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-300">{t('profile.gameResults.points')}</p>
                    </div>
                  </div>

                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full ${
                        player.rank === 0 ? 'bg-yellow-500' : player.rank === 1 ? 'bg-slate-500' : player.rank === 2 ? 'bg-orange-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                    <div>
                      <span className="font-medium">{t('yahtzee.results.upper')}</span>{' '}
                      <span className="font-semibold text-slate-900 dark:text-white">{player.upperSectionScore}</span>
                      {player.bonusAchieved && (
                        <span className="ml-1 text-green-600 dark:text-green-400">
                          {t('yahtzee.results.bonus', { count: player.bonusPoints })}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">{t('yahtzee.results.lower')}</span>{' '}
                      <span className="font-semibold text-slate-900 dark:text-white">{player.lowerSectionScore}</span>
                    </div>
                  </div>

                  {player.achievements.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {player.achievements.map((achievement, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-900/35 dark:text-purple-200 sm:text-xs"
                        >
                          <span>{achievement.icon}</span>
                          <span className="hidden sm:inline">{achievement.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
          <div className="flex flex-col items-center">
            <button
              onClick={onPlayAgain}
              disabled={!canStartGame}
              className="btn btn-success flex items-center justify-center gap-2 px-6 py-3 text-sm transition-all hover:brightness-110 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 sm:text-base"
            >
              <span className="text-lg">🔄</span>
              <span>{t('yahtzee.results.playAgain')}</span>
            </button>
            {!canStartGame && (
              <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-300">
                {t('yahtzee.results.hostCanStartNextRound')}
              </p>
            )}
          </div>
          {onRequestRematch && canRequestRematch && (
            <button
              onClick={onRequestRematch}
              disabled={isRequestRematchPending}
              className="btn btn-primary flex items-center justify-center gap-2 px-6 py-3 text-sm transition-all hover:brightness-110 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
            >
              <span className="text-lg">📣</span>
              <span>{isRequestRematchPending ? t('common.loading') : t('yahtzee.results.requestRematch')}</span>
            </button>
          )}
          <button
            onClick={onBackToLobby}
            className="btn btn-secondary flex items-center justify-center gap-2 px-6 py-3 text-sm transition-all hover:brightness-110 hover:shadow-xl sm:text-base"
          >
            <span className="text-lg">↩️</span>
            <span>{t('yahtzee.results.backToLobbies')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
