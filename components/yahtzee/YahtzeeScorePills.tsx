'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import ScorePop from '@/components/game-chrome/ScorePop'

export interface YahtzeeScorePill {
  id: string
  name: string
  score: number
  isBot?: boolean
  /** Set for another human player: tapping the pill opens their player card. */
  profileId?: string | null
}

export default function YahtzeeScorePills({
  players,
  viewerId,
  currentTurnId,
  onOpenProfile,
}: {
  players: readonly YahtzeeScorePill[]
  viewerId: string | null | undefined
  currentTurnId: string | null | undefined
  onOpenProfile?: (userId: string) => void
}) {
  const { t } = useTranslation()
  return (
    <ul className="yz-pills" aria-label={t('yahtzee.ui.scoresLabel')}>
      {players.map((player) => {
        const name = player.id === viewerId ? t('yahtzee.ui.youPill') : player.name
        const className = `yz-pill${player.id === currentTurnId ? ' yz-pill--current' : ''}`
        const label = t('yahtzee.ui.pillAria', { player: name, score: player.score })
        const content = (
          <>
            <span className="yz-pill__turn" aria-hidden />
            {player.isBot && <Icon name="robot" size={13} />}
            <span className="yz-pill__name" aria-hidden>{name}</span>
            <ScorePop value={player.score} className="yz-pill__score" aria-hidden>{player.score}</ScorePop>
          </>
        )
        const profileId = player.profileId
        if (profileId && onOpenProfile) {
          return (
            <li key={player.id}>
              <button
                type="button"
                className={className}
                aria-label={`${label}. ${t('report.openPlayerCard', { name })}`}
                aria-haspopup="dialog"
                onClick={() => onOpenProfile(profileId)}
              >
                {content}
              </button>
            </li>
          )
        }
        return (
          <li key={player.id} className={className} aria-label={label}>
            {content}
          </li>
        )
      })}
    </ul>
  )
}
