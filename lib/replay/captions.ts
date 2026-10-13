import { dataOf } from './group-steps'
import type { ReplayCaption, ReplayContext, ReplayStep } from './types'

export type CaptionTable = (step: ReplayStep, ctx: ReplayContext) => ReplayCaption | null

export function nameOf(ctx: ReplayContext, id: string | null | undefined): string {
  if (!id) return ''
  return ctx.playerNameById.get(id) ?? ctx.seats.find((seat) => seat.userId === id)?.name ?? id
}

export function seatName(ctx: ReplayContext, seat: number): string {
  const player = ctx.seats[seat]
  return player ? nameOf(ctx, player.userId) : ''
}

export function isFinished(step: ReplayStep): boolean {
  return (step.state as { status?: unknown } | null)?.status === 'finished'
}

const common: CaptionTable = (step, ctx): ReplayCaption | null => {
  const player = nameOf(ctx, step.actorId)
  const accepted = (step.payload as { accept?: unknown } | null)?.accept === true
  switch (step.action) {
    case 'game:start':
      return { key: 'profile.gameReplay.captions.common.gameStarted' }
    case 'game:final-state':
      return { key: 'profile.gameReplay.captions.common.gameFinished' }
    case 'next-round':
      return { key: 'profile.gameReplay.captions.common.nextRound', params: { player } }
    case 'request-undo':
      return { key: 'profile.gameReplay.captions.common.undoRequested', params: { player } }
    case 'respond-undo':
      return { key: accepted ? 'profile.gameReplay.captions.common.undoAccepted' : 'profile.gameReplay.captions.common.undoDeclined', params: { player } }
    case 'request-draw':
      return { key: 'profile.gameReplay.captions.common.drawRequested', params: { player } }
    case 'respond-draw':
      return { key: accepted ? 'profile.gameReplay.captions.common.drawAccepted' : 'profile.gameReplay.captions.common.drawDeclined', params: { player } }
    case 'timeout-forfeit':
      return { key: 'profile.gameReplay.captions.common.forfeit', params: { player } }
    default:
      return step.action.includes('timeout') ? { key: 'profile.gameReplay.captions.common.timeout' } : null
  }
}

const roundEnd = (step: ReplayStep, ctx: ReplayContext, winnerSeat: number | null, game: 'ticTacToe' | 'connectFour'): ReplayCaption | null => {
  if (!isFinished(step)) return null
  if (winnerSeat === null) return { key: `profile.gameReplay.captions.${game}.drawRound` }
  return { key: `profile.gameReplay.captions.${game}.winsRound`, params: { player: seatName(ctx, winnerSeat) } }
}

const ticTacToe: CaptionTable = (step, ctx): ReplayCaption | null => {
  const data = dataOf(step.state)
  if (!data || step.action !== 'place') return null
  const winner = data.winner
  const ended = roundEnd(step, ctx, winner === 'X' ? 0 : winner === 'O' ? 1 : null, 'ticTacToe')
  if (ended) return ended
  const last = (data.moveHistory as Array<{ symbol?: string; row?: number; col?: number }> | undefined)?.at(-1)
  if (!last) return null
  return {
    key: 'profile.gameReplay.captions.ticTacToe.mark',
    params: { player: nameOf(ctx, step.actorId), symbol: last.symbol ?? '', row: (last.row ?? 0) + 1, col: (last.col ?? 0) + 1 },
  }
}

const connectFour: CaptionTable = (step, ctx): ReplayCaption | null => {
  const data = dataOf(step.state)
  if (!data || step.action !== 'drop') return null
  const winner = data.winner
  const ended = roundEnd(step, ctx, winner === 1 ? 0 : winner === 2 ? 1 : null, 'connectFour')
  if (ended) return ended
  const col = (step.payload as { col?: number } | null)?.col ?? (data.lastDroppedCol as number | undefined)
  return { key: 'profile.gameReplay.captions.connectFour.drop', params: { player: nameOf(ctx, step.actorId), col: (col ?? 0) + 1 } }
}

