import { Move } from '@/lib/game-engine'
import { ConnectFourGame, ConnectFourGameData, CellValue, ROWS, COLS } from '@/lib/games/connect-four-game'

const createMove = (playerId: string, type: string, data: Record<string, unknown>): Move => ({
  playerId,
  type,
  data,
  timestamp: new Date(),
})

const getData = (game: ConnectFourGame): ConnectFourGameData =>
  game.getState().data as ConnectFourGameData

const makeReadyGame = (): ConnectFourGame => {
  const g = new ConnectFourGame('cf-test')
  g.addPlayer({ id: 'p1', name: 'Red' })
  g.addPlayer({ id: 'p2', name: 'Yellow' })
  g.startGame()
  return g
}

describe('ConnectFourGame', () => {
  describe('initialization', () => {
    it('returns a 6×7 null board with disc=1 and no winner', () => {
      const g = new ConnectFourGame('cf-init')
      const data = getData(g)
      expect(data.board).toHaveLength(ROWS)
      data.board.forEach((row) => {
        expect(row).toHaveLength(COLS)
        row.forEach((cell) => expect(cell).toBeNull())
      })
      expect(data.currentDisc).toBe(1)
      expect(data.winner).toBeNull()
      expect(data.moveCount).toBe(0)
    })

    it('starts in playing status after addPlayer + startGame', () => {
      const g = makeReadyGame()
      expect(g.getState().status).toBe('playing')
      expect(g.getState().players).toHaveLength(2)
    })
  })

  describe('getDropRow', () => {
    it('returns row 5 (bottom) on an empty column', () => {
      const g = makeReadyGame()
      expect(g.getDropRow(3)).toBe(5)
    })

    it('returns the next available row after discs are placed', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      g.makeMove(createMove('p2', 'drop', { col: 3 }))
      expect(g.getDropRow(3)).toBe(3)
    })

    it('returns -1 for a fully filled column', () => {
      const g = makeReadyGame()
      for (let i = 0; i < ROWS; i++) {
        const player = i % 2 === 0 ? 'p1' : 'p2'
        g.makeMove(createMove(player, 'drop', { col: 0 }))
      }
      expect(g.getDropRow(0)).toBe(-1)
    })
  })

  describe('validateMove — drop', () => {
    it('accepts a drop on an empty column', () => {
      const g = makeReadyGame()
      expect(g.validateMove(createMove('p1', 'drop', { col: 3 }))).toBe(true)
    })

    it('rejects a drop on a full column', () => {
      const g = makeReadyGame()
      for (let i = 0; i < ROWS; i++) {
        const player = i % 2 === 0 ? 'p1' : 'p2'
        g.makeMove(createMove(player, 'drop', { col: 0 }))
      }
      expect(g.validateMove(createMove('p1', 'drop', { col: 0 }))).toBe(false)
    })

    it('rejects an out-of-bounds column', () => {
      const g = makeReadyGame()
      expect(g.validateMove(createMove('p1', 'drop', { col: 7 }))).toBe(false)
      expect(g.validateMove(createMove('p1', 'drop', { col: -1 }))).toBe(false)
    })

    it("rejects drop when it's not the player's turn", () => {
      const g = makeReadyGame()
      expect(g.validateMove(createMove('p2', 'drop', { col: 3 }))).toBe(false)
    })

    it('rejects drop after the game has finished', () => {
      const g = makeReadyGame()
      // Fill column 0 to trigger a column check, but actually win horizontally in row 5
      for (let col = 0; col < 4; col++) {
        g.makeMove(createMove('p1', 'drop', { col }))
        if (col < 3) g.makeMove(createMove('p2', 'drop', { col: col + 4 }))
      }
      expect(g.getState().status).toBe('finished')
      expect(g.validateMove(createMove('p1', 'drop', { col: 0 }))).toBe(false)
    })
  })

  describe('validateMove — undo / timeout-forfeit / next-round', () => {
    it('accepts request-undo when snapshots exist', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      expect(g.validateMove(createMove('p1', 'request-undo', {}))).toBe(true)
    })

    it('rejects request-undo when no snapshots exist', () => {
      const g = makeReadyGame()
      expect(g.validateMove(createMove('p1', 'request-undo', {}))).toBe(false)
    })

    it('accepts respond-undo for the correct responder with boolean accept', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      g.makeMove(createMove('p1', 'request-undo', {}))
      expect(g.validateMove(createMove('p2', 'respond-undo', { accept: true }))).toBe(true)
      expect(g.validateMove(createMove('p2', 'respond-undo', { accept: false }))).toBe(true)
    })

    it('rejects respond-undo for the wrong player', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      g.makeMove(createMove('p1', 'request-undo', {}))
      expect(g.validateMove(createMove('p1', 'respond-undo', { accept: true }))).toBe(false)
    })

    it('accepts timeout-forfeit for the current player while playing', () => {
      const g = makeReadyGame()
      expect(g.validateMove(createMove('p1', 'timeout-forfeit', {}))).toBe(true)
    })

    it('rejects timeout-forfeit for the non-current player', () => {
      const g = makeReadyGame()
      expect(g.validateMove(createMove('p2', 'timeout-forfeit', {}))).toBe(false)
    })

    it('accepts next-round only after game is finished', () => {
      const g = makeReadyGame()
      expect(g.validateMove(createMove('p1', 'next-round', {}))).toBe(false)
      g.makeMove(createMove('p1', 'timeout-forfeit', {}))
      expect(g.getState().status).toBe('finished')
      expect(g.validateMove(createMove('p1', 'next-round', {}))).toBe(true)
    })
  })

  describe('processMove — drop mechanics', () => {
    it('disc lands at the lowest row (gravity)', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      const data = getData(g)
      expect(data.lastDroppedRow).toBe(5)
      expect(data.lastDroppedCol).toBe(3)
      expect(data.board[5][3]).toBe(1)
    })

    it('increments moveCount and alternates disc 1→2→1', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 0 }))
      expect(getData(g).moveCount).toBe(1)
      expect(getData(g).currentDisc).toBe(2)
      g.makeMove(createMove('p2', 'drop', { col: 1 }))
      expect(getData(g).moveCount).toBe(2)
      expect(getData(g).currentDisc).toBe(1)
    })
  })

  describe('win detection', () => {
    it('detects horizontal 4 in a row', () => {
      const g = makeReadyGame()
      // p1 drops cols 0-3 in bottom row, p2 offsets
      for (let col = 0; col < 4; col++) {
        g.makeMove(createMove('p1', 'drop', { col }))
        if (col < 3) g.makeMove(createMove('p2', 'drop', { col: col + 4 }))
      }
      expect(getData(g).winner).toBe(1)
      expect(g.getState().status).toBe('finished')
    })

    it('detects vertical 4 in a row', () => {
      const g = makeReadyGame()
      for (let i = 0; i < 4; i++) {
        g.makeMove(createMove('p1', 'drop', { col: 0 }))
        if (i < 3) g.makeMove(createMove('p2', 'drop', { col: 1 }))
      }
      expect(getData(g).winner).toBe(1)
    })

    it('detects diagonal ↘', () => {
      const board: CellValue[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
      // Build diagonal from (2,0): (2,0),(3,1),(4,2),(5,3) for disc 1
      // Place disc 1 at each by stacking manually using the game
      const g = makeReadyGame()
      // col0: needs 4 discs below (2,0): rows 5,4,3,2 — drop p2, p2, p2, p1
      g.makeMove(createMove('p2', 'drop', { col: 1 })) // p2 placeholder
      g.makeMove(createMove('p1', 'drop', { col: 0 })) // row5, col0 = p1 — disc1
      g.makeMove(createMove('p2', 'drop', { col: 1 })) // p2 placeholder
      g.makeMove(createMove('p1', 'drop', { col: 0 })) // row4 = p1
      g.makeMove(createMove('p2', 'drop', { col: 1 })) // p2 placeholder
      g.makeMove(createMove('p1', 'drop', { col: 0 })) // row3 = p1

      // Now use checkForWinner directly on a crafted board
      board[2][0] = 1; board[3][1] = 1; board[4][2] = 1; board[5][3] = 1
      const result = g.checkForWinner(board, 5, 3)
      expect(result).not.toBeNull()
      expect(result).toHaveLength(4)
    })

    it('detects diagonal ↙', () => {
      const g = makeReadyGame()
      const board: CellValue[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
      board[2][6] = 1; board[3][5] = 1; board[4][4] = 1; board[5][3] = 1
      const result = g.checkForWinner(board, 5, 3)
      expect(result).not.toBeNull()
      expect(result).toHaveLength(4)
    })

    it('does NOT trigger win for 3 in a row', () => {
      const g = makeReadyGame()
      const board: CellValue[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
      board[5][0] = 1; board[5][1] = 1; board[5][2] = 1
      expect(g.checkForWinner(board, 5, 2)).toBeNull()
    })

    it('increments winner score on win', () => {
      const g = makeReadyGame()
      for (let col = 0; col < 4; col++) {
        g.makeMove(createMove('p1', 'drop', { col }))
        if (col < 3) g.makeMove(createMove('p2', 'drop', { col: col + 4 }))
      }
      const winner = g.getState().players.find((p) => p.id === 'p1')
      expect(winner?.score).toBe(1)
    })
  })

  describe('draw detection', () => {
    it('sets winner=draw and status=finished when board is full with no winner', () => {
      const g = makeReadyGame()
      const data = getData(g)
      // A 6×7 board with no 4-in-a-row (max run = 2 in every direction).
      // Pattern: rows alternate between [1,1,2,2,1,1,x] and [2,2,1,1,2,2,x].
      // Leave (0,6) empty — disc 2 fills it last.
      // Leave (0,0) empty; p1 (disc 1) fills it last. max run = 2 in every direction.
      const rowB: CellValue[] = [2, 2, 1, 1, 2, 2, 1]
      const rowC: CellValue[] = [1, 1, 2, 2, 1, 1, 2]
      data.board = [
        [null, 1, 2, 2, 1, 1, 2],  // row 0: col 0 empty
        [...rowB],   // row 1
        [...rowC],   // row 2
        [...rowB],   // row 3
        [...rowC],   // row 4
        [...rowB],   // row 5
      ]
      data.moveCount = ROWS * COLS - 1
      data.currentDisc = 1
      // currentPlayerIndex remains 0 (p1's turn, default after startGame)

      g.makeMove(createMove('p1', 'drop', { col: 0 }))

      expect(getData(g).winner).toBe('draw')
      expect(g.getState().status).toBe('finished')
    })
  })

  describe('undo flow', () => {
    it('sets pendingRequest after request-undo', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      g.makeMove(createMove('p1', 'request-undo', {}))
      expect(getData(g).pendingRequest).not.toBeNull()
      expect(getData(g).pendingRequest?.requesterId).toBe('p1')
    })

    it('restores previous board state when respond-undo accept=true', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      expect(getData(g).board[5][3]).toBe(1)
      g.makeMove(createMove('p1', 'request-undo', {}))
      g.makeMove(createMove('p2', 'respond-undo', { accept: true }))
      expect(getData(g).board[5][3]).toBeNull()
      expect(getData(g).pendingRequest).toBeNull()
      expect(getData(g).moveCount).toBe(0)
    })

    it('clears pendingRequest without reverting when respond-undo accept=false', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'drop', { col: 3 }))
      g.makeMove(createMove('p1', 'request-undo', {}))
      g.makeMove(createMove('p2', 'respond-undo', { accept: false }))
      expect(getData(g).pendingRequest).toBeNull()
      expect(getData(g).board[5][3]).toBe(1)
    })
  })

  describe('timeout-forfeit', () => {
    it('sets winner to the opposing disc and finishes the game', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'timeout-forfeit', {}))
      expect(getData(g).winner).toBe(2)
      expect(g.getState().status).toBe('finished')
      expect(g.getState().winner).toBe('p2')
    })
  })

  describe('next-round', () => {
    it('resets board, winner, and status back to playing', () => {
      const g = makeReadyGame()
      g.makeMove(createMove('p1', 'timeout-forfeit', {}))
      expect(g.getState().status).toBe('finished')
      g.makeMove(createMove('p1', 'next-round', {}))
      const data = getData(g)
      expect(g.getState().status).toBe('playing')
      expect(data.winner).toBeNull()
      expect(data.moveCount).toBe(0)
      data.board.forEach((row) => row.forEach((cell) => expect(cell).toBeNull()))
    })
  })

  describe('getGameRules', () => {
    it('returns an array of 4 rule strings', () => {
      const g = makeReadyGame()
      const rules = g.getGameRules()
      expect(Array.isArray(rules)).toBe(true)
      expect(rules).toHaveLength(4)
      rules.forEach((r) => expect(typeof r).toBe('string'))
    })
  })
})
