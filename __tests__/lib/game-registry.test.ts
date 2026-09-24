import {
  createGameEngine,
  restoreGameEngine,
  getGameMetadata,
  getSupportedGameTypes,
  hasBotSupport,
  isRegisteredGameType,
  DEFAULT_GAME_TYPE,
} from '@/lib/game-registry'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { SpyGame } from '@/lib/games/spy-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { MemoryGame } from '@/lib/games/memory-game'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { LudoGame } from '@/lib/games/ludo-game'

describe('Game Registry', () => {
  describe('createGameEngine', () => {
    it('should create a Yahtzee game engine', () => {
      const engine = createGameEngine('yahtzee', 'test-123')
      expect(engine).toBeInstanceOf(YahtzeeGame)
      expect(engine.getState().gameType).toBe('yahtzee')
      expect(engine.getState().id).toBe('test-123')
    })

    it('should create a Spy game engine', () => {
      const engine = createGameEngine('guess_the_spy', 'spy-456')
      expect(engine).toBeInstanceOf(SpyGame)
      expect(engine.getState().gameType).toBe('guess_the_spy')
      expect(engine.getState().id).toBe('spy-456')
    })

    it('should create a Tic Tac Toe game engine', () => {
      const engine = createGameEngine('tic_tac_toe', 'ttt-789')
      expect(engine).toBeInstanceOf(TicTacToeGame)
      expect(engine.getState().gameType).toBe('ticTacToe')
      expect(engine.getState().id).toBe('ttt-789')
    })

    it('should create a Rock Paper Scissors game engine', () => {
      const engine = createGameEngine('rock_paper_scissors', 'rps-012')
      expect(engine).toBeInstanceOf(RockPaperScissorsGame)
      expect(engine.getState().gameType).toBe('rockPaperScissors')
      expect(engine.getState().id).toBe('rps-012')
    })

    it('should create a Memory game engine', () => {
      const engine = createGameEngine('memory', 'memory-345')
      expect(engine).toBeInstanceOf(MemoryGame)
      expect(engine.getState().gameType).toBe('memory')
      expect(engine.getState().id).toBe('memory-345')
    })

    it('should apply custom config when provided', () => {
      const engine = createGameEngine('yahtzee', 'test-cfg', {
        maxPlayers: 6,
        minPlayers: 2,
      })
      const config = engine.getConfig()
      expect(config.maxPlayers).toBe(6)
      expect(config.minPlayers).toBe(2)
    })

    it('should throw error for unknown game types', () => {
      expect(() => createGameEngine('unknown_game', 'test-unknown'))
        .toThrow('Unknown game type')
    })

    it('should create games in waiting status', () => {
      const engine = createGameEngine('yahtzee', 'wait-test')
      expect(engine.getState().status).toBe('waiting')
    })
  })

  describe('restoreGameEngine', () => {
    it('should restore a Yahtzee game from saved state', () => {
      const original = createGameEngine('yahtzee', 'restore-123')
      original.addPlayer({ id: 'p1', name: 'Player 1' })
      original.addPlayer({ id: 'p2', name: 'Player 2' })
      original.startGame()

      const savedState = original.getState()
      const restored = restoreGameEngine('yahtzee', 'restore-123', savedState)

      expect(restored).toBeInstanceOf(YahtzeeGame)
      expect(restored.getPlayers()).toHaveLength(2)
    })

    it('should restore a Spy game from saved state', () => {
      const original = createGameEngine('guess_the_spy', 'restore-spy')
      original.addPlayer({ id: 'p1', name: 'P1' })
      original.addPlayer({ id: 'p2', name: 'P2' })
      original.addPlayer({ id: 'p3', name: 'P3' })
      original.startGame()

      const savedState = original.getState()
      const restored = restoreGameEngine('guess_the_spy', 'restore-spy', savedState)

      expect(restored).toBeInstanceOf(SpyGame)
      expect(restored.getPlayers()).toHaveLength(3)
    })

    it('should restore Tic Tac Toe game state', () => {
      const original = createGameEngine('tic_tac_toe', 'restore-ttt')
      original.addPlayer({ id: 'p1', name: 'X' })
      original.addPlayer({ id: 'p2', name: 'O' })
      original.startGame()

      const savedState = original.getState()
      const restored = restoreGameEngine('tic_tac_toe', 'restore-ttt', savedState)

      expect(restored).toBeInstanceOf(TicTacToeGame)
      expect(restored.getState().status).toBe('playing')
    })

    it('should preserve custom game config when restoring from saved state', () => {
      const original = createGameEngine('yahtzee', 'restore-cfg', {
        maxPlayers: 6,
        minPlayers: 2,
        timeLimit: 12,
        rules: { targetRounds: 5, hardMode: true },
      })
      original.addPlayer({ id: 'p1', name: 'Player 1' })
      original.addPlayer({ id: 'p2', name: 'Player 2' })

      const savedState = original.getState()
      const restored = restoreGameEngine('yahtzee', 'restore-cfg', savedState)

      expect(restored.getConfig()).toEqual(original.getConfig())
      expect(restored.getConfig().maxPlayers).toBe(6)
      expect(restored.getConfig().rules).toEqual(
        expect.objectContaining({
          targetRounds: 5,
          hardMode: true,
        })
      )
    })

    it('should throw error for unknown game types', () => {
      expect(() => restoreGameEngine('unknown', 'id', {}))
        .toThrow('Unknown game type')
    })
  })

  describe('getGameMetadata', () => {
    it('should return correct metadata for Yahtzee', () => {
      const meta = getGameMetadata('yahtzee')
      expect(meta.type).toBe('yahtzee')
      expect(meta.name).toBe('Yahtzee')
      expect(meta.minPlayers).toBe(1)
      expect(meta.maxPlayers).toBe(4)
      expect(meta.supportsBots).toBe(true)
      expect(meta.translationKey).toBe('yahtzee')
    })

    it('should return correct metadata for Spy game', () => {
      const meta = getGameMetadata('guess_the_spy')
      expect(meta.type).toBe('guess_the_spy')
      expect(meta.name).toBe('Guess the Spy')
      expect(meta.minPlayers).toBe(3)
      expect(meta.maxPlayers).toBe(10)
      expect(meta.supportsBots).toBe(false)
    })

    it('should return correct metadata for Tic Tac Toe', () => {
      const meta = getGameMetadata('tic_tac_toe')
      expect(meta.type).toBe('tic_tac_toe')
      expect(meta.name).toBe('Tic Tac Toe')
      expect(meta.minPlayers).toBe(2)
      expect(meta.maxPlayers).toBe(2)
      expect(meta.supportsBots).toBe(true)
    })

    it('should return correct metadata for Rock Paper Scissors', () => {
      const meta = getGameMetadata('rock_paper_scissors')
      expect(meta.type).toBe('rock_paper_scissors')
      expect(meta.name).toBe('Rock Paper Scissors')
      expect(meta.minPlayers).toBe(2)
      expect(meta.maxPlayers).toBe(2)
      expect(meta.supportsBots).toBe(true)
    })

    it('should return correct metadata for Memory', () => {
      const meta = getGameMetadata('memory')
      expect(meta.type).toBe('memory')
      expect(meta.name).toBe('Memory')
      expect(meta.minPlayers).toBe(2)
      expect(meta.maxPlayers).toBe(4)
      expect(meta.supportsBots).toBe(true)
    })

    it('should throw error for unknown type', () => {
      expect(() => getGameMetadata('invalid_game' as any))
        .toThrow('Unknown game type')
    })
  })

  describe('getSupportedGameTypes', () => {
    it('should return all registered game types', () => {
      const types = getSupportedGameTypes()
      expect(types).toContain('yahtzee')
      expect(types).toContain('guess_the_spy')
      expect(types).toContain('tic_tac_toe')
      expect(types).toContain('rock_paper_scissors')
      expect(types).toContain('memory')
      expect(types.length).toBeGreaterThanOrEqual(5)
    })

    it('should return types as an array', () => {
      const types = getSupportedGameTypes()
      expect(Array.isArray(types)).toBe(true)
    })
  })

  describe('hasBotSupport', () => {
    it('should return true for games with bot support', () => {
      expect(hasBotSupport('yahtzee')).toBe(true)
      expect(hasBotSupport('tic_tac_toe')).toBe(true)
      expect(hasBotSupport('rock_paper_scissors')).toBe(true)
      expect(hasBotSupport('memory')).toBe(true)
    })

    it('should return false for games without bot support', () => {
      expect(hasBotSupport('guess_the_spy')).toBe(false)
    })

    it('should return false for unknown game types', () => {
      expect(hasBotSupport('unknown_game')).toBe(false)
    })
  })

  describe('isRegisteredGameType', () => {
    it('should return true for valid game types', () => {
      expect(isRegisteredGameType('yahtzee')).toBe(true)
      expect(isRegisteredGameType('guess_the_spy')).toBe(true)
      expect(isRegisteredGameType('tic_tac_toe')).toBe(true)
      expect(isRegisteredGameType('rock_paper_scissors')).toBe(true)
      expect(isRegisteredGameType('memory')).toBe(true)
    })

    it('should return false for invalid game types', () => {
      expect(isRegisteredGameType('chess')).toBe(false)
      expect(isRegisteredGameType('poker')).toBe(false)
      expect(isRegisteredGameType('')).toBe(false)
      expect(isRegisteredGameType('YAHTZEE')).toBe(false)
    })

    it('should handle malformed inputs', () => {
      expect(isRegisteredGameType(null as any)).toBe(false)
      expect(isRegisteredGameType(undefined as any)).toBe(false)
      expect(isRegisteredGameType(123 as any)).toBe(false)
    })
  })

  describe('DEFAULT_GAME_TYPE', () => {
    it('should be defined', () => {
      expect(DEFAULT_GAME_TYPE).toBeDefined()
    })

    it('should be a registered game type', () => {
      expect(isRegisteredGameType(DEFAULT_GAME_TYPE)).toBe(true)
    })

    it('should be yahtzee', () => {
      expect(DEFAULT_GAME_TYPE).toBe('yahtzee')
    })
  })

  describe('Game Engine Integration', () => {
    it('all games should be creatable via registry', () => {
      const types = getSupportedGameTypes()
      
      types.forEach(type => {
        const engine = createGameEngine(type, `test-${type}`)
        expect(engine).toBeDefined()
        expect(engine.getState().id).toBe(`test-${type}`)
      })
    })

    it('all games should have valid metadata', () => {
      const types = getSupportedGameTypes()
      
      types.forEach(type => {
        const meta = getGameMetadata(type)
        expect(meta.type).toBe(type)
        expect(meta.name).toBeTruthy()
        expect(meta.minPlayers).toBeGreaterThan(0)
        expect(meta.maxPlayers).toBeGreaterThanOrEqual(meta.minPlayers)
        expect(typeof meta.supportsBots).toBe('boolean')
        expect(meta.translationKey).toBeTruthy()
      })
    })

    it('game engine config should match metadata', () => {
      const types = getSupportedGameTypes()

      types.forEach(type => {
        const engine = createGameEngine(type, `config-${type}`)
        const meta = getGameMetadata(type)
        const config = engine.getConfig()

        expect(config.minPlayers).toBe(meta.minPlayers)
        expect(config.maxPlayers).toBe(meta.maxPlayers)
      })
    })
  })

  describe('Sketch & Guess is registered, not flag-gated (#1035)', () => {
    const FLAG_KEYS = ['ENABLE_SKETCH_AND_GUESS', 'NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS'] as const
    const originalEnv = process.env

    beforeEach(() => {
      // The whole point is that the game is there with the flag off, so this
      // suite proves the flag is off rather than assuming it.
      process.env = { ...originalEnv }
      for (const key of FLAG_KEYS) {
        delete process.env[key]
      }
    })

    afterAll(() => {
      process.env = originalEnv
    })

    it('builds an engine and answers the type guards without the flag', () => {
      expect(isRegisteredGameType('sketch_and_guess')).toBe(true)
      expect(getSupportedGameTypes()).toContain('sketch_and_guess')

      const engine = createGameEngine('sketch_and_guess', 'sketch-1035')
      expect(engine).toBeInstanceOf(SketchAndGuessGame)
      expect(engine.getState().id).toBe('sketch-1035')
    })

    it('carries the player range the lobby form is built from', () => {
      // Literals on purpose: reading these back off the module under test would
      // pass for any pair of numbers, and lib/game-catalog.ts's
      // lobbyCreateConfig.allowedPlayers is written against exactly 3 and 10.
      const meta = getGameMetadata('sketch_and_guess')
      expect(meta.minPlayers).toBe(3)
      expect(meta.maxPlayers).toBe(10)
      expect(meta.supportsBots).toBe(false)
      expect(meta.translationKey).toBe('guess_my_drawing')
      expect(hasBotSupport('sketch_and_guess')).toBe(false)
    })

    it('appears exactly once in the supported list', () => {
      // It used to be pushed in as an experimental type. Promoting it while
      // leaving that push in place would list it twice, and the analytics
      // coverage test iterates this list.
      const occurrences = getSupportedGameTypes().filter((type) => type === 'sketch_and_guess')
      expect(occurrences).toHaveLength(1)
    })
  })

  describe('Ludo (#1084)', () => {
    it('builds an engine with bots and the 2-4 seat range the create form offers', () => {
      const engine = createGameEngine('ludo', 'ludo-1084')
      expect(engine).toBeInstanceOf(LudoGame)
      const meta = getGameMetadata('ludo')
      expect(meta.minPlayers).toBe(2)
      expect(meta.maxPlayers).toBe(4)
      expect(meta.translationKey).toBe('ludo')
      expect(hasBotSupport('ludo')).toBe(true)
    })

    it('takes its mode from the lobby rules, quick by default', () => {
      expect((createGameEngine('ludo', 'ludo-quick') as LudoGame).getMode()).toBe('quick')
      expect((createGameEngine('ludo', 'ludo-classic', { rules: { mode: 'classic' } }) as LudoGame).getMode()).toBe('classic')
    })
  })
})
