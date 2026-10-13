import type { CSSProperties } from 'react'
import { BoardToken, COLOR_FILL, DieFace, LudoBoard } from '@/components/boards/LudoBoard'
import { LUDO_COLORS, LUDO_FINISH, LUDO_YARD, type LudoColor } from '@/lib/games/ludo-game'
import { ludoRingKey } from '@/lib/games/ludo-motion'
import { useTranslation } from '@/lib/i18n-helpers'
import type { ReplayRendererProps } from './types'

type Seat = { playerId: string; color: LudoColor }
type LastMove = { playerId: string; token: number; from: number; to: number }

const noop = () => {}

const DIE_CORNER: Record<LudoColor, CSSProperties> = {
  red: { top: 3, left: 3 },
  green: { top: 3, right: 3 },
  yellow: { bottom: 3, right: 3 },
  blue: { bottom: 3, left: 3 },
}

function isSeat(value: unknown): value is Seat {
  const seat = value as Seat | null
  return !!seat && typeof seat.playerId === 'string' && LUDO_COLORS.includes(seat.color)
}

function isLastMove(value: unknown): value is LastMove {
  const move = value as LastMove | null
  return !!move && typeof move.playerId === 'string' && [move.token, move.from, move.to].every(Number.isInteger)
}

export default function LudoReplayRenderer({ step, isFinalStep, playerNameById }: ReplayRendererProps) {
  const { t } = useTranslation()

  const state = step.state as { status?: unknown; data?: unknown } | null
  if (!state || typeof state !== 'object') return null
  const data = state.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return null
  const tokensById = data.tokens as Record<string, unknown> | null
  if (!Array.isArray(data.seats) || !data.seats.every(isSeat) || !tokensById || typeof tokensById !== 'object') return null
  const seats = data.seats

  const tokens: BoardToken[] = seats.flatMap((seat) => {
    const positions = tokensById[seat.playerId]
    return (Array.isArray(positions) ? positions : [])
      .map((position, token) => ({ playerId: seat.playerId, color: seat.color, token, position, selectable: false, isMine: false }))
      .filter((token) => Number.isInteger(token.position) && token.position >= LUDO_YARD && token.position <= LUDO_FINISH)
  })

  const lastMove = isLastMove(data.lastMove) ? data.lastMove : null
  const lastRoll = data.lastRoll as { playerId?: unknown; value?: unknown } | null
  const rollValue = typeof lastRoll?.value === 'number' && lastRoll.value >= 1 && lastRoll.value <= 6 ? lastRoll.value : null
  const rollColor = seats.find((seat) => seat.playerId === lastRoll?.playerId)?.color ?? null
  const nameOf = (id: unknown) => (typeof id === 'string' ? (playerNameById.get(id) ?? '') : '')

  const winnerId = isFinalStep && state.status === 'finished' && typeof data.winnerId === 'string' ? data.winnerId : null
  const colorName = (color: LudoColor) => t(`games.ludo.colors.${color}`)

  return (
    <div
      className="ttt-board-surface ludo-board-surface"
      role="group"
      aria-label={winnerId ? t('profile.gameReplay.captions.ludo.wins', { player: nameOf(winnerId) }) : undefined}
      data-testid="ludo-replay"
      data-winner-id={winnerId ?? undefined}
    >
      <LudoBoard
        tokens={tokens}
        activeColors={seats.map((seat) => seat.color)}
        onTokenClick={noop}
        lastMovedKey={lastMove ? `${lastMove.playerId}-${lastMove.token}` : null}
        lastMoveRingKey={ludoRingKey(lastMove)}
        motion={null}
        tokenLabel={(token) => t('games.ludo.game.tokenLabel', { color: colorName(token.color), number: token.token + 1 })}
        boardLabel={t('games.ludo.game.boardLabel')}
      />
      {rollValue !== null && rollColor && (
        <span className="ludo-replay-die" style={DIE_CORNER[rollColor]} data-testid="ludo-replay-die" data-value={rollValue}>
          <DieFace
            value={rollValue}
            size={36}
            color={COLOR_FILL[rollColor]}
            label={t('games.ludo.game.lastRollLabel', { player: nameOf(lastRoll?.playerId), value: rollValue })}
          />
        </span>
      )}
    </div>
  )
}
