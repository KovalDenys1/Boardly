import { describeStep, checkersSquareName } from '@/lib/replay/captions'
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
})
