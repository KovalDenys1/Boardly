'use client'

import { useState } from 'react'

interface DiceProps {
  value: number
  held: boolean
  onToggleHold: () => void
  isRolling?: boolean
  disabled?: boolean
}

export default function Dice({ value, held, onToggleHold, isRolling = false, disabled = false }: DiceProps) {
  const [animationKey, setAnimationKey] = useState(0)

  const getDotPositions = (num: number) => {
    const positions: string[] = []
    
    switch (num) {
      case 1:
        positions.push('center')
        break
      case 2:
        positions.push('top-left', 'bottom-right')
        break
      case 3:
        positions.push('top-left', 'center', 'bottom-right')
        break
      case 4:
        positions.push('top-left', 'top-right', 'bottom-left', 'bottom-right')
        break
      case 5:
        positions.push('top-left', 'top-right', 'center', 'bottom-left', 'bottom-right')
        break
      case 6:
        positions.push('top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right')
        break
    }
    
    return positions
  }

  const dotClasses: Record<string, string> = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'middle-left': 'top-1/2 -translate-y-1/2 left-2',
    'middle-right': 'top-1/2 -translate-y-1/2 right-2',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2',
  }

  return (
    <button
      onClick={!disabled ? onToggleHold : undefined}
      disabled={disabled}
      aria-label={`Dice showing ${value}, ${held ? 'held' : 'not held'}. Click to ${held ? 'release' : 'hold'}.`}
      aria-pressed={held}
      className={`
        relative w-20 h-20 sm:w-22 sm:h-22 md:w-24 md:h-24 rounded-xl shadow-lg transition-all duration-200
        ${held ? 'bg-blue-500 border-4 border-blue-600 scale-95' : 'bg-white border-4 border-gray-800 hover:scale-105 active:scale-95'}
        ${isRolling ? 'animate-shake-roll' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none
      `}
      key={animationKey}
    >
      {/* Dots */}
      {getDotPositions(value).map((position, index) => (
        <div
          key={`${position}-${index}`}
          className={`absolute w-3 h-3 md:w-4 md:h-4 rounded-full ${
            held ? 'bg-white' : 'bg-gray-800'
          } ${dotClasses[position]}`}
        />
      ))}
      
      {/* Held indicator */}
      {held && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
          🔒
        </div>
      )}
    </button>
  )
}
