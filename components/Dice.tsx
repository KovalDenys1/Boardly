'use client'

import { sounds } from '@/lib/sounds'

interface DiceProps {
  value: number
  held: boolean
  onToggleHold: () => void
  isRolling?: boolean
  disabled?: boolean
}

export default function Dice({ value, held, onToggleHold, isRolling = false, disabled = false }: DiceProps) {
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
      sounds.play('click', { force: true })
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
        relative w-14 h-14 md:w-16 md:h-16 lg:w-12 lg:h-12 max-w-[64px] max-h-[64px] rounded-[20px] lg:rounded-[16px] transition-all duration-200
        ${held 
          ? 'scale-95 ring-4 ring-[rgba(255,196,77,0.35)]'
          : 'hover:-translate-y-0.5 active:scale-95'
        }
        ${isRolling ? 'animate-shake-roll' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none
        transform-gpu
      `}
      style={
        held
          ? {
              background: 'linear-gradient(180deg, rgba(255,196,77,0.92) 0%, rgba(255,168,46,0.98) 100%)',
              border: '3px solid var(--bd-ink)',
              boxShadow: '0 4px 0 0 rgba(31,27,22,0.18)',
            }
          : {
              background: 'rgba(255,255,255,0.72)',
              border: '1.5px solid rgba(0,0,0,0.12)',
              boxShadow: '0 4px 0 0 rgba(0,0,0,0.18)',
            }
      }
    >
      {/* Dots */}
      {getDotPositions(value).map((position, index) => (
        <div
          key={`${position}-${index}`}
          className={`absolute w-2.5 h-2.5 md:w-3 md:h-3 lg:w-2 lg:h-2 rounded-full shadow-sm bg-[var(--bd-ink)] ${dotClasses[position]}`}
        />
      ))}
      
      {/* Held indicator */}
      {held && (
        <div
          className="absolute -top-2 -right-2 min-w-[28px] h-7 rounded-full flex items-center justify-center px-1.5 text-white text-[11px] font-bold shadow-sm border-2 border-white"
          style={{ background: 'var(--bd-coral)' }}
        >
          HOLD
        </div>
      )}
    </button>
  )
}
