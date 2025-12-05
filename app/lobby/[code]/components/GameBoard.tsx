import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import DiceGroup from '@/components/DiceGroup'
import CelebrationBanner from '@/components/CelebrationBanner'
import { YahtzeeCategory } from '@/lib/yahtzee'
import { CelebrationEvent } from '@/lib/celebrations'

interface GameBoardProps {
  gameEngine: YahtzeeGame
  game: any
  isMyTurn: boolean
  timeLeft: number
  isMoveInProgress: boolean
  isRolling: boolean
  isScoring: boolean
  celebrationEvent: CelebrationEvent | null
  held: boolean[] // Local held state from useGameActions
  getCurrentUserId: () => string | undefined
  onRollDice: () => void
  onToggleHold: (index: number) => void
  onScore: (category: YahtzeeCategory) => void
  onCelebrationComplete: () => void
}

export default function GameBoard({
  gameEngine,
  game,
  isMyTurn,
  timeLeft,
  isMoveInProgress,
  isRolling,
  isScoring,
  celebrationEvent,
  held,
  getCurrentUserId,
  onRollDice,
  onToggleHold,
  onScore,
  onCelebrationComplete,
}: GameBoardProps) {
  return (
    <div className="flex flex-col gap-2 sm:gap-3 min-h-0 h-full">
      {/* Dice Area with Timer */}
      <div className="flex-1 min-h-0 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        {/* Timer at top of dice area */}
        <div className="flex-shrink-0 p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
          <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition-all ${
            timeLeft <= 10 ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse shadow-lg' :
            timeLeft <= 30 ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-md' : 
            'bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 text-gray-900 dark:text-white'
          }`}>
            <span className="text-xl sm:text-2xl">⏱️</span>
            <span className="text-2xl sm:text-3xl font-bold">{timeLeft}s</span>
          </div>
        </div>
        
        {/* Dice */}
        <div className="flex-1 min-h-0">
          <DiceGroup
            dice={gameEngine.getDice()}
            held={isMyTurn ? held : gameEngine.getHeld()}
            onToggleHold={onToggleHold}
            disabled={!isMyTurn || isMoveInProgress || gameEngine.getRollsLeft() === 3}
            isMyTurn={isMyTurn}
          />
        </div>
      </div>

      {/* Controls Section - Compact */}
      <div className="flex-shrink-0 space-y-2">
        {/* Turn Indicator */}
        {isMyTurn ? (
          timeLeft <= 10 ? (
            // Urgent state
            <div className="text-center px-3 py-2 rounded-xl shadow-lg bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">⚠️</span>
                <p className="text-sm font-bold">Hurry!</p>
              </div>
            </div>
          ) : (
            // Normal turn state
            <div className="text-center px-3 py-2 rounded-xl shadow-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">🎯</span>
                <p className="text-sm font-bold">Your Turn</p>
              </div>
            </div>
          )
        ) : (
          <div className="text-center px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl animate-pulse">⏳</span>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Waiting...
              </p>
            </div>
          </div>
        )}

        {/* Roll Button */}
        <button
          onClick={onRollDice}
          disabled={
            !isMyTurn ||
            gameEngine.getRollsLeft() === 0 ||
            isMoveInProgress
          }
          className={`w-full px-5 py-3 rounded-xl font-bold text-base transition-all duration-200 shadow-lg
            ${!isMyTurn || gameEngine.getRollsLeft() === 0 || isMoveInProgress
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white transform hover:scale-105 hover:shadow-xl active:scale-95'
            }`}
        >
          {isRolling ? (
            <span className="flex items-center justify-center gap-2">
              <span className="text-xl animate-spin">🎲</span>
              <span>Rolling...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span className="text-xl">🎲</span>
              <span>Roll ({gameEngine.getRollsLeft()}/3)</span>
            </span>
          )}
        </button>
      </div>

      {/* Celebration Banner */}
      {celebrationEvent && (
        <CelebrationBanner
          event={celebrationEvent}
          onComplete={onCelebrationComplete}
        />
      )}
    </div>
  )
}
