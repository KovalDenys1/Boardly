'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { sounds } from '@/lib/sounds'
import { Icon } from '@/components/icons'
import ScorePop from '@/components/game-chrome/ScorePop'

export interface YahtzeeScorePill {
  id: string
  name: string
  score: number
  isBot?: boolean
}

/**
 * Every player's total in one tap-able rail (#1187): "You 86 · Anna 92 ·
 * Max 71". The dark pill is the card the grid is showing; the dot marks whose
 * turn it is. Tapping a pill shows that player's card, read-only.
 */
export default function YahtzeeScorePills({
  players,
  viewerId,
  viewingId,
  currentTurnId,
  onSelect,
}: {
  players: readonly YahtzeeScorePill[]
  viewerId: string | null | undefined
  viewingId: string | null | undefined
  currentTurnId: string | null | undefined
  onSelect: (playerId: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="yz-pills" role="group" aria-label={t('yahtzee.ui.scoresLabel')}>
      {players.map((player) => {
        const isViewer = player.id === viewerId
        const name = isViewer ? t('yahtzee.ui.youPill') : player.name
        const viewing = player.id === viewingId
        return (
          <button
            key={player.id}
            type="button"
            className={`yz-pill${viewing ? ' yz-pill--viewing' : ''}`}
            aria-pressed={viewing}
            aria-label={t('yahtzee.ui.pillAria', { player: name, score: player.score })}
            onClick={() => {
              sounds.play('click', { force: true })
              onSelect(player.id)
            }}
          >
            {player.id === currentTurnId && <span className="yz-pill__turn" aria-hidden />}
            {player.isBot && <Icon name="robot" size={13} />}
            <span className="yz-pill__name">{name}</span>
            <ScorePop value={player.score} className="yz-pill__score">{player.score}</ScorePop>
          </button>
        )
      })}
    </div>
  )
}
