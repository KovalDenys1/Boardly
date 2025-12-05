'use client'

import React from 'react'
import Dice from './Dice'

interface DiceGroupProps {
  dice: number[]
  held: boolean[]
  onToggleHold: (index: number) => void
  disabled?: boolean
  isRolling?: boolean
  isMyTurn?: boolean
}

const DiceGroup = React.memo(function DiceGroup({ dice, held, onToggleHold, disabled = false, isRolling = false, isMyTurn = false }: DiceGroupProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 sm:gap-4 p-3 sm:p-4">
      {/* Dice Grid - Optimized for visibility */}
      <div className="flex flex-wrap gap-3 sm:gap-4 justify-center items-center">
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
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 justify-center">
            <span className="text-base">⏳</span>
            <span>Wait for your turn...</span>
          </p>
        ) : disabled ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 justify-center">
            <span className="text-base">🎲</span>
            <span>Roll dice first</span>
          </p>
        ) : (
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-2 justify-center">
            <span className="text-base">👆</span>
            <span>Click dice to hold/release</span>
          </p>
        )}
      </div>
    </div>
  )
})

export default DiceGroup
