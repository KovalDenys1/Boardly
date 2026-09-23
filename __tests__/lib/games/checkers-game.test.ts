import { Move } from '@/lib/game-engine'
import {
  BOARD_SIZE,
  CheckersCell,
  CheckersGame,
  CheckersGameData,
  DRAW_PLY_LIMIT,
  Side,
  Square,
  applyTurn,
  generateTurns,
  getForcedCapturePieces,
  isDarkSquare,
} from '@/lib/games/checkers-game'

const step = (playerId: string, from: Square, to: Square): Move => ({
  playerId,
  type: 'step',
  data: { from, to },
  timestamp: new Date(),
})

const getData = (g: CheckersGame): CheckersGameData => g.getState().data as CheckersGameData

const makeReadyGame = (): CheckersGame => {
  const g = new CheckersGame('ck-test')
  g.addPlayer({ id: 'p1', name: 'Dark' })
  g.addPlayer({ id: 'p2', name: 'Light' })
  g.startGame()
  return g
}

const emptyBoard = (): CheckersCell[][] =>
  Array.from({ length: BOARD_SIZE }, () => Array<CheckersCell>(BOARD_SIZE).fill(0))

/** Put a custom position on the board with `side` to move. */
const setPosition = (g: CheckersGame, pieces: Array<[number, number, CheckersCell]>, side: Side) => {
  const board = emptyBoard()
  for (const [r, c, v] of pieces) board[r][c] = v
  // getState() is a shallow copy, so the turn index goes back in through restoreState.
  const state = g.getState()
  g.restoreState({
    ...state,
    currentPlayerIndex: side - 1,
    data: { ...(state.data as CheckersGameData), board, currentSide: side },
  })
}

