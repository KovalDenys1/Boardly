import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import DiceGroup from '@/components/DiceGroup'
import CelebrationBanner from '@/components/CelebrationBanner'
import { YahtzeeCategory } from '@/lib/yahtzee'
import { CelebrationEvent } from '@/lib/celebrations'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { sounds } from '@/lib/sounds'
import type { Game } from '@/types/game'
import type { ReactNode } from 'react'

interface GameBoardProps {
  gameEngine: YahtzeeGame
  game: Game
  isMyTurn: boolean
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
  isSpectator?: boolean
  /**
   * The shared GameStatusBanner (round, whose turn, a one-line hint, the
   * timer), built by the page (#1187). It replaces this column's own timer
   * pill and Next Move card, which said the same things in English only.
   */
  statusBanner?: ReactNode
}

export default function GameBoard({
  gameEngine,
  game,
  isMyTurn,
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
  isSpectator = false,
  statusBanner,
}: GameBoardProps) {
  const { t } = useTranslation()
  const rollsLeft = gameEngine.getRollsLeft()
  const activeHeld = isMyTurn ? held : gameEngine.getHeld()
  const heldCount = activeHeld.filter(Boolean).length
  const rollButtonLabel = rollsLeft === 3
    ? t('yahtzee.ui.rollDice')
    : rollsLeft === 0
      ? t('yahtzee.ui.noRollsLeft')
      : t('yahtzee.ui.rollWithCount', { count: rollsLeft })

  return (
    // justify-center, not stretch (#903): the card below hugs its content, so
    // the height it no longer takes is page padding above and below it rather
    // than empty card. Centring is safe because the card shrinks before it
    // overflows - `flex: 0 1 auto` plus min-h-0 plus its own scroll.
    <div className="h-full flex flex-col justify-center gap-3">
      {statusBanner && <div className="flex-shrink-0">{statusBanner}</div>}
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
        {/* Dice — min-h floor keeps this from being crushed to overlapping
            size when iOS Safari's address-bar toggle momentarily shrinks
            the resolved 100dvh of the fixed game viewport (see
            LobbyPageClient.tsx's scroll-lock comment for the same class of
            bug). It is a floor and nothing else now: `flex-1` here made this
            box absorb whatever the card was given, which is how a 112px strip
            of dice ended up centred in 557px of it (#903). */}
        <div className="min-h-[190px]">
          <DiceGroup
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
              <span className="flex w-full items-center justify-center gap-1.5 sm:gap-2 min-w-0">
                <Icon name="dice" size={20} className="shrink-0" />
                <span className="truncate">{rollButtonLabel}</span>
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
