import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import DiceGroup from '@/components/DiceGroup'
import CelebrationBanner from '@/components/CelebrationBanner'
import { YahtzeeCategory } from '@/lib/yahtzee'
import { CelebrationEvent } from '@/lib/celebrations'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
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
  /** An opponent's or bot's roll just arrived: the dice shake as for the viewer's own (#1114). */
  isOpponentRolling?: boolean
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
  isSpectator?: boolean
  /** Phone-landscape pane (#751): the ~326px landscape box has less room
   * than portrait's already-tight ~424-428px real-device budget, so this
   * trims the dice floor and drops the Next-Move blurb to fit without
   * scrolling. */
  compact?: boolean
}

export default function GameBoard({
  gameEngine,
  game,
  isMyTurn,
  timeLeft,
  turnTimerLimit,
  isMoveInProgress,
  isRolling,
  isOpponentRolling = false,
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
  isSpectator = false,
  compact = false,
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
  let nextStepBg = 'var(--bd-bg)'
  let nextStepBorder = 'var(--bd-line)'

  if (isMyTurn) {
    nextStepBg = 'rgba(107,193,240,0.10)'
    nextStepBorder = 'rgba(107,193,240,0.28)'

    if (rollsLeft === 3) {
      nextStepTitle = 'Start with your first roll'
      nextStepCopy = 'Roll all five dice, then keep the ones that help your best category.'
    } else if (rollsLeft === 0) {
      nextStepTitle = 'Score this hand now'
      nextStepCopy = 'No rolls left. Open the scorecard and bank this result in the category you want.'
      nextStepBg = 'rgba(79,201,166,0.10)'
      nextStepBorder = 'rgba(79,201,166,0.28)'
    } else if (heldCount === 0) {
      nextStepTitle = 'Pick dice to keep or reroll'
      nextStepCopy = 'Tap the dice you want to hold, then roll again or score this hand as it is.'
    } else {
      nextStepTitle = 'Decide between rerolling and scoring'
      nextStepCopy = `${heldCount} die${heldCount === 1 ? '' : ' dice'} held. Chase a better combo or bank this hand now.`
      nextStepBg = 'rgba(155,140,255,0.10)'
      nextStepBorder = 'rgba(155,140,255,0.28)'
    }
  }

  return (
    // justify-center, not stretch (#903): the card below hugs its content, so
    // the height it no longer takes is page padding above and below it rather
    // than empty card. Centring is safe because the card shrinks before it
    // overflows - `flex: 0 1 auto` plus min-h-0 plus its own scroll.
    <div className="h-full flex flex-col justify-center">
      {/* Dice Area with Timer + Controls. overflow-y-auto (not hidden) is
          load-bearing: on a real iPhone with Safari's address bar expanded,
          measured real-device math shows timer(~59px) + dice's own
          min-h-[190px] floor + controls(~207px incl. safe-area-inset-bottom)
          can exceed the ~424-428px actually available, which would silently
          clip the Roll button under overflow:hidden. Scrolling ~20-30px is
          the acceptable worst case; an unreachable Roll button is not. */}
      {/* No flex-1 (#903): #903's second cause names this line - the card was
          `flex-1`, so it took the column's whole height while the dice kept
          theirs. Measured on the branch at 768x1024 before this change: a
          744x797 card around a 112px dice strip, ~197px of empty card above it
          and ~246px below. The flex-item default `0 1 auto` hugs the content
          and still shrinks, which is what the scroll below is for. */}
      <div
        className="bd-card overflow-y-auto flex flex-col min-h-0"
        style={{
          background: 'linear-gradient(180deg, var(--bd-bg) 0%, var(--bd-card-warm) 100%)',
        }}
      >
        {/* Timer at top of dice area */}
        <div className={`flex-shrink-0 px-3 border-b ${compact ? 'py-1' : 'py-1.5'}`} style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}>
          <div className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 rounded-2xl transition-all ${compact ? 'py-0.5' : 'py-1.5'} ${percentage <= 17 ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse shadow-lg' :
              percentage <= 50 ? 'bg-[var(--bd-sun)] text-bd-ink shadow-sm' :
                'text-bd-ink shadow-sm'
            }`}
            style={percentage > 50 ? { background: 'rgba(107,193,240,0.18)', border: '1px solid rgba(107,193,240,0.24)' } : undefined}
          >
            <Icon name="clock" size={compact ? 16 : 22} />
            <span className={`font-bold ${compact ? 'text-base' : 'text-xl sm:text-2xl'}`} style={{ fontFamily: 'var(--bd-font-display)' }}>{timeLeft}s</span>
          </div>
        </div>

        {/* Dice — min-h floor keeps this from being crushed to overlapping
            size when iOS Safari's address-bar toggle momentarily shrinks
            the resolved 100dvh of the fixed game viewport (see
            LobbyPageClient.tsx's scroll-lock comment for the same class of
            bug). It is a floor and nothing else now: `flex-1` here made this
            box absorb whatever the card was given, which is how a 112px strip
            of dice ended up centred in 557px of it (#903). */}
        <div className={compact ? 'min-h-[110px]' : 'min-h-[190px]'}>
          <DiceGroup
            compact={compact}
            dice={gameEngine.getDice()}
            held={isMyTurn ? held : gameEngine.getHeld()}
            onToggleHold={isSpectator ? () => undefined : onToggleHold}
            disabled={isSpectator || !isMyTurn || isMoveInProgress || gameEngine.getRollsLeft() === 3}
            isRolling={isRolling || isOpponentRolling}
            isMyTurn={isMyTurn && !isSpectator}
            onRollDice={isSpectator ? undefined : onRollDice}
            canRoll={
              !isSpectator &&
              isMyTurn &&
              rollsLeft > 0 &&
              heldCount < 5 &&
              !isMoveInProgress &&
              !isRolling
            }
          />
        </div>

        {/* Controls pinned to bottom of card */}
        <div className="flex-shrink-0 p-2.5 space-y-1.5 border-t pb-[max(env(safe-area-inset-bottom),0.5rem)]" style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}>
          <div
            className={`rounded-2xl border px-3 shadow-sm ${compact ? 'py-2' : 'py-3'}`}
            style={{ background: nextStepBg, borderColor: nextStepBorder }}
          >
            {/* Wraps rather than overflows: the ~280px desktop left column cannot
                fit the kicker and all three chips on one line, and without this
                the card's edge sliced the last chip mid-glyph (#906). */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className="bd-kicker shrink-0">
                {t('yahtzee.ui.nextMove')}
              </p>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-[11px] font-semibold">
                <span className={`bd-chip px-2 py-1 ${isMyTurn && timeLeft <= 10 ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse' : isMyTurn ? 'bd-chip-mint' : ''}`}>
                  {isMyTurn ? (
                    timeLeft <= 10
                      ? <><Icon name="warning" size={12} /> {t('yahtzee.ui.hurry')}</>
                      : <><Icon name="target" size={12} /> {t('game.ui.yourTurn')}</>
                  ) : (
                    <><Icon name="hourglass" size={12} /> {t('game.ui.waiting')}</>
                  )}
                </span>
                <span className="bd-chip px-2 py-1">
                  {t('yahtzee.ui.rollsLeftChip', { count: rollsLeft })}
                </span>
                <span className="bd-chip px-2 py-1">
                  {t('yahtzee.ui.holdChip', { held: heldCount, total: 5 })}
                </span>
              </div>
            </div>
            <p className="mt-0.5 text-sm font-semibold text-bd-ink">
              {nextStepTitle}
            </p>
            {/* Dropped in compact mode (#751) — the phone-landscape pane's
                ~326px budget has no room for the descriptive blurb. */}
            {!compact && (
              <p className="mt-0.5 text-xs leading-snug text-bd-ink-soft">
                {nextStepCopy}
              </p>
            )}
            {showReviewScorecardButton && canReviewScorecard && (
              <button
                type="button"
                onClick={() => {
                  sounds.play('click', { force: true })
                  onReviewScorecard?.()
                }}
                className="bd-btn bd-btn-soft mt-2 !rounded-full !px-3 !py-2 !text-xs"
              >
                {t('yahtzee.ui.reviewScorecard')}
              </button>
            )}
          </div>

          {isStateReverting && (
            <div className="text-center px-3 py-1.5 rounded-2xl shadow-sm border text-red-700 animate-pulse" style={{ background: 'rgba(255,107,91,0.14)', borderColor: 'rgba(255,107,91,0.24)' }}>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <Icon name="arrow-left" size={18} />
                <p className="text-xs sm:text-sm font-semibold">{t('yahtzee.ui.moveReverted')}</p>
              </div>
            </div>
          )}

          {/* Roll Button */}
          {!isSpectator && <button
            onClick={() => {
              sounds.play('click', { force: true })
              onRollDice()
            }}
            aria-label={`${t('yahtzee.ui.rollDice')}. ${t('yahtzee.ui.rollsLeft', { count: rollsLeft })}`}
            disabled={
              !isMyTurn ||
              rollsLeft === 0 ||
              heldCount === 5 ||
              isMoveInProgress ||
              isRolling
            }
            className={`w-full overflow-hidden px-3 sm:px-5 py-3 min-h-[52px] sm:min-h-[56px] rounded-2xl font-bold text-sm sm:text-base transition-all duration-200
              ${!isMyTurn || rollsLeft === 0 || heldCount === 5 || isMoveInProgress || isRolling
                ? 'text-bd-ink-muted cursor-not-allowed'
                : 'text-[var(--bd-bg)] active:translate-y-[2px]'
              }`}
            style={
              !isMyTurn || rollsLeft === 0 || heldCount === 5 || isMoveInProgress || isRolling
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
                <Icon name="dice" size={20} className="animate-spin" />
                <span className="truncate">{t('yahtzee.ui.rolling')}</span>
              </span>
            ) : (
              <span className="flex w-full items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <Icon name="dice" size={20} className="shrink-0" />
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
          </button>}
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
