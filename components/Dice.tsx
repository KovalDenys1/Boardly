'use client'

import { useState } from 'react'
import { soundManager } from '@/lib/sounds'

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

  const handleClick = () => {
    if (!disabled) {
      soundManager.play('click')
      onToggleHold()
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      aria-label={`Dice showing ${value}, ${held ? 'held' : 'not held'}. Click to ${held ? 'release' : 'hold'}.`}
      aria-pressed={held}
      className={`
        relative w-14 h-14 md:w-16 md:h-16 max-w-[64px] max-h-[64px] rounded-xl shadow-lg transition-all duration-200
        ${held 
          ? 'bg-gradient-to-br from-yellow-400 to-amber-500 border-4 border-yellow-600 scale-95 ring-4 ring-yellow-300' 
          : 'bg-white dark:bg-gray-100 border-4 border-gray-800 dark:border-gray-700 hover:scale-105 hover:shadow-xl active:scale-95'
        }
        ${isRolling ? 'animate-shake-roll' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none
        transform-gpu
      `}
      key={animationKey}
    >
      {/* Dots */}
      {getDotPositions(value).map((position, index) => (
        <div
          key={`${position}-${index}`}
          className={`absolute w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shadow-md ${
            held ? 'bg-gray-900' : 'bg-gray-900 dark:bg-gray-800'
          } ${dotClasses[position]}`}
        />
      ))}
      
      {/* Held indicator */}
      {held && (
        <div className="absolute -top-2 -right-2 w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center text-white text-base font-bold shadow-lg border-2 border-white">
          🔒
        </div>
      )}
    </button>
  )
}
