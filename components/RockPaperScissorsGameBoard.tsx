'use client'

import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon, type IconName } from '@/components/icons'
import { RockPaperScissorsGameData, RPSChoice } from '@/lib/games/rock-paper-scissors-game'

type TFn = ReturnType<typeof useTranslation>['t']

/**
 * The Rock Paper Scissors board, composed as a duel (#870, layout DoD):
 *
 *   ┌──────── stage ────────┐   two hands in the players' colours, with
 *   │  hand  1:0  hand      │   "choosing / locked in", the match score and
 *   │  Denys  ●○·○○  Pattern│   round pips between them, and the reveal of
 *   ├──────── tiles ────────┤   the latest round played as a shake-and-flip;
 *   │  rock  paper  sciss.  │   three same-sized choice tiles.
 *   └───────────────────────┘
 *
 * Scoreboard, status line, result overlay, history and chat are the shared
 * game-chrome kit, composed by the page. Every size here comes from one
 * scale (`.rps-*` in globals.css). Animations are transform/opacity only.
 */

export interface RPSPlayer {
  id: string
  name: string
  avatarSrc?: string | null
  /** CSS colour for this seat (the header uses coral for the left seat, lavender for the right). */
  accent?: string
}

interface RockPaperScissorsGameBoardProps {
  gameData: RockPaperScissorsGameData
  /** Empty string for spectators. */
  playerId: string
  players: RPSPlayer[]
  onSubmitChoice: (choice: RPSChoice) => Promise<void>
  disabled?: boolean
  isSubmitting?: boolean
  isSpectator?: boolean
  testId?: string
}

const CHOICES: { choice: RPSChoice; icon: IconName; labelKey: TranslationKeys; beats: RPSChoice; accent: string }[] = [
  { choice: 'rock', icon: 'rock', labelKey: 'lobby.choice.rock', beats: 'scissors', accent: 'var(--bd-lav)' },
  { choice: 'paper', icon: 'paper', labelKey: 'lobby.choice.paper', beats: 'rock', accent: 'var(--bd-sky)' },
  { choice: 'scissors', icon: 'scissors', labelKey: 'lobby.choice.scissors', beats: 'paper', accent: 'var(--bd-coral)' },
]

export const CHOICE_LABEL_KEY: Record<RPSChoice, TranslationKeys> = {
  rock: 'lobby.choice.rock',
  paper: 'lobby.choice.paper',
  scissors: 'lobby.choice.scissors',
}

export function getChoiceIcon(choice: RPSChoice | null | undefined): IconName {
  if (!choice) return 'question'
  return CHOICES.find((entry) => entry.choice === choice)?.icon ?? 'question'
}

export function WinPips({ filled, total, color = 'var(--bd-mint-deep)' }: { filled: number; total: number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-label={`${filled}/${total}`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            border: `2px solid ${index < filled ? color : 'var(--bd-line)'}`,
            background: index < filled ? color : 'transparent',
            transition: 'background 0.2s, border-color 0.2s',
          }}
        />
      ))}
    </span>
  )
}

type HandTone = 'idle' | 'choosing' | 'locked' | 'win' | 'loss' | 'draw'

