/**
 * Integration tests for all available games.
 * Add new game classes to makeAllGames() — every shared assertion runs automatically.
 */

import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { SpyGame } from '@/lib/games/spy-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { MemoryGame } from '@/lib/games/memory-game'
import { LiarsPartyGame } from '@/lib/games/liars-party-game'
import { FakeArtistGame } from '@/lib/games/fake-artist-game'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { TelephoneDoodleGame } from '@/lib/games/telephone-doodle-game'
import { GameEngine, Player } from '@/lib/game-engine'

const testPlayers: Player[] = Array.from({ length: 6 }, (_, i) => ({
  id: `player${i + 1}`,
  name: `Player ${i + 1}`,
}))

function makeAllGames(): GameEngine[] {
  return [
    new YahtzeeGame('g-yahtzee'),
    new SpyGame('g-spy'),
    new TicTacToeGame('g-ttt'),
    new RockPaperScissorsGame('g-rps'),
    new MemoryGame('g-memory'),
    new LiarsPartyGame('g-liars'),
    new FakeArtistGame('g-fake-artist'),
    new SketchAndGuessGame('g-sketch'),
    new TelephoneDoodleGame('g-telephone'),
  ]
}

describe('All Games Integration', () => {
  describe('Game Types', () => {
    it('all 9 games have unique gameType identifiers', () => {
      const types = makeAllGames().map((g) => g.getState().gameType)
      expect(new Set(types).size).toBe(9)
    })

    it('game types match expected values', () => {
      const typeMap: Record<string, string> = {
        'g-yahtzee': 'yahtzee',
        'g-spy': 'guess_the_spy',
        'g-ttt': 'ticTacToe',
        'g-rps': 'rockPaperScissors',
        'g-memory': 'memory',
        'g-liars': 'liars_party',
        'g-fake-artist': 'fake_artist',
        'g-sketch': 'sketch_and_guess',
        'g-telephone': 'telephone_doodle',
      }
      for (const game of makeAllGames()) {
        expect(game.getState().gameType).toBe(typeMap[game.getState().id])
      }
    })
  })

  describe('Player Management', () => {
    it('all games initialize with waiting status', () => {
      for (const game of makeAllGames()) {
        expect(game.getState().status).toBe('waiting')
      }
    })

    it('all games respect min/max player limits', () => {
      const expected: Array<{ id: string; min: number; max: number }> = [
        { id: 'g-yahtzee', min: 1, max: 4 },
        { id: 'g-spy', min: 3, max: 10 },
        { id: 'g-ttt', min: 2, max: 2 },
        { id: 'g-rps', min: 2, max: 2 },
        { id: 'g-memory', min: 2, max: 4 },
        { id: 'g-liars', min: 4, max: 12 },
        { id: 'g-fake-artist', min: 4, max: 10 },
        { id: 'g-sketch', min: 3, max: 10 },
        { id: 'g-telephone', min: 3, max: 12 },
      ]
      for (const game of makeAllGames()) {
        const config = game.getConfig()
        const exp = expected.find((e) => e.id === game.getState().id)!
        expect(config.minPlayers).toBe(exp.min)
        expect(config.maxPlayers).toBe(exp.max)
      }
    })

    it('all games should not start with insufficient players', () => {
      const spy = new SpyGame('g2')
      spy.addPlayer(testPlayers[0])
      spy.addPlayer(testPlayers[1])
      expect(spy.startGame()).toBe(false)

      const tictactoe = new TicTacToeGame('g3')
      tictactoe.addPlayer(testPlayers[0])
      expect(tictactoe.startGame()).toBe(false)

      const memory = new MemoryGame('g4')
      memory.addPlayer(testPlayers[0])
      expect(memory.startGame()).toBe(false)
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
    it('all games maintain consistent state structure', () => {
      for (const game of makeAllGames()) {
        const state = game.getState()
        expect(state).toHaveProperty('id')
        expect(state).toHaveProperty('gameType')
        expect(state).toHaveProperty('players')
        expect(state).toHaveProperty('currentPlayerIndex')
        expect(state).toHaveProperty('status')
        expect(state).toHaveProperty('data')
        expect(state).toHaveProperty('createdAt')
        expect(state).toHaveProperty('updatedAt')
      }
    })

    it('should update game state timestamps on startGame', () => {
      const game = new YahtzeeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))

      jest.useFakeTimers()
      const createdAt = game.getState().createdAt
      jest.advanceTimersByTime(1000)
      game.startGame()

      expect(game.getState().createdAt).toEqual(createdAt)
      expect(game.getState().updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime())

      jest.useRealTimers()
    })
  })

  describe('Game Rules', () => {
    it('all games provide non-empty rules array', () => {
      for (const game of makeAllGames()) {
        const rules = game.getGameRules()
        expect(Array.isArray(rules)).toBe(true)
        expect(rules.length).toBeGreaterThan(0)
        rules.forEach((rule) => {
          expect(typeof rule).toBe('string')
          expect(rule.length).toBeGreaterThan(0)
        })
      }
    })
  })

  describe('Game Configuration', () => {
    it('all games have valid config (min ≥ 1, max ≥ min)', () => {
      for (const game of makeAllGames()) {
        const config = game.getConfig()
        expect(config.minPlayers).toBeGreaterThanOrEqual(1)
        expect(config.maxPlayers).toBeGreaterThanOrEqual(config.minPlayers)
      }
    })
  })

  describe('State Restoration', () => {
    const gamesForRestore: Array<{ label: string; make: () => GameEngine; players: number }> = [
      { label: 'Yahtzee', make: () => new YahtzeeGame('g1'), players: 2 },
      { label: 'TicTacToe', make: () => new TicTacToeGame('g1'), players: 2 },
      { label: 'RockPaperScissors', make: () => new RockPaperScissorsGame('g1'), players: 2 },
      { label: 'Memory', make: () => new MemoryGame('g1'), players: 2 },
    ]

    gamesForRestore.forEach(({ label, make, players }) => {
      it(`restores ${label} state correctly`, () => {
        const original = make()
        testPlayers.slice(0, players).forEach((p) => original.addPlayer(p))
        original.startGame()

        const state = original.getState()
        const restored = make()
        restored.restoreState(state)

        expect(restored.getState()).toEqual(state)
      })
    })
  })

  describe('Move Validation', () => {
    it('all games reject moves from non-existent players', () => {
      const games = [
        new YahtzeeGame('g1'),
        new TicTacToeGame('g2'),
        new RockPaperScissorsGame('g3'),
        new MemoryGame('g4'),
      ]

      for (const game of games) {
        testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))
        game.startGame()

        expect(
          game.validateMove({
            playerId: 'non-existent-player',
            type: 'any',
            data: {},
            timestamp: new Date(),
          })
        ).toBe(false)
      }
    })

    it('all games reject moves when status is not playing', () => {
      const yahtzee = new YahtzeeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => yahtzee.addPlayer(p))

      expect(
        yahtzee.validateMove({
          playerId: testPlayers[0].id,
          type: 'roll',
          data: {},
          timestamp: new Date(),
        })
      ).toBe(false)
    })
  })

  describe('Win Conditions', () => {
    it('all games return null winner before game starts', () => {
      for (const game of makeAllGames()) {
        expect(game.checkWinCondition()).toBeNull()
      }
    })

    it('finished status persists after restoreState', () => {
      const game = new TicTacToeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))
      game.startGame()

      const state = game.getState()
      state.status = 'finished'
      game.restoreState(state)

      expect(game.getState().status).toBe('finished')
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
      expect(game.addPlayer(testPlayers[2])).toBe(false)
      expect(game.getPlayers()).toHaveLength(2)
    })

    it('should return different state objects on each getState() call', () => {
      const game = new YahtzeeGame('g1')
      const s1 = game.getState()
      const s2 = game.getState()
      expect(s1).toEqual(s2)
      expect(s1).not.toBe(s2)
    })
  })

  describe('Player Turn Management', () => {
    it('starts with first player as current', () => {
      const game = new YahtzeeGame('g1')
      testPlayers.slice(0, 2).forEach((p) => game.addPlayer(p))
      game.startGame()
      expect(game.getState().currentPlayerIndex).toBe(0)
    })

    it('advances turn after scoring a category', () => {
      const game = new YahtzeeGame('g1')
      testPlayers.slice(0, 3).forEach((p) => game.addPlayer(p))
      game.startGame()

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
})
