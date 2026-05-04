'use client'

import React from 'react'
import Dice from './Dice'
import { useTranslation } from '@/lib/i18n-helpers'

interface DiceGroupProps {
  dice: number[]
  held: boolean[]
  onToggleHold: (index: number) => void
  disabled?: boolean
  isRolling?: boolean
  isMyTurn?: boolean
}

const DiceGroup = React.memo(function DiceGroup({ dice, held, onToggleHold, disabled = false, isRolling = false, isMyTurn = false }: DiceGroupProps) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3 sm:gap-4 sm:p-4">
      {/* Dice Grid - Optimized for visibility */}
      <div className="bd-dot-grid w-full rounded-[28px] border border-bd-line bg-white/55 px-4 py-5 sm:px-5 sm:py-6">
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
      <div className="text-center px-2">
        {!isMyTurn ? (
          <p className="bd-chip px-3 py-2 text-bd-ink-soft flex items-center gap-1 sm:gap-2 justify-center">
            <span className="text-sm sm:text-base">⏳</span>
            <span className="break-words">{t('yahtzee.ui.waitTurnHint')}</span>
          </p>
        ) : disabled ? (
          <p className="bd-chip px-3 py-2 text-bd-ink-soft flex items-center gap-1 sm:gap-2 justify-center">
            <span className="text-sm sm:text-base">🎲</span>
            <span className="break-words">{t('yahtzee.ui.rollFirstHint')}</span>
          </p>
        ) : (
          <p className="bd-chip bd-chip-lav px-3 py-2 text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2 justify-center">
            <span className="text-sm sm:text-base">👆</span>
            <span className="break-words">{t('yahtzee.ui.holdHint')}</span>
          </p>
        )}
      </div>
    </div>
  )
})

export default DiceGroup