describe('CheckersGame', () => {
  describe('initial position', () => {
    it('puts twelve men a side on the dark squares, side 1 to move', () => {
      const data = getData(new CheckersGame('ck-init'))
      let ones = 0
      let twos = 0
      data.board.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (cell !== 0) expect(isDarkSquare(r, c)).toBe(true)
          if (cell === 1) ones++
          if (cell === 2) twos++
        })
      )
      expect(ones).toBe(12)
      expect(twos).toBe(12)
      expect(data.currentSide).toBe(1)
      expect(data.winner).toBeNull()
    })

    it('offers seven opening moves, all forward', () => {
      const g = makeReadyGame()
      const steps = g.getLegalSteps()
      expect(steps).toHaveLength(7)
      steps.forEach((s) => {
        expect(s.from[0]).toBe(5)
        expect(s.to[0]).toBe(4)
        expect(s.capture).toBeNull()
      })
    })
  })

  describe('move validation', () => {
    it('applies a legal move and hands the turn over', () => {
      const g = makeReadyGame()
      expect(g.makeMove(step('p1', [5, 0], [4, 1]))).toBe(true)
      const data = getData(g)
      expect(data.board[5][0]).toBe(0)
      expect(data.board[4][1]).toBe(1)
      expect(data.currentSide).toBe(2)
      expect(g.getState().currentPlayerIndex).toBe(1)
      expect(data.lastMove?.path).toEqual([[5, 0], [4, 1]])
    })

    it('rejects moving out of turn, backwards, onto light squares, sideways, off the board and garbage input', () => {
      const g = makeReadyGame()
      expect(g.makeMove(step('p2', [2, 1], [3, 0]))).toBe(false) // not your turn
      expect(g.makeMove(step('p1', [5, 0], [6, 1]))).toBe(false) // occupied / backwards
      expect(g.makeMove(step('p1', [5, 0], [4, 0]))).toBe(false) // light square
      expect(g.makeMove(step('p1', [5, 0], [3, 2]))).toBe(false) // two squares without a capture
      expect(g.makeMove(step('p1', [5, 0], [4, -1]))).toBe(false) // off the board
      expect(g.makeMove(step('p1', [2, 1], [3, 0]))).toBe(false) // opponent's piece
      expect(g.makeMove({ playerId: 'p1', type: 'step', data: { from: 'a', to: null }, timestamp: new Date() })).toBe(false)
      expect(g.makeMove({ playerId: 'p1', type: 'drop', data: { col: 1 }, timestamp: new Date() })).toBe(false)
      expect(g.makeMove(step('stranger', [5, 0], [4, 1]))).toBe(false)
    })

    it('does not let a man move backwards', () => {
      const g = makeReadyGame()
      setPosition(g, [[4, 3, 1], [0, 1, 2]], 1)
      expect(g.makeMove(step('p1', [4, 3], [5, 2]))).toBe(false)
      expect(g.makeMove(step('p1', [4, 3], [3, 2]))).toBe(true)
    })
  })

  describe('mandatory capture', () => {
    it('refuses a plain move while a capture is available', () => {
      const g = makeReadyGame()
      setPosition(g, [[5, 2, 1], [4, 3, 2], [5, 6, 1], [0, 1, 2]], 1)
      expect(getForcedCapturePieces(getData(g).board, 1)).toEqual([[5, 2]])
      expect(g.makeMove(step('p1', [5, 6], [4, 5]))).toBe(false)
      expect(g.makeMove(step('p1', [5, 2], [4, 1]))).toBe(false)
      expect(g.makeMove(step('p1', [5, 2], [3, 4]))).toBe(true)
      const data = getData(g)
      expect(data.board[4][3]).toBe(0)
      expect(data.board[3][4]).toBe(1)
      expect(data.lastMove?.captured).toEqual([[4, 3]])
    })

    it('does not let a man capture backwards', () => {
      const g = makeReadyGame()
      setPosition(g, [[3, 2, 1], [4, 3, 2], [0, 7, 2]], 1)
      expect(g.getLegalSteps().every((s) => s.capture === null)).toBe(true)
    })

    it('lets a king capture backwards', () => {
      const g = makeReadyGame()
      setPosition(g, [[3, 2, 3], [4, 3, 2], [0, 7, 2]], 1)
      expect(g.getLegalSteps()).toEqual([{ from: [3, 2], to: [5, 4], capture: [4, 3] }])
    })
  })

  describe('multi-jump', () => {
    const chainPosition = (g: CheckersGame) =>
      setPosition(g, [[7, 0, 1], [6, 1, 2], [4, 3, 2], [0, 7, 2], [7, 6, 1]], 1)

    it('keeps the turn with the same piece until the chain is finished', () => {
      const g = makeReadyGame()
      chainPosition(g)
      expect(g.makeMove(step('p1', [7, 0], [5, 2]))).toBe(true)
      let data = getData(g)
      expect(data.chainFrom).toEqual([5, 2])
      expect(data.currentSide).toBe(1)
      expect(g.getState().currentPlayerIndex).toBe(0)
      // Jumped pieces stay until the turn ends.
      expect(data.board[6][1]).toBe(2)
      // Any other piece is refused mid-chain, and so is a plain move by the chain piece.
      expect(g.makeMove(step('p1', [7, 6], [6, 5]))).toBe(false)
      expect(g.makeMove(step('p1', [5, 2], [4, 1]))).toBe(false)
      expect(g.makeMove(step('p2', [0, 7], [1, 6]))).toBe(false)

      expect(g.makeMove(step('p1', [5, 2], [3, 4]))).toBe(true)
      data = getData(g)
      expect(data.chainFrom).toBeNull()
      expect(data.board[6][1]).toBe(0)
      expect(data.board[4][3]).toBe(0)
      expect(data.board[3][4]).toBe(1)
      expect(data.currentSide).toBe(2)
      expect(g.getState().currentPlayerIndex).toBe(1)
      expect(data.moveHistory).toHaveLength(1)
      expect(data.moveHistory[0].path).toEqual([[7, 0], [5, 2], [3, 4]])
      expect(data.moveHistory[0].captured).toEqual([[6, 1], [4, 3]])
    })

    it('survives a save and restore in the middle of a chain', () => {
      const g = makeReadyGame()
      chainPosition(g)
      g.makeMove(step('p1', [7, 0], [5, 2]))
      const restored = new CheckersGame('ck-test')
      restored.restoreState(JSON.parse(JSON.stringify(g.getState())))
      expect(getData(restored).chainFrom).toEqual([5, 2])
      expect(restored.makeMove(step('p1', [5, 2], [3, 4]))).toBe(true)
      expect(getData(restored).currentSide).toBe(2)
    })

    it('generates the full chain as one turn', () => {
      const g = makeReadyGame()
      chainPosition(g)
      const turns = generateTurns(getData(g).board, 1)
      expect(turns).toHaveLength(1)
      expect(turns[0].captures).toBe(2)
      const after = applyTurn(getData(g).board, turns[0])
      expect(after[3][4]).toBe(1)
      expect(after[6][1]).toBe(0)
      expect(after[4][3]).toBe(0)
    })

    it('does not jump the same piece twice in one chain', () => {
      const g = makeReadyGame()
      // A king circling a single opponent piece may only take it once.
      setPosition(g, [[5, 2, 3], [4, 3, 2], [0, 7, 2]], 1)
      g.makeMove(step('p1', [5, 2], [3, 4]))
      expect(getData(g).chainFrom).toBeNull()
      expect(getData(g).currentSide).toBe(2)
    })
  })

  describe('promotion', () => {
    it('crowns a man on the far row', () => {
      const g = makeReadyGame()
      setPosition(g, [[1, 2, 1], [7, 0, 2]], 1)
      g.makeMove(step('p1', [1, 2], [0, 1]))
      expect(getData(g).board[0][1]).toBe(3)
      expect(getData(g).lastMove?.promoted).toBe(true)
    })

    it('ends the turn on promotion even when the new king could capture again', () => {
      const g = makeReadyGame()
      // Jump from (2,1) over (1,2) lands on (0,3) and crowns; the new king could
      // then take (1,4) backwards, but promotion ends the turn.
      setPosition(g, [[2, 1, 1], [1, 2, 2], [1, 4, 2], [7, 0, 2]], 1)
      expect(g.makeMove(step('p1', [2, 1], [0, 3]))).toBe(true)
      const data = getData(g)
      expect(data.board[0][3]).toBe(3)
      expect(data.chainFrom).toBeNull()
      expect(data.currentSide).toBe(2)
      expect(data.board[1][4]).toBe(2)
    })

    it('crowns side 2 on row 7', () => {
      const g = makeReadyGame()
      setPosition(g, [[6, 1, 2], [0, 7, 1]], 2)
      g.makeMove(step('p2', [6, 1], [7, 2]))
      expect(getData(g).board[7][2]).toBe(4)
    })
  })

  describe('game end', () => {
    it('awards the game to the side whose opponent has no piece left', () => {
      const g = makeReadyGame()
      setPosition(g, [[5, 2, 1], [4, 3, 2]], 1)
      g.makeMove(step('p1', [5, 2], [3, 4]))
      const data = getData(g)
      expect(data.winner).toBe(1)
      expect(data.endReason).toBe('no-moves')
      expect(g.getState().status).toBe('finished')
      expect(g.getState().winner).toBe('p1')
      expect(g.checkWinCondition()?.id).toBe('p1')
      expect(g.getState().players[0].score).toBe(1)
    })

    it('awards the game when the opponent is blocked, even with pieces left', () => {
      const g = makeReadyGame()
      // Side 2's man at (6,7) is blocked by a side-1 man at (7,6) and the edge;
      // side 1 plays (4,1)->(3,0) and side 2 has nothing.
      setPosition(g, [[6, 7, 2], [7, 6, 1], [4, 1, 1]], 1)
      g.makeMove(step('p1', [4, 1], [3, 0]))
      expect(getData(g).winner).toBe(1)
      expect(getData(g).endReason).toBe('no-moves')
    })

    it('calls a draw after 40 moves each without a capture or a man move', () => {
      const g = makeReadyGame()
      setPosition(g, [[7, 0, 3], [0, 7, 4]], 1)
      const kings: Record<Side, Square> = { 1: [7, 0], 2: [0, 7] }
      for (let ply = 0; ply < DRAW_PLY_LIMIT; ply++) {
        const side = getData(g).currentSide
        const [r, c] = kings[side]
        const to: Square = side === 1 ? (r === 7 ? [6, 1] : [7, 0]) : (r === 0 ? [1, 6] : [0, 7])
        expect(g.makeMove(step(side === 1 ? 'p1' : 'p2', [r, c], to))).toBe(true)
        kings[side] = to
        if (ply < DRAW_PLY_LIMIT - 1) expect(g.getState().status).toBe('playing')
      }
      expect(getData(g).winner).toBe('draw')
      expect(getData(g).endReason).toBe('draw-rule')
      expect(g.getState().status).toBe('finished')
      expect(g.getState().winner).toBeUndefined()
    })

    it('resets the draw count on a man move', () => {
      const g = makeReadyGame()
      setPosition(g, [[7, 0, 3], [0, 7, 4], [5, 4, 1]], 1)
      g.makeMove(step('p1', [7, 0], [6, 1]))
      expect(getData(g).quietPlies).toBe(1)
      g.makeMove(step('p2', [0, 7], [1, 6]))
      expect(getData(g).quietPlies).toBe(2)
      g.makeMove(step('p1', [5, 4], [4, 5]))
      expect(getData(g).quietPlies).toBe(0)
    })

    it('forfeits on timeout to the other side', () => {
      const g = makeReadyGame()
      expect(g.makeMove({ playerId: 'p1', type: 'timeout-forfeit', data: {}, timestamp: new Date() })).toBe(true)
      expect(getData(g).winner).toBe(2)
      expect(getData(g).endReason).toBe('timeout')
      expect(g.getState().winner).toBe('p2')
    })

    it('rejects moves after the game ends, and next-round starts a fresh board with the scores kept', () => {
      const g = makeReadyGame()
      setPosition(g, [[5, 2, 1], [4, 3, 2]], 1)
      g.makeMove(step('p1', [5, 2], [3, 4]))
      expect(g.makeMove(step('p2', [0, 1], [1, 0]))).toBe(false)
      expect(g.makeMove({ playerId: 'p2', type: 'next-round', data: {}, timestamp: new Date() })).toBe(true)
      const data = getData(g)
      expect(g.getState().status).toBe('playing')
      expect(data.winner).toBeNull()
      expect(data.moveHistory).toEqual([])
      expect(g.getLegalSteps()).toHaveLength(7)
      expect(g.getState().players[0].score).toBe(1)
    })
  })

  describe('generateTurns', () => {
    it('agrees with the engine: every generated turn can be played hop by hop', () => {
      for (let game = 0; game < 20; game++) {
        const g = makeReadyGame()
        for (let ply = 0; ply < 200 && g.getState().status === 'playing'; ply++) {
          const side = getData(g).currentSide
          const turns = generateTurns(getData(g).board, side)
          expect(turns.length).toBeGreaterThan(0)
          const turn = turns[Math.floor(Math.random() * turns.length)]
          const expected = applyTurn(getData(g).board, turn)
          for (const s of turn.steps) {
            expect(g.makeMove(step(side === 1 ? 'p1' : 'p2', s.from, s.to))).toBe(true)
          }
          expect(getData(g).board).toEqual(expected)
        }
      }
    })
  })
})
