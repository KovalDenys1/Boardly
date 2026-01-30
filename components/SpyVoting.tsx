'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Player } from '@/lib/game-engine'

interface SpyVotingProps {
  players: Player[]
  currentUserId: string
  onVote: (targetId: string) => void
  hasVoted: boolean
  votesSubmitted: number
  timeRemaining: number
}

export default function SpyVoting({
  players,
  currentUserId,
  onVote,
  hasVoted,
  votesSubmitted,
  timeRemaining,
}: SpyVotingProps) {
  const { t } = useTranslation()
  const [selectedPlayer, setSelectedPlayer] = useState<string>('')

  const handleVote = () => {
    if (selectedPlayer && !hasVoted) {
      onVote(selectedPlayer)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4 sm:p-8">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl border border-white/20">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🗳️</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            {t('spy.phases.voting')}
          </h2>
          <div className="text-xl text-purple-200">
            {t('spy.timeRemaining', { time: formatTime(timeRemaining) })}
          </div>
        </div>

        {/* Question */}
        <div className="text-center mb-6">
          <p className="text-white text-lg font-semibold">
            {t('spy.voteFor')}
          </p>
        </div>

        {/* Player Selection */}
        <div className="space-y-3 mb-6">
          {players
            .filter((p) => p.id !== currentUserId) // Can't vote for yourself
            .map((player) => (
              <button
                key={player.id}
                onClick={() => !hasVoted && setSelectedPlayer(player.id)}
                disabled={hasVoted}
                className={`w-full p-4 rounded-xl font-semibold transition-all ${
                  selectedPlayer === player.id
                    ? 'bg-purple-500 text-white shadow-lg scale-105'
                    : hasVoted
                    ? 'bg-gray-500/30 text-gray-400 cursor-not-allowed'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{player.name}</span>
                  {selectedPlayer === player.id && (
                    <span className="text-2xl">✓</span>
                  )}
                </div>
              </button>
            ))}
        </div>

        {/* Vote Count */}
        <div className="text-center mb-4 text-purple-200">
          {t('spy.messages.playerVoted', { player: '' })}: {votesSubmitted}/{players.length}
        </div>

        {/* Confirm Button */}
        {!hasVoted && (
          <button
            onClick={handleVote}
            disabled={!selectedPlayer}
            className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all ${
              selectedPlayer
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg'
                : 'bg-gray-500 cursor-not-allowed'
            }`}
          >
            {t('spy.confirmVote')}
          </button>
        )}

        {hasVoted && (
          <div className="w-full py-3 px-6 rounded-xl bg-green-500/30 text-white text-center font-semibold">
            ✓ {t('spy.messages.playerVoted', { player: 'You' })}
          </div>
        )}
      </div>
    </div>
  )
}
