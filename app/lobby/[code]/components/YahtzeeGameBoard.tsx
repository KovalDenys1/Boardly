import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import DiceGroup from '@/components/DiceGroup'
import CelebrationBanner from '@/components/CelebrationBanner'
import { YahtzeeCategory } from '@/lib/yahtzee'
import { CelebrationEvent } from '@/lib/celebrations'
import { useTranslation } from '@/lib/i18n-helpers'

interface GameBoardProps {
  gameEngine: YahtzeeGame
  game: any
  isMyTurn: boolean
  timeLeft: number
  turnTimerLimit: number // Total time limit for percentage calculation
  isMoveInProgress: boolean
  isRolling: boolean
  isScoring: boolean
  isStateReverting: boolean
  celebrationEvent: CelebrationEvent | null
  held: boolean[] // Local held state from useGameActions
  getCurrentUserId: () => string | null | undefined
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
  turnTimerLimit,
  isMoveInProgress,
  isRolling,
  isScoring,
  isStateReverting,
  celebrationEvent,
  held,
  getCurrentUserId,
  onRollDice,
  onToggleHold,
  onScore,
  onCelebrationComplete,
}: GameBoardProps) {
  const { t } = useTranslation()
  const percentage = turnTimerLimit > 0 ? (timeLeft / turnTimerLimit) * 100 : 100
  const rollsLeft = gameEngine.getRollsLeft()

  return (
    <div className="h-full flex flex-col gap-2 sm:gap-3">
      {/* Dice Area with Timer */}
      <div className="flex-1 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        {/* Timer at top of dice area */}
        <div className="flex-shrink-0 p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
          <div className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all ${percentage <= 17 ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse shadow-lg' :
              percentage <= 50 ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-md' :
                'bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 text-gray-900 dark:text-white'
            }`}>
            <span className="text-lg sm:text-2xl">⏱️</span>
            <span className="text-xl sm:text-2xl font-bold">{timeLeft}s</span>
          </div>
        </div>

        {/* Dice */}
        <div className="flex-1">
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
      <div className="flex-shrink-0 space-y-1.5 sm:space-y-2">
        {isStateReverting && (
          <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-md bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-200 animate-pulse">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <span className="text-base sm:text-lg">↩️</span>
              <p className="text-xs sm:text-sm font-semibold">{t('yahtzee.ui.moveReverted')}</p>
            </div>
          </div>
        )}

        {/* Turn Indicator */}
        {isMyTurn ? (
          timeLeft <= 10 ? (
            // Urgent state
            <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-lg bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <span className="text-base sm:text-xl">⚠️</span>
                <p className="text-xs sm:text-sm font-bold">{t('yahtzee.ui.hurry')}</p>
              </div>
            </div>
          ) : (
            // Normal turn state
            <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <span className="text-base sm:text-xl">🎯</span>
                <p className="text-xs sm:text-sm font-bold">{t('yahtzee.ui.yourTurn')}</p>
              </div>
            </div>
          )
        ) : (
          <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <span className="text-base sm:text-xl animate-pulse">⏳</span>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                {t('yahtzee.ui.waiting')}
              </p>
            </div>
          </div>
        )}

        {/* Roll Button */}
        <button
          onClick={onRollDice}
          aria-label={`${t('yahtzee.ui.rollDice')}. ${t('yahtzee.ui.rollsLeft', { count: rollsLeft })}`}
          disabled={
            !isMyTurn ||
            rollsLeft === 0 ||
            isMoveInProgress ||
            isRolling
          }
          className={`w-full overflow-hidden px-3 sm:px-5 py-2.5 sm:py-3 min-h-[52px] sm:min-h-[56px] rounded-lg sm:rounded-xl font-bold text-sm sm:text-base transition-all duration-200 shadow-lg
            ${!isMyTurn || rollsLeft === 0 || isMoveInProgress || isRolling
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:shadow-xl active:scale-95'
            }`}
        >
          {isRolling ? (
            <span className="flex w-full items-center justify-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-lg sm:text-xl animate-spin">🎲</span>
              <span className="truncate">{t('yahtzee.ui.rolling')}</span>
            </span>
          ) : (
            <span className="flex w-full items-center justify-between gap-2 min-w-0">
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="text-lg sm:text-xl shrink-0">🎲</span>
                <span className="truncate">{t('yahtzee.ui.rollDice')}</span>
              </span>
              <span
                title={t('yahtzee.ui.rollsLeft', { count: rollsLeft })}
                className="shrink-0 whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-xs sm:text-sm font-semibold"
              >
                {rollsLeft}/3
              </span>
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
