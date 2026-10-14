import { captionText, describeStep, checkersSquareName } from '@/lib/replay/captions'
import type { ReplayContext, ReplayStep } from '@/lib/replay/types'

const ctx: ReplayContext = {
  seats: [
    { userId: 'ada', name: 'Ada', isBot: false, seat: 0 },
    { userId: 'robo', name: 'Robo', isBot: true, seat: 1 },
  ],
  playerNameById: new Map([['ada', 'Ada'], ['robo', 'Robo']]),
  viewerId: 'ada',
}

const step = (action: string, actorId: string | null, data: Record<string, unknown>, extra: Partial<ReplayStep> = {}): ReplayStep => ({
  index: 1,
  action,
  actionType: action,
  actorId,
  isBot: actorId === 'robo',
  payload: null,
  state: { status: 'playing', data },
  prevState: null,
  snapshotIds: ['s1'],
  kind: 'move',
  createdAt: '2026-10-13T10:00:01.000Z',
  ...extra,
})
const finished = (action: string, actorId: string | null, data: Record<string, unknown>) =>
  step(action, actorId, data, { state: { status: 'finished', data } })
const d = (gameType: string, s: ReplayStep) => describeStep(gameType, s, ctx)

describe('describeStep', () => {
  it('describes the common steps and never a raw action id', () => {
    expect(d('tic_tac_toe', step('game:start', null, {}, { kind: 'start' }))).toEqual({ key: 'profile.gameReplay.captions.common.gameStarted' })
    expect(d('checkers', step('respond-undo', 'robo', {}, { payload: { accept: false } }))).toEqual({
      key: 'profile.gameReplay.captions.common.undoDeclined',
      params: { player: 'Robo' },
    })
    expect(d('connect_four', step('timeout-forfeit', 'ada', {}))).toEqual({ key: 'profile.gameReplay.captions.common.forfeit', params: { player: 'Ada' } })
    expect(d('memory', step('flip', 'ada', {}))).toEqual({ key: 'profile.gameReplay.unknownAction' })
  })

  it('reads a Tic-Tac-Toe mark from the move history and names the round winner', () => {
    expect(d('tic_tac_toe', step('place', 'ada', { moveHistory: [{ symbol: 'X', row: 1, col: 2 }] }))).toEqual({
      key: 'profile.gameReplay.captions.ticTacToe.mark',
      params: { player: 'Ada', symbol: 'X', row: 2, col: 3 },
    })
    expect(d('tic_tac_toe', finished('place', 'robo', { winner: 'O', moveHistory: [] }))).toEqual({
      key: 'profile.gameReplay.captions.ticTacToe.winsRound',
      params: { player: 'Robo' },
    })
    expect(d('tic_tac_toe', finished('place', 'robo', { winner: 'draw', moveHistory: [] }))).toEqual({ key: 'profile.gameReplay.captions.ticTacToe.drawRound' })
  })

  it('names the Connect Four column from the payload and the winning disc', () => {
    expect(d('connect_four', step('drop', 'robo', {}, { payload: { col: 3 } }))).toEqual({
      key: 'profile.gameReplay.captions.connectFour.drop',
      params: { player: 'Robo', col: 4 },
    })
    expect(d('connect_four', finished('drop', 'ada', { winner: 1 }))).toEqual({ key: 'profile.gameReplay.captions.connectFour.winsRound', params: { player: 'Ada' } })
  })

  it('tells a Checkers move, jump and crowning apart by the last record', () => {
    const record = (path: [number, number][], captured: unknown[], promoted = false) => ({ moveHistory: [{ path, captured, promoted }] })
    expect(checkersSquareName([0, 0])).toBe('a8')
    expect(d('checkers', step('step', 'ada', record([[5, 0], [4, 1]], [])))).toEqual({
      key: 'profile.gameReplay.captions.checkers.move',
      params: { player: 'Ada', from: 'a3', to: 'b4' },
    })
    expect(d('checkers', step('step', 'ada', record([[5, 0], [3, 2], [1, 4]], [[4, 1], [2, 3]])))).toEqual({
      key: 'profile.gameReplay.captions.checkers.jump',
      params: { player: 'Ada', from: 'a3', to: 'e7', count: 2 },
    })
    expect(d('checkers', step('step', 'ada', record([[1, 2], [0, 3]], [], true)))).toEqual({
      key: 'profile.gameReplay.captions.checkers.crowned',
      params: { player: 'Ada', from: 'c7', to: 'd8' },
    })
    expect(d('checkers', finished('step', 'robo', { winner: 2, moveHistory: [] }))).toEqual({ key: 'profile.gameReplay.captions.checkers.wins', params: { player: 'Robo' } })
  })

  it('reads a Ludo step from its last event', () => {
    const ev = (kind: string, roll: number, extra = {}) => ({ events: [{ kind, roll, ...extra }], dice: roll })
    expect(d('ludo', step('roll', 'ada', ev('no-move', 2)))).toEqual({ key: 'profile.gameReplay.captions.ludo.rollNoMove', params: { player: 'Ada', roll: 2 } })
    const earlier = { events: [{ n: 4, kind: 'move', roll: 1 }] }
    expect(d('ludo', step('roll', 'ada', { ...earlier, dice: 6 }, { prevState: { data: earlier } }))).toEqual({
      key: 'profile.gameReplay.captions.ludo.roll',
      params: { player: 'Ada', roll: 6 },
    })
    expect(d('ludo', step('roll', 'ada', { events: [{ n: 5, kind: 'move', roll: 3 }], dice: null }, { prevState: { data: earlier } }))).toEqual({
      key: 'profile.gameReplay.captions.ludo.move',
      params: { player: 'Ada', roll: 3 },
    })
    expect(d('ludo', step('move', 'ada', ev('enter', 6)))).toEqual({ key: 'profile.gameReplay.captions.ludo.enter', params: { player: 'Ada' } })
    expect(d('ludo', step('move', 'robo', ev('capture', 4, { capturedPlayerIds: ['ada'] })))).toEqual({
      key: 'profile.gameReplay.captions.ludo.capture',
      params: { player: 'Robo', opponent: 'Ada' },
    })
    expect(d('ludo', finished('move', 'robo', { winnerId: 'robo', events: [] }))).toEqual({ key: 'profile.gameReplay.captions.ludo.wins', params: { player: 'Robo' } })
  })
  it('tells a Memory first card, a pair and a miss apart and names the winner', () => {
    const card = (id: string, value: string, isFlipped = false, isMatched = false) => ({ id, value, isFlipped, isMatched })
    const first = { cards: [card('a', 'A', true), card('b', 'B'), card('c', 'A')], flippedCardIds: ['a'], pendingMismatchCardIds: [] }
    expect(d('memory', step('flip', 'ada', first, { payload: { cardId: 'a' } }))).toEqual({
      key: 'profile.gameReplay.captions.memory.flip',
      params: { player: 'Ada', value: 'A' },
    })
    const pair = { cards: [card('a', 'A', true, true), card('b', 'B'), card('c', 'A', true, true)], flippedCardIds: [], pendingMismatchCardIds: [] }
    expect(d('memory', step('flip', 'robo', pair, { payload: { cardId: 'c' } }))).toEqual({
      key: 'profile.gameReplay.captions.memory.match',
      params: { player: 'Robo', value: 'A' },
    })
    const miss = { cards: [card('a', 'A', true), card('b', 'B', true), card('c', 'A')], flippedCardIds: ['a', 'b'], pendingMismatchCardIds: ['a', 'b'] }
    expect(d('memory', step('flip', 'ada', miss, { payload: { cardId: 'b' } }))).toEqual({
      key: 'profile.gameReplay.captions.memory.miss',
      params: { player: 'Ada', value: 'B' },
    })
    expect(d('memory', step('flip', 'ada', miss, { payload: null, prevState: { data: first } }))).toEqual({
      key: 'profile.gameReplay.captions.memory.miss',
      params: { player: 'Ada', value: 'B' },
    })
    expect(d('memory', step('flip', 'ada', first, { payload: { cardId: 'b' } }))).toEqual({
      key: 'profile.gameReplay.captions.memory.flip',
      params: { player: 'Ada', value: 'A' },
    })
    const all = { cards: [card('a', 'A', true, true), card('c', 'A', true, true)], winnerId: 'robo' }
    expect(d('memory', finished('flip', 'robo', all))).toEqual({ key: 'profile.gameReplay.captions.memory.wins', params: { player: 'Robo' } })
    expect(d('memory', finished('flip', 'robo', { ...all, winnerId: null }))).toEqual({ key: 'profile.gameReplay.captions.common.drawGame' })
    expect(d('memory', step('timeout-pass', 'ada', first))).toEqual({ key: 'profile.gameReplay.captions.common.timeout' })
  })
  it('reads a Yahtzee roll, a hold and a score, and names the category through its own key', () => {
    const dice = [3, 3, 5, 6, 1]
    expect(d('yahtzee', step('roll', 'ada', { dice, held: [false, false, false, false, false], rollsLeft: 2 }))).toEqual({
      key: 'profile.gameReplay.captions.yahtzee.roll',
      params: { player: 'Ada', dice: '3, 3, 5, 6, 1' },
    })
    expect(d('yahtzee', step('hold', 'ada', { dice, held: [true, true, false, false, false], rollsLeft: 2 }))).toEqual({
      key: 'profile.gameReplay.captions.yahtzee.hold',
      params: { player: 'Ada', dice: '3, 3' },
    })
    expect(d('yahtzee', step('hold', 'ada', { dice, held: [false, false, false, false, false], rollsLeft: 2 }))).toEqual({
      key: 'profile.gameReplay.captions.yahtzee.holdNone',
      params: { player: 'Ada' },
    })
    const scored = step('score', 'robo', { dice: [1, 1, 1, 1, 1], scores: [{}, { fullHouse: 25 }] }, {
      payload: { category: 'fullHouse' },
      state: { status: 'playing', players: [{ id: 'ada' }, { id: 'robo' }], data: { dice: [1, 1, 1, 1, 1], scores: [{}, { fullHouse: 25 }] } },
    })
    const caption = d('yahtzee', scored)
    expect(caption).toEqual({
      key: 'profile.gameReplay.captions.yahtzee.score',
      params: { player: 'Robo', points: 25 },
      paramKeys: { category: 'yahtzee.categories.fullHouse' },
    })
    const t = (key: string, params: Record<string, unknown> = {}) => `${key}${JSON.stringify(params)}`
    expect(captionText(caption, t)).toBe('profile.gameReplay.captions.yahtzee.score{"player":"Robo","points":25,"category":"yahtzee.categories.fullHouse{}"}')
    expect(d('yahtzee', finished('score', 'ada', { scores: [] }))).toEqual({ key: 'profile.gameReplay.captions.common.drawGame' })
    expect(d('yahtzee', { ...finished('score', 'ada', { scores: [] }), state: { status: 'finished', winner: 'robo', data: { scores: [] } } })).toEqual({
      key: 'profile.gameReplay.captions.yahtzee.wins',
      params: { player: 'Robo' },
    })
  })
})
