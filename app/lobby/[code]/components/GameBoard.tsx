import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import DiceGroup from '@/components/DiceGroup'
import Scorecard from '@/components/Scorecard'
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
  onRollDice,
  onToggleHold,
  onScore,
  onCelebrationComplete,
}: GameBoardProps) {
  return (
    <>
      {/* Game Status Bar */}
      <div className="card mb-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-sm opacity-90">Round</p>
            <p className="text-3xl font-bold">
              {Math.floor(gameEngine.getRound() / (game?.players?.length || 1)) + 1} / 13
            </p>
          </div>
          <div>
            <p className="text-sm opacity-90">Current Player</p>
            <p className="text-lg font-bold truncate">
              {gameEngine.getCurrentPlayer()?.name || 'Player'}
            </p>
          </div>
          <div>
            <p className="text-sm opacity-90">Your Score</p>
            <p className="text-3xl font-bold">
              {gameEngine.getPlayers().find(p => p.id === game?.players?.find((gp: any) => !gp.user.isBot)?.userId)?.score || 0}
            </p>
          </div>
          <div>
            <p className="text-sm opacity-90">Time Left</p>
            <div className="flex items-center justify-center gap-2">
              <div className={`text-3xl font-bold ${
                timeLeft <= 10 ? 'text-red-300 animate-pulse' :
                timeLeft <= 30 ? 'text-yellow-300' : ''
              }`}>
                {timeLeft}s
              </div>
              {timeLeft <= 10 && (
                <span className="text-2xl animate-bounce">⏰</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Dice */}
        <div className="lg:col-span-1">
          <DiceGroup
            dice={gameEngine.getDice()}
            held={gameEngine.getHeld()}
            onToggleHold={onToggleHold}
            disabled={isMoveInProgress || gameEngine.getRollsLeft() === 3 || !isMyTurn}
          />

          {/* Roll Button */}
          <div className="card mt-4">
            {/* Turn Indicator */}
            <div className={`text-center mb-4 p-4 rounded-lg transition-all ${
              isMyTurn
                ? timeLeft <= 10
                  ? 'bg-red-100 dark:bg-red-900 border-2 border-red-500 animate-pulse'
                  : timeLeft <= 30
                    ? 'bg-yellow-100 dark:bg-yellow-900 border-2 border-yellow-500'
                    : 'bg-green-100 dark:bg-green-900 border-2 border-green-500'
                : 'bg-gray-100 dark:bg-gray-700'
            }`}>
              {isMyTurn ? (
                <div className="space-y-2">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    🎯 YOUR TURN!
                  </p>
                  <div className={`text-3xl font-extrabold ${
                    timeLeft <= 10
                      ? 'text-red-600 dark:text-red-400'
                      : timeLeft <= 30
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    <span className={timeLeft <= 10 ? 'animate-bounce inline-block' : ''}>
                      {timeLeft <= 10 ? '⏰' : '⏱️'}
                    </span> {timeLeft}s
                  </div>
                  {timeLeft <= 10 && (
                    <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
                      ⚠️ Hurry up! Time is running out!
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                  ⏳ Waiting for {game?.players?.[gameEngine.getState().currentPlayerIndex]?.user?.username || 
                    game?.players?.[gameEngine.getState().currentPlayerIndex]?.user?.name || 'player'}...
                </p>
              )}
            </div>

            <button
              onClick={onRollDice}
              disabled={
                !isMyTurn ||
                gameEngine.getRollsLeft() === 0 ||
                isMoveInProgress
              }
              className="btn btn-primary text-2xl py-6 w-full disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
            >
              {isRolling ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">🎲</span>
                  Rolling...
                </span>
              ) : (
                <>
                  🎲 Roll Dice ({gameEngine.getRollsLeft()}/3)
                </>
              )}
            </button>

            {!isMyTurn && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                Wait for your turn to roll
              </p>
            )}
          </div>
        </div>

        {/* Right Column - Scorecard */}
        <div className="lg:col-span-2">
          {(() => {
            const currentPlayer = gameEngine.getCurrentPlayer()
            const currentUserId = game?.players?.find((p: any) => !p.user.isBot)?.userId
            const isCurrentUserTurn = currentPlayer?.id === currentUserId
            const scorecard = gameEngine.getScorecard(currentPlayer?.id || '')
            
            if (!scorecard) return null
            
            return (
              <Scorecard
                scorecard={scorecard}
                currentDice={gameEngine.getDice()}
                onSelectCategory={onScore}
                canSelectCategory={!isMoveInProgress && gameEngine.getRollsLeft() !== 3}
                isCurrentPlayer={isCurrentUserTurn}
                isLoading={isScoring}
              />
            )
          })()}
        </div>
      </div>

      {/* Celebration Banner */}
      {celebrationEvent && (
        <CelebrationBanner
          event={celebrationEvent}
          onComplete={onCelebrationComplete}
        />
      )}
    </>
  )
}
