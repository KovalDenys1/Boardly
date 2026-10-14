import { useEffect, useRef, type CSSProperties } from 'react'
import { Icon } from '@/components/icons'
import { CHOICE_LABEL_KEY, Hand, WinPips, getChoiceIcon, type HandTone, type RPSPlayer } from '@/components/RockPaperScissorsGameBoard'
import { getGameMetadata } from '@/lib/game-catalog'
import type { RPSChoice, RPSRound } from '@/lib/games/rock-paper-scissors-game'
import { useTranslation } from '@/lib/i18n-helpers'
import { dataOf } from '@/lib/replay/group-steps'
import type { ReplayRendererProps } from './types'

const ACCENTS = [getGameMetadata('rock_paper_scissors')?.accentColor ?? 'var(--bd-coral)', 'var(--bd-lav)']

function isRound(value: unknown): value is RPSRound {
  const round = value as RPSRound | null
  return !!round && typeof round.choices === 'object' && round.choices !== null
}

const isChoice = (value: unknown): value is RPSChoice => value === 'rock' || value === 'paper' || value === 'scissors'

export default function RpsReplayRenderer({ step, seats, playerNameById }: ReplayRendererProps) {
  const { t } = useTranslation()
  const railRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (railRef.current) railRef.current.scrollLeft = railRef.current.scrollWidth
  }, [step.index])
  const data = dataOf(step.state)
  if (!data || !Array.isArray(data.rounds) || !data.rounds.every(isRound)) return null
  const rounds = data.rounds
  const before = dataOf(step.prevState)?.rounds
  const latest = rounds.length > (Array.isArray(before) ? before.length : 0) ? rounds[rounds.length - 1] : null
  const ready = Array.isArray(data.playersReady) ? (data.playersReady as string[]) : []
  const scores = data.scores && typeof data.scores === 'object' ? (data.scores as Record<string, unknown>) : {}
  const winsNeeded = data.mode === 'best-of-5' ? 3 : 2

  const players: RPSPlayer[] = seats.slice(0, 2).map((seat, index) => ({
    id: seat.userId,
    name: playerNameById.get(seat.userId) ?? seat.name,
    accent: ACCENTS[index],
  }))
  const scoreOf = (player: RPSPlayer | undefined) => (player && typeof scores[player.id] === 'number' ? (scores[player.id] as number) : 0)
  const choiceName = (choice: unknown) => (isChoice(choice) ? t(CHOICE_LABEL_KEY[choice]) : '?')

  const handFor = (player: RPSPlayer): { icon: ReturnType<typeof getChoiceIcon>; state: string; tone: HandTone; label: string } => {
    if (latest) {
      const choice = latest.choices[player.id]
      const draw = latest.winner === 'draw'
      const won = latest.winner === player.id
      const state = draw ? t('lobby.game.draw') : won ? t('lobby.game.win') : t('lobby.game.loss')
      return { icon: getChoiceIcon(isChoice(choice) ? choice : null), state, tone: draw ? 'draw' : won ? 'win' : 'loss', label: `${player.name}: ${choiceName(choice)}, ${state}` }
    }
    const state = ready.includes(player.id) ? t('games.rock_paper_scissors.lockedIn') : t('games.rock_paper_scissors.choosing')
    return { icon: 'rock', state, tone: ready.includes(player.id) ? 'locked' : 'choosing', label: `${player.name}: ${state}` }
  }

  const [left, right] = players
  const hand = (player: RPSPlayer | undefined, seat: number) => {
    if (!player) return <div />
    const { label, ...props } = handFor(player)
    return (
      <div className="rps-replay-hand" role="img" aria-label={label} data-testid={`rps-replay-hand-${player.name}`} data-seat={seat}>
        <Hand key={`${seat}-${rounds.length}`} player={player} accent={player.accent ?? ACCENTS[seat]} reveal={!!latest} {...props} />
      </div>
    )
  }

  return (
    <div className="rps-replay">
      <div className="rps-board">
        <section className={`rps-stage${latest ? ' rps-stage--reveal' : ''}`}>
          {hand(left, 0)}
          <div className="rps-stage__center">
            <span className="rps-stage__vs">{t('game.ui.vs')}</span>
            <span className="rps-stage__score" data-testid="rps-replay-score">
              {scoreOf(left)}
              <span className="rps-stage__colon">:</span>
              {scoreOf(right)}
            </span>
            <span className="rps-stage__pips">
              <span data-seat="0"><WinPips filled={scoreOf(left)} total={winsNeeded} color={ACCENTS[0]} /></span>
              <span className="rps-stage__dot" aria-hidden>·</span>
              <span data-seat="1"><WinPips filled={scoreOf(right)} total={winsNeeded} color={ACCENTS[1]} /></span>
            </span>
          </div>
          {hand(right, 1)}
        </section>
      </div>
      <ol ref={railRef} className="rps-replay-rounds" aria-label={t('games.rock_paper_scissors.replay.rounds')}>
        {rounds.map((round, index) => {
          const winner = players.findIndex((player) => player.id === round.winner)
          return (
            <li
              key={index}
              className="rps-replay-round"
              aria-current={latest && index === rounds.length - 1 ? 'step' : undefined}
              aria-label={t('games.rock_paper_scissors.replay.roundItem', {
                num: index + 1,
                left: choiceName(left && round.choices[left.id]),
                right: choiceName(right && round.choices[right.id]),
              })}
              style={{ '--round-accent': winner >= 0 ? ACCENTS[winner] : 'var(--bd-line)' } as CSSProperties}
            >
              <span className="rps-replay-round__num">#{index + 1}</span>
              <Icon name={getChoiceIcon(left && isChoice(round.choices[left.id]) ? round.choices[left.id] : null)} size={16} />
              <Icon name={getChoiceIcon(right && isChoice(round.choices[right.id]) ? round.choices[right.id] : null)} size={16} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
