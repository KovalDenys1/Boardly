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
    <div className="flex flex-col items-center justify-center h-full gap-2 sm:gap-4 p-2 sm:p-4">
      {/* Dice Grid - Optimized for visibility */}
      <div className="flex flex-wrap gap-2 sm:gap-4 justify-center items-center max-w-full">
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

      {/* Helpful hint - compact */}
      <div className="text-center px-2">
        {!isMyTurn ? (
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 sm:gap-2 justify-center">
            <span className="text-sm sm:text-base">⏳</span>
            <span className="break-words">{t('yahtzee.ui.waitTurnHint')}</span>
          </p>
        ) : disabled ? (
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 sm:gap-2 justify-center">
            <span className="text-sm sm:text-base">🎲</span>
            <span className="break-words">{t('yahtzee.ui.rollFirstHint')}</span>
          </p>
        ) : (
          <p className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 sm:gap-2 justify-center">
            <span className="text-sm sm:text-base">👆</span>
            <span className="break-words">{t('yahtzee.ui.holdHint')}</span>
          </p>
        )}
      </div>
    </div>
  )
})

export default DiceGroup
