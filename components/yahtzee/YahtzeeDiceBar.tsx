'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { sounds } from '@/lib/sounds'
import { Icon } from '@/components/icons'

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DieButton({
  value,
  held,
  blank,
  disabled,
  shaking,
  onToggle,
}: {
  value: number
  held: boolean
  blank: boolean
  disabled: boolean
  shaking: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const [pop, setPop] = React.useState(false)
  const previousHeld = React.useRef(held)
  React.useEffect(() => {
    if (held && !previousHeld.current) {
      setPop(true)
      const timeout = setTimeout(() => setPop(false), 280)
      previousHeld.current = held
      return () => clearTimeout(timeout)
    }
    previousHeld.current = held
  }, [held])

  const pips = PIPS[value] ?? []
  return (
    <button
      type="button"
      className={`yz-die${held ? ' yz-die--held' : ''}${blank ? ' yz-die--blank' : ''}${pop ? ' yz-die--pop' : ''}${shaking && !held ? ' animate-shake-roll' : ''}`}
      disabled={disabled}
      aria-pressed={held}
      aria-label={blank ? t('yahtzee.ui.dieBlankAria') : t(held ? 'yahtzee.ui.dieHeldAria' : 'yahtzee.ui.dieAria', { value })}
      onClick={() => {
        sounds.play('click', { force: true })
        onToggle()
      }}
    >
      <span className="yz-die__pips" aria-hidden>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="yz-die__pip" style={{ opacity: !blank && pips.includes(i) ? 1 : 0 }} />
        ))}
      </span>
    </button>
  )
}

/**
 * Five dice and the Roll button on one row (#1187). Tapping a die holds it; the
 * button says how many rolls are left, and once there are none it says what to
 * do instead. Spectators get the dice without the button.
 */
export default function YahtzeeDiceBar({
  dice,
  held,
  rollsLeft,
  isMyTurn,
  isRolling,
  canHold,
  canRoll,
  onToggleHold,
  onRoll,
  showRollButton = true,
}: {
  dice: readonly number[]
  held: readonly boolean[]
  rollsLeft: number
  isMyTurn: boolean
  isRolling: boolean
  canHold: boolean
  canRoll: boolean
  onToggleHold: (index: number) => void
  onRoll: () => void
  showRollButton?: boolean
}) {
  const { t } = useTranslation()
  // Before the first roll of a turn the dice still show the last player's
  // roll; they read as a fresh set, not as something to score.
  const blank = isMyTurn && rollsLeft === 3

  const rollLabel = isRolling
    ? t('yahtzee.ui.rolling')
    : !isMyTurn
      ? t('yahtzee.ui.rollWaiting')
      : rollsLeft === 0
        ? t('yahtzee.ui.rollNone')
        : rollsLeft === 3
          ? t('yahtzee.ui.rollDice')
          : t('yahtzee.ui.rollWithCount', { count: rollsLeft })

  return (
    <div className="yz-dicebar">
      <div className="yz-dice">
        {dice.map((value, index) => (
          <DieButton
            key={index}
            value={value}
            held={!!held[index]}
            blank={blank}
            disabled={!canHold}
            shaking={isRolling}
            onToggle={() => onToggleHold(index)}
          />
        ))}
      </div>
      {showRollButton && (
        <button
          type="button"
          className="yz-roll"
          disabled={!canRoll}
          aria-label={`${t('yahtzee.ui.rollDice')}. ${t('yahtzee.ui.rollsLeftCount', { count: rollsLeft })}`}
          onClick={() => {
            sounds.play('click', { force: true })
            onRoll()
          }}
        >
          <Icon name="dice" size={16} className={isRolling ? 'animate-spin' : undefined} />
          <span>{rollLabel}</span>
        </button>
      )}
    </div>
  )
}