const FILES = 'abcdefgh'
export function checkersSquareName([row, col]: [number, number]): string {
  return `${FILES[col] ?? '?'}${8 - row}`
}

const checkers: CaptionTable = (step, ctx): ReplayCaption | null => {
  const data = dataOf(step.state)
  if (!data || step.action !== 'step') return null
  const player = nameOf(ctx, step.actorId)
  const record = (data.moveHistory as Array<{ path: [number, number][]; captured: unknown[]; promoted: boolean }> | undefined)?.at(-1)
  if (isFinished(step)) {
    const winner = data.winner
    if (winner === 1 || winner === 2) return { key: 'profile.gameReplay.captions.checkers.wins', params: { player: seatName(ctx, winner - 1) } }
    return { key: 'profile.gameReplay.captions.common.drawGame' }
  }
  if (!record || record.path.length < 2) return null
  const params = { player, from: checkersSquareName(record.path[0]), to: checkersSquareName(record.path[record.path.length - 1]) }
  if (record.promoted) return { key: 'profile.gameReplay.captions.checkers.crowned', params }
  if (record.captured.length > 0) return { key: 'profile.gameReplay.captions.checkers.jump', params: { ...params, count: record.captured.length } }
  return { key: 'profile.gameReplay.captions.checkers.move', params }
}

type LudoEventLike = { n?: number; kind: string; roll: number; capturedPlayerIds?: string[] }

function lastLudoEvent(state: unknown): LudoEventLike | undefined {
  return (dataOf(state)?.events as LudoEventLike[] | undefined)?.at(-1)
}

/** The event this step logged, or null when the newest one is left over from an earlier step. */
function ludoEventOf(step: ReplayStep): LudoEventLike | null {
  const event = lastLudoEvent(step.state)
  if (!event) return null
  const before = lastLudoEvent(step.prevState)
  return before && before.n !== undefined && before.n === event.n ? null : event
}

const ludo: CaptionTable = (step, ctx): ReplayCaption | null => {
  const data = dataOf(step.state)
  if (!data || (step.action !== 'roll' && step.action !== 'move' && step.action !== 'timeout')) return null
  const player = nameOf(ctx, step.actorId)
  if (isFinished(step) && typeof data.winnerId === 'string') {
    return { key: 'profile.gameReplay.captions.ludo.wins', params: { player: nameOf(ctx, data.winnerId) } }
  }
  const event = ludoEventOf(step)
  const roll = event?.roll ?? (data.dice as number | undefined) ?? (data.lastRoll as { value?: number } | null | undefined)?.value ?? 0
  if (step.action === 'roll' || step.action === 'timeout') {
    if (event?.kind === 'no-move') return { key: 'profile.gameReplay.captions.ludo.rollNoMove', params: { player, roll } }
    if (event?.kind === 'triple-six') return { key: 'profile.gameReplay.captions.ludo.tripleSix', params: { player } }
    if (step.action === 'roll' && !event) return { key: 'profile.gameReplay.captions.ludo.roll', params: { player, roll } }
  }
  switch (event?.kind) {
    case 'enter':
      return { key: 'profile.gameReplay.captions.ludo.enter', params: { player } }
    case 'capture':
      return { key: 'profile.gameReplay.captions.ludo.capture', params: { player, opponent: nameOf(ctx, event.capturedPlayerIds?.[0]) } }
    case 'home':
      return { key: 'profile.gameReplay.captions.ludo.home', params: { player } }
    case 'move':
      return { key: 'profile.gameReplay.captions.ludo.move', params: { player, roll } }
    default:
      return null
  }
}

const TABLES: Record<string, CaptionTable> = {
  tic_tac_toe: ticTacToe,
  connect_four: connectFour,
  checkers,
  ludo,
}

/** The one line under the board for a step; never a humanised action id. */
export function describeStep(gameType: string, step: ReplayStep, ctx: ReplayContext): ReplayCaption {
  return (
    TABLES[gameType]?.(step, ctx) ??
    common(step, ctx) ??
    { key: 'profile.gameReplay.unknownAction' }
  )
}
