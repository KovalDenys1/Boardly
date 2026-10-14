import { dataOf } from './group-steps'
import type { TranslationKeys } from '@/lib/i18n-helpers'
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

type MemoryCardLike = { id: string; value: string; isFlipped: boolean; isMatched: boolean }

function memoryCards(state: unknown): MemoryCardLike[] | null {
  const cards = dataOf(state)?.cards
  return Array.isArray(cards) && cards.every((c) => c && typeof (c as MemoryCardLike).id === 'string') ? (cards as MemoryCardLike[]) : null
}

/** The card this flip turned: the payload's id when it is face up, else the one face up now that was face down before. */
export function memoryFlippedCardId(step: ReplayStep): string | null {
  const cards = memoryCards(step.state)
  if (!cards) return null
  const shown = (c: MemoryCardLike) => c.isFlipped || c.isMatched
  const fromPayload = (step.payload as { cardId?: unknown } | null)?.cardId
  if (typeof fromPayload === 'string' && cards.some((c) => c.id === fromPayload && shown(c))) return fromPayload
  const before = new Set((memoryCards(step.prevState) ?? []).filter(shown).map((c) => c.id))
  const fresh = cards.filter((c) => shown(c) && !before.has(c.id))
  return fresh.length > 0 ? fresh[fresh.length - 1].id : null
}

const memory: CaptionTable = (step, ctx): ReplayCaption | null => {
  const data = dataOf(step.state)
  if (!data || step.action !== 'flip') return null
  if (isFinished(step)) {
    return typeof data.winnerId === 'string'
      ? { key: 'profile.gameReplay.captions.memory.wins', params: { player: nameOf(ctx, data.winnerId) } }
      : { key: 'profile.gameReplay.captions.common.drawGame' }
  }
  const id = memoryFlippedCardId(step)
  const card = id ? memoryCards(step.state)?.find((c) => c.id === id) : undefined
  if (!card) return null
  const params = { player: nameOf(ctx, step.actorId), value: card.value }
  if (card.isMatched) return { key: 'profile.gameReplay.captions.memory.match', params }
  const pending = data.pendingMismatchCardIds
  if (Array.isArray(pending) && pending.includes(card.id)) return { key: 'profile.gameReplay.captions.memory.miss', params }
  return { key: 'profile.gameReplay.captions.memory.flip', params }
}

const YAHTZEE_CATEGORIES = new Set([
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'onePair', 'twoPairs', 'threeOfKind',
  'fourOfKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance',
])

const yahtzee: CaptionTable = (step, ctx): ReplayCaption | null => {
  const data = dataOf(step.state)
  if (!data) return null
  const player = nameOf(ctx, step.actorId)
  if (isFinished(step)) {
    const winner = (step.state as { winner?: unknown }).winner
    return typeof winner === 'string'
      ? { key: 'profile.gameReplay.captions.yahtzee.wins', params: { player: nameOf(ctx, winner) } }
      : { key: 'profile.gameReplay.captions.common.drawGame' }
  }
  const dice = Array.isArray(data.dice) ? (data.dice as number[]) : []
  const held = Array.isArray(data.held) ? (data.held as boolean[]) : []
  switch (step.action) {
    case 'roll':
      return { key: 'profile.gameReplay.captions.yahtzee.roll', params: { player, dice: dice.join(', ') } }
    case 'hold': {
      const kept = dice.filter((_, index) => held[index])
      return kept.length > 0
        ? { key: 'profile.gameReplay.captions.yahtzee.hold', params: { player, dice: kept.join(', ') } }
        : { key: 'profile.gameReplay.captions.yahtzee.holdNone', params: { player } }
    }
    case 'score': {
      const category = (step.payload as { category?: unknown } | null)?.category
      if (typeof category !== 'string' || !YAHTZEE_CATEGORIES.has(category)) return null
      const players = (step.state as { players?: Array<{ id?: unknown }> }).players ?? []
      const seat = players.findIndex((p) => p?.id === step.actorId)
      const card = Array.isArray(data.scores) ? (data.scores[seat] as Record<string, unknown> | undefined) : undefined
      const points = typeof card?.[category] === 'number' ? (card[category] as number) : 0
      return {
        key: 'profile.gameReplay.captions.yahtzee.score',
        params: { player, points },
        paramKeys: { category: `yahtzee.categories.${category}` as TranslationKeys },
      }
    }
    default:
      return null
  }
}

const RPS_CHOICES = new Set(['rock', 'paper', 'scissors'])
const choiceKey = (choice: string) => `lobby.choice.${choice}` as TranslationKeys

const rockPaperScissors: CaptionTable = (step, ctx): ReplayCaption | null => {
  const data = dataOf(step.state)
  if (!data || step.action !== 'submit-choice' || !Array.isArray(data.rounds)) return null
  const before = dataOf(step.prevState)?.rounds
  const fresh = data.rounds.length > (Array.isArray(before) ? before.length : 0)
  const round = fresh ? (data.rounds.at(-1) as { choices?: Record<string, unknown>; winner?: unknown } | undefined) : undefined
  if (!round) return { key: 'profile.gameReplay.captions.rockPaperScissors.locked', params: { player: nameOf(ctx, step.actorId) } }
  const choices = Object.entries(round.choices ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && RPS_CHOICES.has(entry[1]))
  if (round.winner === 'draw' && choices.length > 0) {
    return { key: 'profile.gameReplay.captions.rockPaperScissors.draw', paramKeys: { choice: choiceKey(choices[0][1]) } }
  }
  const winning = choices.find(([id]) => id === round.winner)
  const losing = choices.find(([id]) => id !== round.winner)
  if (!winning || !losing) return null
  return {
    key: isFinished(step) ? 'profile.gameReplay.captions.rockPaperScissors.wins' : 'profile.gameReplay.captions.rockPaperScissors.round',
    params: { player: nameOf(ctx, winning[0]) },
    paramKeys: { winning: choiceKey(winning[1]), losing: choiceKey(losing[1]) },
  }
}

const TABLES: Record<string, CaptionTable> = {
  tic_tac_toe: ticTacToe,
  connect_four: connectFour,
  checkers,
  ludo,
  memory,
  yahtzee,
  rock_paper_scissors: rockPaperScissors,
}

/** The one line under the board for a step; never a humanised action id. */
export function describeStep(gameType: string, step: ReplayStep, ctx: ReplayContext): ReplayCaption {
  return (
    TABLES[gameType]?.(step, ctx) ??
    common(step, ctx) ??
    { key: 'profile.gameReplay.unknownAction' }
  )
}

/** The caption as text, with any param that is a locale key translated first. */
export function captionText(caption: ReplayCaption, t: (key: TranslationKeys, params?: Record<string, unknown>) => string): string {
  if (!caption.paramKeys) return t(caption.key, caption.params)
  const translated = Object.fromEntries(Object.entries(caption.paramKeys).map(([name, key]) => [name, t(key)]))
  return t(caption.key, { ...caption.params, ...translated })
}
