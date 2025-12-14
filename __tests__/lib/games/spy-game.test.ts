import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'
import { prisma } from '@/lib/db'

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    spyLocation: {
      findMany: jest.fn(),
    },
  },
}))

describe('SpyGame', () => {
  let game: SpyGame

  beforeEach(() => {
    game = new SpyGame('test-game-123')
    
    // Mock locations
    ;(prisma.spyLocation.findMany as jest.Mock).mockResolvedValue([
      {
        id: '1',
        name: 'Airport',
        category: 'Travel',
        roles: ['Pilot', 'Flight Attendant', 'Security Guard', 'Passenger'],
        isActive: true,
      },
      {
        id: '2',
        name: 'Hospital',
        category: 'Public',
        roles: ['Doctor', 'Nurse', 'Patient', 'Surgeon'],
        isActive: true,
      },
    ])
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should create a new spy game with correct initial state', () => {
      const state = game.getState()
      expect(state.gameType).toBe('guess_the_spy')
      expect(state.status).toBe('waiting')
      expect(state.players).toEqual([])
    })

    it('should have correct game config', () => {
      const config = game.getConfig()
      expect(config.maxPlayers).toBe(10)
      expect(config.minPlayers).toBe(3)
    })

    it('should initialize with correct game data', () => {
      const state = game.getState()
      const data = state.data as any
      
      expect(data.phase).toBe(SpyGamePhase.WAITING)
      expect(data.currentRound).toBe(1)
      expect(data.totalRounds).toBe(3)
      expect(data.questionHistory).toEqual([])
      expect(data.votes).toEqual({})
    })
  })

  describe('Player Management', () => {
    it('should add players up to max limit', () => {
      for (let i = 1; i <= 10; i++) {
        const added = game.addPlayer({
          id: `player${i}`,
          name: `Player ${i}`,
        })
        expect(added).toBe(true)
      }

      const players = game.getPlayers()
      expect(players).toHaveLength(10)

      // Should not add 11th player
      const added = game.addPlayer({
        id: 'player11',
        name: 'Player 11',
      })
      expect(added).toBe(false)
    })

    it('should require minimum 3 players to start', () => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })

      const started = game.startGame()
      expect(started).toBe(false)

      game.addPlayer({ id: 'p3', name: 'Player 3' })
      const started2 = game.startGame()
      expect(started2).toBe(true)
    })
  })

  describe('Round Initialization', () => {
    beforeEach(() => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.addPlayer({ id: 'p4', name: 'Player 4' })
      game.startGame()
    })

    it('should assign spy and roles when initializing round', async () => {
      await game.initializeRound()

      const state = game.getState()
      const data = state.data as any

      // Should have selected a location
      expect(data.location).toBeTruthy()
      expect(data.locationCategory).toBeTruthy()

      // Should have assigned spy
      expect(data.spyPlayerId).toBeTruthy()

      // Should have assigned roles to all players
      expect(Object.keys(data.playerRoles)).toHaveLength(4)
      
      // Spy should have "Spy" role
      expect(data.playerRoles[data.spyPlayerId]).toBe('Spy')

      // Other players should have specific roles
      const nonSpyRoles = Object.entries(data.playerRoles)
        .filter(([playerId]) => playerId !== data.spyPlayerId)
        .map(([, role]) => role)
      
      nonSpyRoles.forEach((role) => {
        expect(role).not.toBe('Spy')
        expect(role).toBeTruthy()
      })
    })

    it('should start in role reveal phase after initialization', async () => {
      await game.initializeRound()

      const state = game.getState()
      const data = state.data as any

      expect(data.phase).toBe(SpyGamePhase.ROLE_REVEAL)
    })
  })

  describe('Move Validation', () => {
    beforeEach(async () => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.startGame()
      await game.initializeRound()
    })

    it('should accept player-ready move during role reveal phase', () => {
      const move = {
        playerId: 'p1',
        type: 'player-ready',
        data: {},
        timestamp: new Date(),
      }

      expect(game.validateMove(move)).toBe(true)
    })

    it('should reject invalid move type', () => {
      const move = {
        playerId: 'p1',
        type: 'invalid-move',
        data: {},
        timestamp: new Date(),
      }

      expect(game.validateMove(move)).toBe(false)
    })

    it('should reject move from non-existent player', () => {
      const move = {
        playerId: 'non-existent',
        type: 'player-ready',
        data: {},
        timestamp: new Date(),
      }

      expect(game.validateMove(move)).toBe(false)
    })
  })

  describe('Role Information', () => {
    beforeEach(async () => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.startGame()
      await game.initializeRound()
    })

    it('should show location and role to regular players', () => {
      const state = game.getState()
      const data = state.data as any

      const regularPlayer = Object.keys(data.playerRoles).find(
        (id) => id !== data.spyPlayerId
      )

      if (regularPlayer) {
        const roleInfo = game.getRoleInfoForPlayer(regularPlayer)

        expect(roleInfo.role).toBe('Regular Player')
        expect(roleInfo.location).toBeTruthy()
        expect(roleInfo.locationRole).toBeTruthy()
        expect(roleInfo.possibleCategories).toBeUndefined()
      }
    })

    it('should show only categories to spy', () => {
      const state = game.getState()
      const data = state.data as any

      const roleInfo = game.getRoleInfoForPlayer(data.spyPlayerId)

      expect(roleInfo.role).toBe('Spy')
      expect(roleInfo.location).toBeUndefined()
      expect(roleInfo.locationRole).toBeUndefined()
      expect(roleInfo.possibleCategories).toBeTruthy()
      expect(roleInfo.possibleCategories).toContain('Travel')
    })
  })

  describe('Game Rules', () => {
    it('should return correct game rules', () => {
      const rules = game.getGameRules()

      expect(rules).toHaveLength(8)
      expect(rules[0]).toContain('3-10 players')
      expect(rules[1]).toContain('randomly assigned')
      expect(rules[2]).toContain('location')
    })
  })

  describe('Win Condition', () => {
    beforeEach(async () => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.startGame()
      await game.initializeRound()
    })

    it('should not have winner before all rounds complete', () => {
      const winner = game.checkWinCondition()
      expect(winner).toBeNull()
    })

    it('should determine winner after all rounds', () => {
      const state = game.getState()
      const data = state.data as any

      // Simulate completing all rounds
      data.currentRound = 3
      data.phase = SpyGamePhase.RESULTS
      data.scores = {
        p1: 150,
        p2: 300,
        p3: 100,
      }

      const winner = game.checkWinCondition()
      expect(winner).toBeTruthy()
      expect(winner?.id).toBe('p2') // Highest score
    })
  })
})
