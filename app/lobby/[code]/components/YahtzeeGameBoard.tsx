import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import DiceGroup from '@/components/DiceGroup'
import CelebrationBanner from '@/components/CelebrationBanner'
import { YahtzeeCategory } from '@/lib/yahtzee'
import { CelebrationEvent } from '@/lib/celebrations'
import { useTranslation } from '@/lib/i18n-helpers'
import { sounds } from '@/lib/sounds'
import type { Game } from '@/types/game'

interface GameBoardProps {
  gameEngine: YahtzeeGame
  game: Game
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
  onReviewScorecard?: () => void
  showReviewScorecardButton?: boolean
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
  onReviewScorecard,
  showReviewScorecardButton = false,
}: GameBoardProps) {
  const { t } = useTranslation()
  const percentage = turnTimerLimit > 0 ? (timeLeft / turnTimerLimit) * 100 : 100
  const rollsLeft = gameEngine.getRollsLeft()
  const activeHeld = isMyTurn ? held : gameEngine.getHeld()
  const heldCount = activeHeld.filter(Boolean).length
  const canReviewScorecard = isMyTurn && rollsLeft < 3 && !!onReviewScorecard
  const rollButtonLabel = rollsLeft === 3 ? 'Roll Dice' : 'Roll Again'

  let nextStepTitle = 'Wait for your turn'
  let nextStepCopy = 'The dice and scorecard will unlock when play comes back to you.'
  let nextStepTone = 'bg-slate-50 border-slate-200 text-bd-ink dark:bg-slate-900/40 dark:border-slate-700 dark:text-white'

  if (isMyTurn) {
    nextStepTone = 'bg-blue-50 border-blue-200 text-bd-ink dark:bg-blue-950/30 dark:border-blue-800 dark:text-white'

    if (rollsLeft === 3) {
      nextStepTitle = 'Start with your first roll'
      nextStepCopy = 'Roll all five dice, then keep the ones that help your best category.'
    } else if (rollsLeft === 0) {
      nextStepTitle = 'Score this hand now'
      nextStepCopy = 'No rolls left. Open the scorecard and bank this result in the category you want.'
      nextStepTone = 'bg-emerald-50 border-emerald-200 text-bd-ink dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-white'
    } else if (heldCount === 0) {
      nextStepTitle = 'Pick dice to keep or reroll'
      nextStepCopy = 'Tap the dice you want to hold, then roll again or score this hand as it is.'
    } else {
      nextStepTitle = 'Decide between rerolling and scoring'
      nextStepCopy = `${heldCount} die${heldCount === 1 ? '' : ' dice'} held. Chase a better combo or bank this hand now.`
      nextStepTone = 'bg-violet-50 border-violet-200 text-bd-ink dark:bg-violet-950/30 dark:border-violet-800 dark:text-white'
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Dice Area with Timer + Controls */}
      <div
        className="bd-card flex-1 overflow-hidden flex flex-col min-h-0"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, var(--bd-card-warm) 100%)',
        }}
      >
        {/* Timer at top of dice area */}
        <div className="flex-shrink-0 p-3 border-b" style={{ borderColor: 'var(--bd-line)', background: 'rgba(251,246,238,0.72)' }}>
          <div className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-2xl transition-all ${percentage <= 17 ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse shadow-lg' :
              percentage <= 50 ? 'bg-[var(--bd-sun)] text-bd-ink shadow-sm' :
                'text-bd-ink shadow-sm'
            }`}
            style={percentage > 50 ? { background: 'rgba(107,193,240,0.18)', border: '1px solid rgba(107,193,240,0.24)' } : undefined}
          >
            <span className="text-lg sm:text-2xl">⏱️</span>
            <span className="text-xl sm:text-2xl font-bold" style={{ fontFamily: 'var(--bd-font-display)' }}>{timeLeft}s</span>
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

        {/* Controls pinned to bottom of card */}
        <div className="flex-shrink-0 p-3 space-y-2 border-t pb-[max(env(safe-area-inset-bottom),0.5rem)]" style={{ borderColor: 'var(--bd-line)', background: 'rgba(255,248,236,0.6)' }}>
          <div
            className={`rounded-2xl border px-3 py-3 shadow-sm ${nextStepTone}`}
            style={{
              borderColor:
                nextStepTone.includes('emerald') ? 'rgba(79,201,166,0.28)' :
                nextStepTone.includes('violet') ? 'rgba(155,140,255,0.28)' :
                nextStepTone.includes('blue') ? 'rgba(107,193,240,0.28)' :
                'var(--bd-line)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="bd-kicker">
                Next Move
              </p>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <span className="bd-chip px-2 py-1">
                  {rollsLeft} roll{rollsLeft === 1 ? '' : 's'} left
                </span>
                <span className="bd-chip px-2 py-1">
                  Hold {heldCount}/5
                </span>
              </div>
            </div>
            <p className="mt-1 text-sm font-semibold text-bd-ink">
              {nextStepTitle}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-bd-ink-soft">
              {nextStepCopy}
            </p>
            {showReviewScorecardButton && canReviewScorecard && (
              <button
                type="button"
                onClick={() => {
                  sounds.play('click', { force: true })
                  onReviewScorecard?.()
                }}
                className="bd-btn bd-btn-soft mt-2 !rounded-full !px-3 !py-2 !text-xs"
              >
                Review Scorecard
              </button>
            )}
          </div>

          {isStateReverting && (
            <div className="text-center px-3 py-2 rounded-2xl shadow-sm border text-red-700 animate-pulse" style={{ background: 'rgba(255,107,91,0.14)', borderColor: 'rgba(255,107,91,0.24)' }}>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <span className="text-base sm:text-lg">↩️</span>
                <p className="text-xs sm:text-sm font-semibold">{t('yahtzee.ui.moveReverted')}</p>
              </div>
            </div>
          )}

          {/* Turn Indicator */}
          {isMyTurn ? (
            timeLeft <= 10 ? (
              <div className="text-center px-3 py-2 rounded-2xl shadow-sm text-white animate-pulse bg-gradient-to-r from-red-500 to-pink-500">
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <span className="text-base sm:text-xl">⚠️</span>
                  <p className="text-xs sm:text-sm font-bold">{t('yahtzee.ui.hurry')}</p>
                </div>
              </div>
            ) : (
              <div className="text-center px-3 py-2 rounded-2xl shadow-sm text-bd-ink" style={{ background: 'rgba(79,201,166,0.2)', border: '1px solid rgba(79,201,166,0.28)' }}>
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <span className="text-base sm:text-xl">🎯</span>
                  <p className="text-xs sm:text-sm font-bold">{t('yahtzee.ui.yourTurn')}</p>
                </div>
              </div>
            )
          ) : (
            <div className="text-center px-3 py-2 rounded-2xl border" style={{ background: 'rgba(242,233,216,0.7)', borderColor: 'var(--bd-line)' }}>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <span className="text-base sm:text-xl">⏳</span>
                <p className="text-sm text-bd-ink-muted font-medium">
                  {t('yahtzee.ui.waiting')}
                </p>
              </div>
            </div>
          )}

          {/* Roll Button */}
          <button
            onClick={() => {
              sounds.play('click', { force: true })
              onRollDice()
            }}
            aria-label={`${t('yahtzee.ui.rollDice')}. ${t('yahtzee.ui.rollsLeft', { count: rollsLeft })}`}
            disabled={
              !isMyTurn ||
              rollsLeft === 0 ||
              isMoveInProgress ||
              isRolling
            }
            className={`w-full overflow-hidden px-3 sm:px-5 py-3 min-h-[52px] sm:min-h-[56px] rounded-2xl font-bold text-sm sm:text-base transition-all duration-200
              ${!isMyTurn || rollsLeft === 0 || isMoveInProgress || isRolling
                ? 'text-bd-ink-muted cursor-not-allowed'
                : 'text-[var(--bd-bg)] active:translate-y-[2px]'
              }`}
            style={
              !isMyTurn || rollsLeft === 0 || isMoveInProgress || isRolling
                ? {
                    background: 'var(--bd-bg2)',
                    border: '1.5px solid var(--bd-line)',
                    boxShadow: 'none',
                  }
                : {
                    background: 'var(--bd-ink)',
                    boxShadow: '0 4px 0 0 var(--bd-coral)',
                  }
            }
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
                  <span className="truncate">{rollButtonLabel}</span>
                </span>
                <span
                  title={t('yahtzee.ui.rollsLeft', { count: rollsLeft })}
                  className="shrink-0 whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-xs sm:text-sm font-semibold"
                >
                  {rollsLeft === 3 ? 'First roll' : `${rollsLeft} left`}
                </span>
              </span>
            )}
          </button>
        </div>
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
