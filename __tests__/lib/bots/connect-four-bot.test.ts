import { ConnectFourGame, ConnectFourGameData, CellValue, PlayerDisc } from '@/lib/games/connect-four-game'
import { ConnectFourBot, CONNECT_FOUR_HARD_TIME_BUDGET_MS } from '@/lib/bots/connect-four/connect-four-bot'

const makeGame = (): ConnectFourGame => {
  const g = new ConnectFourGame('cf-bot-test')
  g.addPlayer({ id: 'p1', name: 'Human' })
  g.addPlayer({ id: 'bot1', name: 'Bot' })
  g.startGame()
  return g
}

const getData = (g: ConnectFourGame): ConnectFourGameData =>
  g.getState().data as ConnectFourGameData

const setBoard = (g: ConnectFourGame, board: CellValue[][], disc: PlayerDisc, playerIndex: number) => {
  const data = getData(g)
  data.board = board.map((row) => [...row])
  data.currentDisc = disc
  g.getState().currentPlayerIndex = playerIndex
}

describe('ConnectFourBot', () => {
  describe('easy difficulty', () => {
    it('makeDecision returns a column in getAvailableColumns on a fresh board', async () => {
      const game = makeGame()
      const bot = new ConnectFourBot(game, 'easy', 'bot1')
      const available = game.getAvailableColumns()
      const decision = await bot.makeDecision()
      expect(available).toContain(decision.col)
    })

    it('decision type is always "drop"', async () => {
      const game = makeGame()
      const bot = new ConnectFourBot(game, 'easy', 'bot1')
      const decision = await bot.makeDecision()
      expect(decision.type).toBe('drop')
    })
  })

  describe('medium difficulty', () => {
    it('picks the winning column when one exists (3 in a row for bot disc)', async () => {
      const game = makeGame()
      // Bot is disc 2 (second player). Set up 3 in a row at row 5, cols 0-2 for disc 2
      // Make it the bot's turn (currentPlayerIndex=1, currentDisc=2)
      const board: CellValue[][] = Array.from({ length: 6 }, () => Array(7).fill(null))
      board[5][0] = 2; board[5][1] = 2; board[5][2] = 2
      setBoard(game, board, 2, 1)
      const bot = new ConnectFourBot(game, 'medium', 'bot1')
      const decision = await bot.makeDecision()
      expect(decision.col).toBe(3)
    })

    it('blocks opponent when opponent has 3 in a row', async () => {
      const game = makeGame()
      // Opponent (disc 1) has 3 in a row at row 5 cols 0-2; bot (disc 2) must block col 3
      const board: CellValue[][] = Array.from({ length: 6 }, () => Array(7).fill(null))
      board[5][0] = 1; board[5][1] = 1; board[5][2] = 1
      setBoard(game, board, 2, 1)
      const bot = new ConnectFourBot(game, 'medium', 'bot1')
      const decision = await bot.makeDecision()
      expect(decision.col).toBe(3)
    })

    it('returns a valid column when no immediate win or block', async () => {
      const game = makeGame()
      const bot = new ConnectFourBot(game, 'medium', 'bot1')
      const available = game.getAvailableColumns()
      const decision = await bot.makeDecision()
      expect(available).toContain(decision.col)
    })
  })

  describe('hard difficulty', () => {
    it('picks the winning column for a vertical 3-in-a-row (only one win possible)', async () => {
      const game = makeGame()
      // Disc 2 has rows 3,4,5 in col 3 — dropping col 3 lands at row 2 → vertical 4-in-a-row
      const board: CellValue[][] = Array.from({ length: 6 }, () => Array(7).fill(null))
      board[3][3] = 2; board[4][3] = 2; board[5][3] = 2
      setBoard(game, board, 2, 1)
      const bot = new ConnectFourBot(game, 'hard', 'bot1')
      const decision = await bot.makeDecision()
      expect(decision.col).toBe(3)
    })

    it('blocks opponent vertical 3-in-a-row (only one block possible)', async () => {
      const game = makeGame()
      // Disc 1 has rows 3,4,5 in col 3 — bot (disc 2) must play col 3 to block vertical win
      const board: CellValue[][] = Array.from({ length: 6 }, () => Array(7).fill(null))
      board[3][3] = 1; board[4][3] = 1; board[5][3] = 1
      setBoard(game, board, 2, 1)
      const bot = new ConnectFourBot(game, 'hard', 'bot1')
      const decision = await bot.makeDecision()
      expect(decision.col).toBe(3)
    })
  })

  describe('decisionToMove and evaluateState', () => {
    it('decisionToMove produces a Move with correct playerId and type=drop', async () => {
      const game = makeGame()
      const bot = new ConnectFourBot(game, 'medium', 'bot1')
      const decision = await bot.makeDecision()
      const move = bot.decisionToMove(decision)
      expect(move.type).toBe('drop')
      expect(move.playerId).toBe('bot1')
      expect(typeof move.data.col).toBe('number')
    })

    it('evaluateState returns a non-empty string', () => {
      const game = makeGame()
      const bot = new ConnectFourBot(game, 'medium', 'bot1')
      const result = bot.evaluateState()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('hard search over played-out positions', () => {
    afterEach(() => jest.restoreAllMocks())

    function seedRandom(seed: number) {
      let state = seed >>> 0
      jest.spyOn(Math, 'random').mockImplementation(() => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      })
    }

    function randomPosition(plies: number): ConnectFourGame {
      const game = makeGame()
      for (let i = 0; i < plies && game.getState().status === 'playing'; i++) {
        const cols = game.getAvailableColumns()
        const col = cols[Math.floor(Math.random() * cols.length)]
        game.makeMove({ playerId: game.getCurrentPlayer()!.id, type: 'drop', data: { col }, timestamp: new Date() })
      }
      return game
    }

    function winningColumns(game: ConnectFourGame, playerId: string): number[] {
      return game.getAvailableColumns().filter((col) => {
        const copy = new ConnectFourGame('cf-copy')
        copy.restoreState(JSON.parse(JSON.stringify(game.getState())))
        copy.makeMove({ playerId, type: 'drop', data: { col }, timestamp: new Date() })
        return copy.getState().winner === playerId
      })
    }

    it('never passes up a win on the board, and answers inside its time budget', async () => {
      seedRandom(1330)
      let positionsWithAWin = 0
      for (let n = 0; n < 40; n++) {
        const game = randomPosition(6 + (n % 18))
        if (game.getState().status !== 'playing') continue
        const botId = game.getCurrentPlayer()!.id
        const wins = winningColumns(game, botId)

        const started = Date.now()
        const decision = await new ConnectFourBot(game, 'hard', botId).makeDecision()
        // The clock is checked every few hundred nodes, so allow one interval's overrun.
        expect(Date.now() - started).toBeLessThan(CONNECT_FOUR_HARD_TIME_BUDGET_MS + 150)

        expect(game.getAvailableColumns()).toContain(decision.col)
        if (wins.length > 0) {
          positionsWithAWin++
          expect(wins).toContain(decision.col)
        }
      }
      expect(positionsWithAWin).toBeGreaterThan(0)
    })

    it('still finds the only block when its search budget is almost nothing', async () => {
      const game = makeGame()
      const board: CellValue[][] = Array.from({ length: 6 }, () => Array(7).fill(null))
      board[5][4] = 1; board[5][5] = 1; board[5][6] = 1
      setBoard(game, board, 2, 1)
      const decision = await new ConnectFourBot(game, 'hard', 'bot1', { timeBudgetMs: 1 }).makeDecision()
      expect(decision.col).toBe(3)
    })
  })
})
