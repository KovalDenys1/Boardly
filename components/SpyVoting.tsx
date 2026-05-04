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
    <div className="spy-stage">
      <div className="spy-vote-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="bd-kicker">{t('spy.phases.voting')}</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--bd-ink)]">{t('spy.voteFor')}</h2>
          </div>
          <div className="spy-timer-pill">
            {t('spy.timeRemaining', { time: formatTime(timeRemaining) })}
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          {players
            .filter((p) => p.id !== currentUserId)
            .map((player) => {
              const selected = selectedPlayer === player.id
              return (
                <button
                  key={player.id}
                  onClick={() => !hasVoted && setSelectedPlayer(player.id)}
                  disabled={hasVoted}
                  className={`spy-vote-option ${selected ? 'spy-vote-option-selected' : ''} ${hasVoted ? 'opacity-60' : ''}`}
                >
                  <span className="bd-avatar bd-avatar-lav h-10 w-10">
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left font-bold">{player.name}</span>
                  <span className={`spy-check ${selected ? 'spy-check-selected' : ''}`} />
                </button>
              )
            })}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase text-[var(--bd-ink-muted)]">
            <span>{t('spy.votes')}</span>
            <span>{votesSubmitted}/{players.length}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bd-bg2)]">
            <div
              className="h-full rounded-full bg-[var(--bd-lav)] transition-all"
              style={{ width: `${players.length > 0 ? (votesSubmitted / players.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {!hasVoted ? (
          <button
            onClick={handleVote}
            disabled={!selectedPlayer}
            className={`bd-btn mt-5 w-full justify-center ${selectedPlayer ? 'bd-btn-primary' : 'bd-btn-soft cursor-not-allowed opacity-60'}`}
          >
            {t('spy.confirmVote')}
          </button>
        ) : (
          <div className="mt-5 rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] px-4 py-3 text-center text-sm font-bold text-[var(--bd-mint-deep)]">
            {t('spy.confirmVote')}
          </div>
        )}
      </div>
    </div>
  )
}
