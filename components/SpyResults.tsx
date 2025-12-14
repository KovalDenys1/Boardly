'use client'

import { useTranslation } from 'react-i18next'
import { Player } from '@/lib/game-engine'

interface SpyResultsProps {
  players: Player[]
  votes: Record<string, string>
  eliminatedId: string
  spyId: string
  location: string
  scores: Record<string, number>
  currentRound: number
  totalRounds: number
  onNextRound?: () => void
  onPlayAgain?: () => void
  onBackToLobby?: () => void
}

export default function SpyResults({
  players,
  votes,
  eliminatedId,
  spyId,
  location,
  scores,
  currentRound,
  totalRounds,
  onNextRound,
  onPlayAgain,
  onBackToLobby,
}: SpyResultsProps) {
  const { t } = useTranslation()

  const spyWon = eliminatedId !== spyId
  const eliminatedPlayer = players.find((p) => p.id === eliminatedId)
  const spyPlayer = players.find((p) => p.id === spyId)

  // Count votes for each player
  const voteCounts: Record<string, number> = {}
  Object.values(votes).forEach((targetId) => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
  })

  // Sort players by vote count
  const sortedByVotes = [...players].sort((a, b) => {
    return (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)
  })

  // Sort players by score
  const sortedByScore = [...players].sort((a, b) => {
    return (scores[b.id] || 0) - (scores[a.id] || 0)
  })

  const isGameOver = currentRound >= totalRounds

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-4 sm:p-8">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-xl border border-white/20">
        {/* Winner Banner */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4 animate-bounce-in">
            {spyWon ? '🕵️' : '🎉'}
          </div>
          <h2
            className={`text-4xl font-bold mb-2 ${
              spyWon ? 'text-red-300' : 'text-green-300'
            }`}
          >
            {spyWon ? t('spy.spyWins') : t('spy.regularsWin')}
          </h2>
          <p className="text-white text-xl">
            {spyWon
              ? t('spy.wasInnocent', { player: eliminatedPlayer?.name })
              : t('spy.wasSpy', { player: spyPlayer?.name })}
          </p>
          <p className="text-purple-200 text-lg mt-2">
            {t('spy.locationRevealed', { location })}
          </p>
        </div>

        {/* Voting Results */}
        <div className="mb-6">
          <h3 className="text-white text-xl font-semibold mb-3 text-center">
            {t('spy.votes')}
          </h3>
          <div className="space-y-2">
            {sortedByVotes.map((player) => {
              const voteCount = voteCounts[player.id] || 0
              const wasEliminated = player.id === eliminatedId
              const wasSpy = player.id === spyId

              return (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg ${
                    wasEliminated
                      ? 'bg-red-500/30 border-2 border-red-500'
                      : 'bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">
                        {player.name}
                      </span>
                      {wasSpy && (
                        <span className="text-xs bg-red-500 text-white px-2 py-1 rounded">
                          {t('spy.roles.spy')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-purple-500/50 px-3 py-1 rounded text-white">
                        {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
                      </div>
                      {wasEliminated && (
                        <span className="text-red-300">← {t('spy.votedOut', { player: '' }).split('{{')[0]}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Scores */}
        <div className="mb-6">
          <h3 className="text-white text-xl font-semibold mb-3 text-center">
            {t('spy.scores')}
          </h3>
          <div className="space-y-2">
            {sortedByScore.map((player, index) => (
              <div
                key={player.id}
                className="p-3 rounded-lg bg-white/10 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-purple-300">
                    #{index + 1}
                  </span>
                  <span className="text-white font-semibold">
                    {player.name}
                  </span>
                </div>
                <span className="text-2xl font-bold text-green-300">
                  {scores[player.id] || 0} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Round Info */}
        {!isGameOver && (
          <div className="text-center text-purple-200 mb-6">
            {t('spy.round', { current: currentRound, total: totalRounds })}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {!isGameOver && onNextRound && (
            <button
              onClick={onNextRound}
              className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-3 px-6 rounded-xl font-semibold hover:from-purple-600 hover:to-indigo-600 transition-all shadow-lg"
            >
              {t('spy.nextRound')}
            </button>
          )}

          {isGameOver && (
            <>
              {onPlayAgain && (
                <button
                  onClick={onPlayAgain}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 px-6 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg"
                >
                  {t('spy.playAgain')}
                </button>
              )}
              {onBackToLobby && (
                <button
                  onClick={onBackToLobby}
                  className="flex-1 bg-white/20 text-white py-3 px-6 rounded-xl font-semibold hover:bg-white/30 transition-all"
                >
                  {t('spy.backToLobby')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