export default function RockPaperScissorsGameBoard({
  gameData,
  playerId,
  players,
  onSubmitChoice,
  disabled = false,
  isSubmitting = false,
  isSpectator = false,
  testId,
}: RockPaperScissorsGameBoardProps) {
  const { t } = useTranslation()

  // Seat the viewer on the left; a spectator sees the roster order.
  const me = players.find((player) => player.id === playerId) ?? null
  const leftPlayer = me ?? players[0] ?? null
  const rightPlayer = players.find((player) => player.id !== leftPlayer?.id) ?? null
  const leftAccent = leftPlayer?.accent ?? 'var(--bd-coral)'
  const rightAccent = rightPlayer?.accent ?? 'var(--bd-lav)'

  const isGameOver = !!gameData.gameWinner
  const latestRound = gameData.rounds[gameData.rounds.length - 1] ?? null
  const readyIds = gameData.playersReady
  const roundInProgress = readyIds.length > 0
  const mySubmitted = !!playerId && readyIds.includes(playerId)
  const myCurrentChoice = playerId ? ((gameData.playerChoices[playerId] as RPSChoice | null | undefined) ?? null) : null
  const canChoose = !isSpectator && !disabled && !isSubmitting && !mySubmitted && !isGameOver && players.length >= 2
  // Between rounds the stage replays the reveal; once anyone picks again it
  // turns back into two hands choosing.
  const showReveal = !!latestRound && (!roundInProgress || isGameOver)
  const winsNeeded = gameData.mode === 'best-of-5' ? 3 : 2
  const leftScore = leftPlayer ? gameData.scores[leftPlayer.id] ?? 0 : 0
  const rightScore = rightPlayer ? gameData.scores[rightPlayer.id] ?? 0 : 0
  const roundNumber = gameData.rounds.length + (isGameOver ? 0 : 1)

  const handFor = (player: RPSPlayer | null): { icon: IconName; state: string; tone: HandTone } => {
    if (!player) return { icon: 'question', state: '', tone: 'idle' }
    const isMe = player.id === playerId
    if (showReveal && latestRound) {
      const choice = (latestRound.choices?.[player.id] as RPSChoice | undefined) ?? null
      const won = latestRound.winner === player.id
      const draw = latestRound.winner === 'draw'
      return {
        icon: getChoiceIcon(choice),
        state: draw ? t('lobby.game.draw') : won ? t('lobby.game.win') : t('lobby.game.loss'),
        tone: draw ? 'draw' : won ? 'win' : 'loss',
      }
    }
    const locked = readyIds.includes(player.id)
    if (isMe && locked) return { icon: getChoiceIcon(myCurrentChoice), state: t('games.rock_paper_scissors.lockedIn'), tone: 'locked' }
    if (locked) return { icon: 'rock', state: t('games.rock_paper_scissors.lockedIn'), tone: 'locked' }
    return { icon: 'rock', state: t('games.rock_paper_scissors.choosing'), tone: 'choosing' }
  }

  const stageResult = showReveal && latestRound
    ? latestRound.winner === 'draw'
      ? t('games.rock_paper_scissors.roundDraw')
      : t('games.rock_paper_scissors.roundWonBy', { player: players.find((p) => p.id === latestRound.winner)?.name ?? t('game.ui.playerFallback') })
    : t('games.rock_paper_scissors.roundNum', { num: roundNumber })

  // A new round result remounts the hands, which replays the shake-and-flip.
  const revealKey = showReveal ? `reveal-${gameData.rounds.length}` : `live-${gameData.rounds.length}-${readyIds.length}`

  return (
    <div className="rps-board" data-testid={testId}>
      <section className={`rps-stage${showReveal ? ' rps-stage--reveal' : ''}`} aria-live="polite">
        <Hand key={`l-${revealKey}`} player={leftPlayer} accent={leftAccent} reveal={showReveal} {...handFor(leftPlayer)} />
        <div className="rps-stage__center">
          <span className="rps-stage__vs">{t('game.ui.vs')}</span>
          <span key={`s-${leftScore}-${rightScore}`} className="rps-stage__score">
            {leftScore}<span className="rps-stage__colon">:</span>{rightScore}
          </span>
          <span className="rps-stage__pips" aria-hidden>
            <WinPips filled={leftScore} total={winsNeeded} color={leftAccent} />
            <span className="rps-stage__dot">·</span>
            <WinPips filled={rightScore} total={winsNeeded} color={rightAccent} />
          </span>
          <span key={`r-${revealKey}`} className={`rps-stage__result${showReveal ? ' rps-stage__result--reveal' : ''}`}>{stageResult}</span>
        </div>
        <Hand key={`r-${revealKey}`} player={rightPlayer} accent={rightAccent} reveal={showReveal} {...handFor(rightPlayer)} />
      </section>

      {!isGameOver && !isSpectator && (
        <section className="rps-tiles" aria-label={t('games.rock_paper_scissors.pickPrompt')}>
          {CHOICES.map(({ choice, icon, labelKey, beats, accent }, index) => {
            const isSelected = myCurrentChoice === choice && mySubmitted
            const dimmed = mySubmitted && !isSelected
            return (
              <button
                key={choice}
                type="button"
                onClick={() => void onSubmitChoice(choice)}
                disabled={!canChoose}
                aria-pressed={isSelected}
                aria-label={t(labelKey)}
                className={`rps-tile${isSelected ? ' rps-tile--selected' : ''}${dimmed ? ' rps-tile--dimmed' : ''}`}
                style={{ '--i': index, '--tile-accent': accent } as React.CSSProperties}
              >
                <span className="rps-tile__emoji"><Icon name={icon} size={40} /></span>
                <span className="rps-tile__label">{t(labelKey)}</span>
                <span className="rps-tile__beats">{t('games.rock_paper_scissors.beats', { target: t(CHOICE_LABEL_KEY[beats]) })}</span>
              </button>
            )
          })}
        </section>
      )}
    </div>
  )
}

function Hand({ player, accent, icon, state, tone, reveal }: { player: RPSPlayer | null; accent: string; icon: IconName; state: string; tone: HandTone; reveal: boolean }) {
  const initial = (player?.name ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <div className={`rps-hand rps-hand--${tone}${reveal ? ' rps-hand--reveal' : ''}`} style={{ '--hand-accent': accent } as React.CSSProperties}>
      <span className="rps-hand__emoji" aria-hidden><Icon name={icon} size={44} /></span>
      <span className="rps-hand__who">
        {player?.avatarSrc
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={player.avatarSrc} alt="" className="rps-hand__avatar" />
          : <span className="rps-hand__avatar rps-hand__avatar--initial">{initial}</span>}
        <span className="rps-hand__name">{player?.name ?? '—'}</span>
      </span>
      <span className="rps-hand__state">{state}</span>
    </div>
  )
}
