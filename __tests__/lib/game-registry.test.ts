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
      expect(meta.icon).toBe('🎲')
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
      expect(types).toHaveLength(4)
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
        expect(meta.icon).toBeTruthy()
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
})
