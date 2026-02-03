import { YahtzeeGame, YahtzeeGameData } from '@/lib/games/yahtzee-game'
import { YahtzeeCategory, calculateScore } from '@/lib/yahtzee'
import { Player } from '@/lib/game-engine'

// Helper to get typed game data
const getGameData = (game: YahtzeeGame): YahtzeeGameData => {
  return game.getState().data as YahtzeeGameData
}

describe('YahtzeeGame', () => {
  let game: YahtzeeGame
  const gameId = 'test-game-id'
  const testPlayers: Player[] = [
    { id: 'player1', name: 'Player 1' },
    { id: 'player2', name: 'Player 2' },
  ]

  beforeEach(() => {
    game = new YahtzeeGame(gameId)
  })

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      const initialState = game.getInitialGameData()
      
      expect(initialState.round).toBe(1)
      expect(initialState.rollsLeft).toBe(3)
      expect(initialState.dice).toEqual([1, 2, 3, 4, 5])
      expect(initialState.held).toEqual([false, false, false, false, false])
      expect(initialState.scores).toEqual([])
    })

    it('should create empty scorecards for players', () => {
      testPlayers.forEach(player => game.addPlayer(player))
      game.startGame()
      
      const data = getGameData(game)
      expect(data.scores).toHaveLength(2)
      expect(data.scores[0]).toEqual({})
      expect(data.scores[1]).toEqual({})
    })
  })

  describe('validateMove - roll action', () => {
    beforeEach(() => {
      testPlayers.forEach(player => game.addPlayer(player))
      game.startGame()
    })

    it('should allow roll on first turn', () => {
      const move = {
        playerId: 'player1',
        type: 'roll' as const,
        data: {},
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(true)
    })

    it('should not allow roll if no rolls left', () => {
      const data = getGameData(game)
      data.rollsLeft = 0
      
      const move = {
        playerId: 'player1',
        type: 'roll' as const,
        data: {},
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })

    it('should not allow roll if not current player', () => {
      const move = {
        playerId: 'player2', // player2, but currentPlayerIndex is 0
        type: 'roll' as const,
        data: {},
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })

    it('should validate held array format', () => {
      const move = {
        playerId: 'player1',
        type: 'roll' as const,
        data: { held: [true, false, true, false, false] },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(true)
    })

    it('should reject invalid held array', () => {
      const move = {
        playerId: 'player1',
        type: 'roll' as const,
        data: { held: [true, false] }, // wrong length
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })
  })

  describe('validateMove - hold action', () => {
    beforeEach(() => {
      testPlayers.forEach(player => game.addPlayer(player))
      game.startGame()
      // Simulate one roll
      const data = getGameData(game)
      data.rollsLeft = 2
    })

    it('should allow holding dice after rolling', () => {
      const move = {
        playerId: 'player1',
        type: 'hold' as const,
        data: { diceIndex: 0 },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(true)
    })

    it('should not allow holding before first roll', () => {
      const data = getGameData(game)
      data.rollsLeft = 3 // No rolls yet
      
      const move = {
        playerId: 'player1',
        type: 'hold' as const,
        data: { diceIndex: 0 },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })

    it('should not allow holding invalid dice index', () => {
      const move = {
        playerId: 'player1',
        type: 'hold' as const,
        data: { diceIndex: 10 }, // Invalid index
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })

    it('should allow setting held array', () => {
      const move = {
        playerId: 'player1',
        type: 'hold' as const,
        data: { held: [true, false, true, false, false] },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(true)
    })
  })

  describe('validateMove - score action', () => {
    beforeEach(() => {
      testPlayers.forEach(player => game.addPlayer(player))
      game.startGame()
      // Simulate at least one roll
      const data = getGameData(game)
      data.rollsLeft = 2
      data.dice = [1, 1, 1, 2, 3]
    })

    it('should allow scoring after rolling', () => {
      const move = {
        playerId: 'player1',
        type: 'score' as const,
        data: { category: 'ones' as YahtzeeCategory },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(true)
    })

    it('should not allow scoring before rolling', () => {
      const data = getGameData(game)
      data.rollsLeft = 3
      
      const move = {
        playerId: 'player1',
        type: 'score' as const,
        data: { category: 'ones' as YahtzeeCategory },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })

    it('should not allow scoring in already filled category', () => {
      const data = getGameData(game)
      data.scores[0] = { ones: 5 }
      
      const move = {
        playerId: 'player1',
        type: 'score' as const,
        data: { category: 'ones' as YahtzeeCategory },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })

    it('should not allow scoring if not current player', () => {
      const move = {
        playerId: 'player2',
        type: 'score' as const,
        data: { category: 'ones' as YahtzeeCategory },
        timestamp: new Date()
      }
      
      expect(game.validateMove(move)).toBe(false)
    })
  })

  describe('processMove - roll action', () => {
    beforeEach(() => {
      testPlayers.forEach(player => game.addPlayer(player))
      game.startGame()
    })

    it('should roll 5 dice and decrement rollsLeft', () => {
      const move = {
        playerId: 'player1',
        type: 'roll' as const,
        data: {},
        timestamp: new Date()
      }
      
      game.processMove(move)
      const data = getGameData(game)
      
      expect(data.dice).toHaveLength(5)
      expect(data.rollsLeft).toBe(2)
      data.dice.forEach((die: number) => {
        expect(die).toBeGreaterThanOrEqual(1)
        expect(die).toBeLessThanOrEqual(6)
      })
    })

    it('should respect held dice on re-roll', () => {
      // First roll
      game.processMove({
        playerId: 'player1',
        type: 'roll' as const,
        data: {},
        timestamp: new Date()
      })
      
      const data = getGameData(game)
      const firstDice = [...data.dice]
      
      // Hold first and third dice
      data.held = [true, false, true, false, false]
      
      // Second roll
      game.processMove({
        playerId: 'player1',
        type: 'roll' as const,
        data: {},
        timestamp: new Date()
      })
      
      const newData = getGameData(game)
      expect(newData.dice[0]).toBe(firstDice[0]) // held
      expect(newData.dice[2]).toBe(firstDice[2]) // held
      expect(newData.rollsLeft).toBe(1)
    })

    it('should support atomic roll with held array', () => {
      const move = {
        playerId: 'player1',
        type: 'roll' as const,
        data: { held: [true, false, true, false, false] },
        timestamp: new Date()
      }
      
      game.processMove(move)
      const data = getGameData(game)
      
      expect(data.held).toEqual([true, false, true, false, false])
    })
  })

  describe('processMove - hold action', () => {
    beforeEach(() => {
      testPlayers.forEach(player => game.addPlayer(player))
      game.startGame()
      // Do first roll
      game.processMove({
        playerId: 'player1',
        type: 'roll' as const,
        data: {},
        timestamp: new Date()
      })
    })

    it('should toggle dice hold state', () => {
      game.processMove({
        playerId: 'player1',
        type: 'hold' as const,
        data: { diceIndex: 0 },
        timestamp: new Date()
      })
      
      let data = getGameData(game)
      expect(data.held[0]).toBe(true)
      
      // Toggle again
      game.processMove({
        playerId: 'player1',
        type: 'hold' as const,
        data: { diceIndex: 0 },
        timestamp: new Date()
      })
      
      data = getGameData(game)
      expect(data.held[0]).toBe(false)
    })

    it('should set entire held array', () => {
      game.processMove({
        playerId: 'player1',
        type: 'hold' as const,
        data: { held: [true, false, true, false, true] },
        timestamp: new Date()
      })
      
      const data = getGameData(game)
      expect(data.held).toEqual([true, false, true, false, true])
    })
  })

  describe('processMove - score action', () => {
    beforeEach(() => {
      testPlayers.forEach(player => game.addPlayer(player))
      game.startGame()
      const data = getGameData(game)
      data.rollsLeft = 2
      data.dice = [1, 1, 1, 2, 3]
    })

    it('should score and advance to next player', () => {
      game.processMove({
        playerId: 'player1',
        type: 'score' as const,
        data: { category: 'ones' as YahtzeeCategory },
        timestamp: new Date()
      })
      
      const data = getGameData(game)
      expect(data.scores[0].ones).toBe(3)
      // Note: currentPlayerIndex is advanced by makeMove(), not processMove()
      expect(data.rollsLeft).toBe(3)
      expect(data.held).toEqual([false, false, false, false, false])
    })

    it('should detect game over when all categories filled', () => {
      const data = getGameData(game)
      
      // Fill almost all categories for both players
      const almostFullScorecard = {
        ones: 1,
        twos: 2,
        threes: 3,
        fours: 4,
        fives: 5,
        sixes: 6,
        threeOfKind: 15,
        fourOfKind: 20,
        fullHouse: 25,
        onePair: 10,
        twoPairs: 20,
        smallStraight: 30,
        largeStraight: 40,
        yahtzee: 50,
        // chance is missing
      }
      
      data.scores[0] = { ...almostFullScorecard }
      data.scores[1] = { ...almostFullScorecard, chance: 15 }
      
      game.processMove({
        playerId: 'player1',
        type: 'score' as const,
        data: { category: 'chance' as YahtzeeCategory },
        timestamp: new Date()
      })
      
      // Game over should be detected by checkWinCondition
      const winner = game.checkWinCondition()
      expect(winner).not.toBeNull()
    })
  })

  describe('score calculation', () => {
    it('should calculate ones correctly', () => {
      const dice = [1, 1, 1, 2, 3]
      expect(calculateScore(dice, 'ones')).toBe(3)
    })

    it('should calculate yahtzee correctly', () => {
      const dice = [5, 5, 5, 5, 5]
      expect(calculateScore(dice, 'yahtzee')).toBe(50)
    })

    it('should calculate full house correctly', () => {
      const dice = [3, 3, 3, 2, 2]
      expect(calculateScore(dice, 'fullHouse')).toBe(25)
    })

    it('should return 0 for invalid full house', () => {
      const dice = [1, 2, 3, 4, 5]
      expect(calculateScore(dice, 'fullHouse')).toBe(0)
    })

    it('should calculate large straight correctly', () => {
      const dice = [1, 2, 3, 4, 5]
      expect(calculateScore(dice, 'largeStraight')).toBe(40)
    })

    it('should calculate chance correctly', () => {
      const dice = [1, 2, 3, 4, 5]
      expect(calculateScore(dice, 'chance')).toBe(15)
    })
  })
})
