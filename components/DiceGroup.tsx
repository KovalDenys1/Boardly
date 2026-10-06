'use client'

import React from 'react'
import Dice from './Dice'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { sounds } from '@/lib/sounds'

interface DiceGroupProps {
  dice: number[]
  held: boolean[]
  onToggleHold: (index: number) => void
  disabled?: boolean
  isRolling?: boolean
  isMyTurn?: boolean
  /**
   * Roll handler + whether it's currently valid to roll. The "Roll dice
   * first" hint below is visually the most prominent, obviously-clickable
   * element on the screen at this point in a turn — on short viewports the
   * real Roll button can be scrolled below the fold (see the load-bearing
   * overflow-y-auto comment in YahtzeeGameBoard.tsx), so this hint doubles
   * as a roll trigger instead of being purely decorative text a player
   * naturally taps and gets nothing from.
   */
  onRollDice?: () => void
  canRoll?: boolean
  /** Phone-landscape pane (#751): trims grid padding and drops the hint chip
   * — the chip is a tap-to-roll fallback for when the real Roll button is
   * below the fold, which never happens in the landscape tree. Without this
   * the full-size content (~190px) overflows the shrunken dice box via
   * justify-center and paints over the timer above it. */
  compact?: boolean
}

const DiceGroup = React.memo(function DiceGroup({ dice, held, onToggleHold, disabled = false, isRolling = false, isMyTurn = false, onRollDice, canRoll = false, compact = false }: DiceGroupProps) {
  const { t } = useTranslation()

  return (
    <div className={`flex h-full flex-col items-center justify-center ${compact ? 'gap-1 p-1.5' : 'gap-3 p-3 sm:gap-4 sm:p-4'}`}>
      {/* Dice Grid - Optimized for visibility */}
      <div className={`bd-dot-grid w-full rounded-[28px] border border-bd-line ${compact ? 'px-3 py-2' : 'px-4 py-5 sm:px-5 sm:py-6'}`} style={{ background: 'var(--bd-bg2)' }}>
        <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-4 lg:gap-2">
        {dice.map((value, index) => (
          <Dice
            key={`die-${index}`}
            value={value}
            held={held[index]}
            onToggleHold={() => onToggleHold(index)}
            isRolling={isRolling}
            disabled={disabled}
          />
        ))}
        </div>
      </div>

      {/* Helpful hint - compact */}
      {!compact && (
      <div className="text-center px-2">
        {!isMyTurn ? (
          <p className="bd-chip px-3 py-2 text-bd-ink-soft flex items-center gap-1 sm:gap-2! justify-center">
            <Icon name="hourglass" size={16} />
            <span className="wrap-break-word">{t('yahtzee.ui.waitTurnHint')}</span>
          </p>
        ) : disabled && canRoll && onRollDice ? (
          <button
            type="button"
            onClick={() => {
              sounds.play('click', { force: true })
              onRollDice()
            }}
            className="bd-chip px-3 py-2 text-bd-ink-soft flex items-center gap-1 sm:gap-2! justify-center w-full cursor-pointer transition-transform active:scale-[0.98]"
          >
            <Icon name="dice" size={16} />
            <span className="wrap-break-word">{t('yahtzee.ui.rollFirstHint')}</span>
          </button>
        ) : disabled ? (
          <p className="bd-chip px-3 py-2 text-bd-ink-soft flex items-center gap-1 sm:gap-2! justify-center">
            <Icon name="dice" size={16} />
            <span className="wrap-break-word">{t('yahtzee.ui.rollFirstHint')}</span>
          </p>
        ) : (
          <p className="bd-chip bd-chip-lav px-3 py-2 text-xs sm:text-sm! font-medium flex items-center gap-1 sm:gap-2! justify-center">
            <Icon name="point" size={16} />
            <span className="wrap-break-word">{t('yahtzee.ui.holdHint')}</span>
          </p>
        )}
      </div>
      )}
    </div>
  )
})

export default DiceGroup
