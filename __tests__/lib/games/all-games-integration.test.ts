/**
 * Integration tests for all available games
 * Tests common game engine functionality across all game types
 */

import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { SpyGame } from '@/lib/games/spy-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { GameEngine, Player } from '@/lib/game-engine'

describe('All Games Integration', () => {
  const testPlayers: Player[] = [
    { id: 'player1', name: 'Player 1' },
    { id: 'player2', name: 'Player 2' },
    { id: 'player3', name: 'Player 3' },
  ]

  describe('Game Types', () => {
    it('should have unique game type identifiers', () => {
      const yahtzee = new YahtzeeGame('yahtzee-1')
      const spy = new SpyGame('spy-1')
      const tictactoe = new TicTacToeGame('tictactoe-1')
      const rps = new RockPaperScissorsGame('rps-1')

      const gameTypes = [
        yahtzee.getState().gameType,
        spy.getState().gameType,
        tictactoe.getState().gameType,
        rps.getState().gameType,
      ]

      // All game types should be unique
      expect(new Set(gameTypes).size).toBe(4)
    })

    it('should have correct game type values', () => {
      const yahtzee = new YahtzeeGame('yahtzee-1')
      const spy = new SpyGame('spy-1')
      const tictactoe = new TicTacToeGame('tictactoe-1')
      const rps = new RockPaperScissorsGame('rps-1')

      expect(yahtzee.getState().gameType).toBe('yahtzee')
      expect(spy.getState().gameType).toBe('guess_the_spy')
      expect(tictactoe.getState().gameType).toBe('ticTacToe')
      expect(rps.getState().gameType).toBe('rockPaperScissors')
    })
  })

  describe('Player Management', () => {
    it('all games should initialize with waiting status', () => {
      const games = [
        new YahtzeeGame('g1'),
        new SpyGame('g2'),
        new TicTacToeGame('g3'),
        new RockPaperScissorsGame('g4'),
      ]

      games.forEach((game) => {
        expect(game.getState().status).toBe('waiting')
      })
    })

    it('all games should respect min/max player limits', () => {
      const games: Array<{ game: GameEngine; min: number; max: number }> = [
        { game: new YahtzeeGame('g1'), min: 1, max: 4 },
        { game: new SpyGame('g2'), min: 3, max: 10 },
        { game: new TicTacToeGame('g3'), min: 2, max: 2 },
        { game: new RockPaperScissorsGame('g4'), min: 2, max: 2 },
      ]

      games.forEach(({ game, min, max }) => {
        const config = game.getConfig()
        expect(config.minPlayers).toBe(min)
        expect(config.maxPlayers).toBe(max)
      })
    })

    it('all games should not start with insufficient players', () => {
      // Spy game requires minimum 3 players
      const spy = new SpyGame('g2')
      spy.addPlayer(testPlayers[0])
      spy.addPlayer(testPlayers[1])

      expect(spy.startGame()).toBe(false)
      
      // TicTacToe requires exactly 2 players
      const tictactoe = new TicTacToeGame('g3')
      tictactoe.addPlayer(testPlayers[0])

      expect(tictactoe.startGame()).toBe(false)
    })

    it('all games should allow adding players up to limit', () => {
      const game = new YahtzeeGame('g1')
      expect(game.addPlayer(testPlayers[0])).toBe(true)
      expect(game.addPlayer(testPlayers[1])).toBe(true)
      expect(game.addPlayer(testPlayers[2])).toBe(true)
      expect(game.getPlayers()).toHaveLength(3)
    })
  })

  describe('Game State Management', () => {
    it('should maintain consistent state structure', () => {
      const games = [
        new YahtzeeGame('g1'),
        new SpyGame('g2'),
        new TicTacToeGame('g3'),
        new RockPaperScissorsGame('g4'),
      ]

      games.forEach((game) => {
        const state = game.getState()

        expect(state).toHaveProperty('id')
        expect(state).toHaveProperty('gameType')
        expect(state).toHaveProperty('players')
        expect(state).toHaveProperty('currentPlayerIndex')
        expect(state).toHaveProperty('status')
        expect(state).toHaveProperty('data')
        expect(state).toHaveProperty('createdAt')
        expect(state).toHaveProperty('updatedAt')
      })
    })

    it('should update game state timestamps', () => {
      const game = new YahtzeeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))

      const initialState = game.getState()
      const createdAt = initialState.createdAt

      // Simulate time passing
      jest.useFakeTimers()
      jest.advanceTimersByTime(1000)

      game.startGame()
      const updatedState = game.getState()

      expect(updatedState.createdAt).toEqual(createdAt)
      expect(updatedState.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime())

      jest.useRealTimers()
    })
  })

  describe('Game Rules', () => {
    it('all games should provide game rules', () => {
      const games = [
        new YahtzeeGame('g1'),
        new SpyGame('g2'),
        new TicTacToeGame('g3'),
        new RockPaperScissorsGame('g4'),
      ]

      games.forEach((game) => {
        const rules = game.getGameRules()
        expect(Array.isArray(rules)).toBe(true)
        expect(rules.length).toBeGreaterThan(0)
        rules.forEach((rule) => {
          expect(typeof rule).toBe('string')
          expect(rule.length).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('State Restoration', () => {
    it('should restore Yahtzee game state correctly', () => {
      const original = new YahtzeeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => original.addPlayer(p))
      original.startGame()

      const state = original.getState()
      const restored = new YahtzeeGame('g1')
      restored.restoreState(state)

      expect(restored.getState()).toEqual(state)
    })

    it('should restore Tic Tac Toe game state correctly', () => {
      const original = new TicTacToeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => original.addPlayer(p))
      original.startGame()

      const state = original.getState()
      const restored = new TicTacToeGame('g1')
      restored.restoreState(state)

      expect(restored.getState()).toEqual(state)
    })

    it('should restore Rock Paper Scissors game state correctly', () => {
      const original = new RockPaperScissorsGame('g1')
      testPlayers.slice(0, 2).forEach((p) => original.addPlayer(p))
      original.startGame()

      const state = original.getState()
      const restored = new RockPaperScissorsGame('g1')
      restored.restoreState(state)

      expect(restored.getState()).toEqual(state)
    })
  })

  describe('Move Validation', () => {
    it('all games should reject moves from non-existent players', () => {
      const games = [
        new YahtzeeGame('g1'),
        new TicTacToeGame('g2'),
        new RockPaperScissorsGame('g3'),
      ]

      games.forEach((game) => {
        testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))
        game.startGame()

        const move = {
          playerId: 'non-existent-player',
          type: 'any',
          data: {},
          timestamp: new Date(),
        }

        expect(game.validateMove(move)).toBe(false)
      })
    })

    it('all games should reject moves when status is not playing', () => {
      const yahtzee = new YahtzeeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => yahtzee.addPlayer(p))
      // Don't start the game

      const move = {
        playerId: testPlayers[0].id,
        type: 'roll',
        data: {},
        timestamp: new Date(),
      }

      expect(yahtzee.validateMove(move)).toBe(false)
    })
  })

  describe('Win Conditions', () => {
    it('all games should check for winner correctly', () => {
      const games = [
        new YahtzeeGame('g1'),
        new SpyGame('g2'),
        new TicTacToeGame('g3'),
        new RockPaperScissorsGame('g4'),
      ]

      games.forEach((game) => {
        // Before game starts, no winner
        expect(game.checkWinCondition()).toBeNull()
      })
    })

    it('should transition to finished status when game ends', () => {
      const game = new TicTacToeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))
      game.startGame()

      // Create winning state manually
      const state = game.getState()
      const data = state.data as any
      data.board = [
        ['X', 'X', 'X'],
        ['O', 'O', null],
        [null, null, null],
      ]
      data.winner = 'X'
      game.restoreState(state)

      // Make final move to trigger finish
      state.status = 'finished'
      game.restoreState(state)

      expect(game.getState().status).toBe('finished')
      expect(game.checkWinCondition()).not.toBeNull()
    })
  })

  describe('Game Configuration', () => {
    it('all games should have valid configuration', () => {
      const games = [
        new YahtzeeGame('g1'),
        new SpyGame('g2'),
        new TicTacToeGame('g3'),
        new RockPaperScissorsGame('g4'),
      ]

      games.forEach((game) => {
        const config = game.getConfig()

        expect(config.minPlayers).toBeGreaterThan(0)
        expect(config.maxPlayers).toBeGreaterThanOrEqual(config.minPlayers)
        expect(config.minPlayers).toBeLessThanOrEqual(10)
        expect(config.maxPlayers).toBeLessThanOrEqual(10)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty player list', () => {
      const game = new YahtzeeGame('g1')
      expect(game.getPlayers()).toEqual([])
      expect(game.startGame()).toBe(false)
    })

    it('should handle removal of non-existent player gracefully', () => {
      const game = new YahtzeeGame('g1')
      expect(game.removePlayer('non-existent')).toBe(false)
    })

    it('should not allow exceeding max players', () => {
      const game = new TicTacToeGame('g1')
      expect(game.addPlayer(testPlayers[0])).toBe(true)
      expect(game.addPlayer(testPlayers[1])).toBe(true)
      expect(game.addPlayer(testPlayers[2])).toBe(false) // Should fail
      expect(game.getPlayers()).toHaveLength(2)
    })

    it('should handle game state with missing data properties', () => {
      const game = new YahtzeeGame('g1')
      const state = game.getState()

      // Create a state with minimal data
      const minimalState = {
        ...state,
        data: {},
      }

      // Should not throw error when restoring
      expect(() => game.restoreState(minimalState)).not.toThrow()
    })
  })

  describe('Player Turn Management', () => {
    it('should initialize with first player as current', () => {
      const game = new YahtzeeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))
      game.startGame()

      expect(game.getState().currentPlayerIndex).toBe(0)
    })

    it('should advance turn correctly', () => {
      const game = new YahtzeeGame('g1')
      testPlayers.slice(0, 3).forEach((p) => game.addPlayer(p))
      game.startGame()

      expect(game.getState().currentPlayerIndex).toBe(0)

      // Simulate a move that advances turn
      const data = game.getState().data as any
      data.rollsLeft = 2
      data.dice = [1, 1, 1, 2, 3]

      game.makeMove({
        playerId: testPlayers[0].id,
        type: 'score',
        data: { category: 'ones' },
        timestamp: new Date(),
      })

      expect(game.getState().currentPlayerIndex).toBe(1)
    })
  })

  describe('Data Integrity', () => {
    it('should not mutate player data', () => {
      const game = new YahtzeeGame('g1')
      const originalPlayer = { ...testPlayers[0] }

      game.addPlayer(testPlayers[0])

      expect(testPlayers[0]).toEqual(originalPlayer)
    })

    it('should return copy of game state, not reference', () => {
      const game = new YahtzeeGame('g1')
      const state1 = game.getState()
      const state2 = game.getState()

      expect(state1).toEqual(state2)
      expect(state1).not.toBe(state2) // Different objects
    })
  })
})
