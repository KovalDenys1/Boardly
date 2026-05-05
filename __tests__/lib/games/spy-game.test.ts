import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'

const mockLocations = [
  {
    name: 'Airport',
    category: 'Travel',
    roles: ['Pilot', 'Flight Attendant', 'Security Guard', 'Passenger'],
  },
  {
    name: 'Hospital',
    category: 'Public',
    roles: ['Doctor', 'Nurse', 'Patient', 'Surgeon'],
  },
]

describe('SpyGame', () => {
  let game: SpyGame

  beforeEach(() => {
    game = new SpyGame('test-game-123')
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

    it('should assign spy and roles when initializing round', () => {
      game.initializeRound(mockLocations)

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

    it('should start in role reveal phase after initialization', () => {
      game.initializeRound(mockLocations)

      const state = game.getState()
      const data = state.data as any

      expect(data.phase).toBe(SpyGamePhase.ROLE_REVEAL)
    })

    it('should advance round and preserve scores when re-initialized from results', () => {
      game.initializeRound(mockLocations)

      const state = game.getState()
      const data = state.data as any

      data.phase = SpyGamePhase.RESULTS
      data.currentRound = 1
      data.scores = {
        p1: 150,
        p2: 80,
        p3: 30,
        p4: 10,
      }

      game.initializeRound(mockLocations)

      const nextState = game.getState()
      const nextData = nextState.data as any

      expect(nextData.currentRound).toBe(2)
      expect(nextData.phase).toBe(SpyGamePhase.ROLE_REVEAL)
      expect(nextData.scores).toEqual({
        p1: 150,
        p2: 80,
        p3: 30,
        p4: 10,
      })
    })
  })

  describe('Move Validation', () => {
    beforeEach(() => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.startGame()
      game.initializeRound(mockLocations)
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

  describe('Questioning Phase', () => {
    beforeEach(() => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.startGame()
      game.initializeRound(mockLocations)
      // Advance all players to ready so questioning phase starts
      game.makeMove({ playerId: 'p1', type: 'player-ready', data: {}, timestamp: new Date() })
      game.makeMove({ playerId: 'p2', type: 'player-ready', data: {}, timestamp: new Date() })
      game.makeMove({ playerId: 'p3', type: 'player-ready', data: {}, timestamp: new Date() })
    })

    it('enters questioning phase once all players are ready', () => {
      const data = game.getState().data as any
      expect(data.phase).toBe(SpyGamePhase.QUESTIONING)
      expect(data.currentQuestionerId).toBe('p1')
      expect(data.currentTargetId).toBeNull()
    })

    it('questioner can ask a question to another player', () => {
      const data = game.getState().data as any
      const questionerId = data.currentQuestionerId as string
      const targetId = ['p1', 'p2', 'p3'].find((id) => id !== questionerId)!

      expect(
        game.makeMove({
          playerId: questionerId,
          type: 'ask-question',
          data: { targetId, question: 'What do you do here?' },
          timestamp: new Date(),
        })
      ).toBe(true)

      const after = game.getState().data as any
      expect(after.currentTargetId).toBe(targetId)
      expect(after.pendingQuestion).toBe('What do you do here?')
    })

    it('rejects ask-question when player tries to ask themselves', () => {
      const data = game.getState().data as any
      const questionerId = data.currentQuestionerId as string

      expect(
        game.validateMove({
          playerId: questionerId,
          type: 'ask-question',
          data: { targetId: questionerId, question: 'Can I ask myself?' },
          timestamp: new Date(),
        })
      ).toBe(false)
    })

    it('target answers the question and move goes to question history', () => {
      const data = game.getState().data as any
      const questionerId = data.currentQuestionerId as string
      const targetId = ['p1', 'p2', 'p3'].find((id) => id !== questionerId)!

      game.makeMove({
        playerId: questionerId,
        type: 'ask-question',
        data: { targetId, question: 'What is your role?' },
        timestamp: new Date(),
      })

      expect(
        game.makeMove({
          playerId: targetId,
          type: 'answer-question',
          data: { answer: 'I work here every day.' },
          timestamp: new Date(),
        })
      ).toBe(true)

      const after = game.getState().data as any
      expect(after.questionHistory).toHaveLength(1)
      expect(after.questionHistory[0].question).toBe('What is your role?')
      expect(after.questionHistory[0].answer).toBe('I work here every day.')
      expect(after.pendingQuestion).toBeNull()
    })

    it('non-target cannot answer the question', () => {
      const data = game.getState().data as any
      const questionerId = data.currentQuestionerId as string
      const players = ['p1', 'p2', 'p3']
      const targetId = players.find((id) => id !== questionerId)!
      const thirdId = players.find((id) => id !== questionerId && id !== targetId)!

      game.makeMove({
        playerId: questionerId,
        type: 'ask-question',
        data: { targetId, question: 'What do you do?' },
        timestamp: new Date(),
      })

      expect(
        game.validateMove({
          playerId: thirdId,
          type: 'answer-question',
          data: { answer: 'I am not the target.' },
          timestamp: new Date(),
        })
      ).toBe(false)
    })

    it('skip-turn advances to the next questioner without adding to history', () => {
      const dataBefore = game.getState().data as any
      const firstQuestioner = dataBefore.currentQuestionerId as string

      expect(
        game.makeMove({
          playerId: firstQuestioner,
          type: 'skip-turn',
          data: {},
          timestamp: new Date(),
        })
      ).toBe(true)

      const after = game.getState().data as any
      expect(after.currentQuestionerId).not.toBe(firstQuestioner)
      expect(after.questionHistory).toHaveLength(0)
    })

    it('non-questioner cannot skip their turn', () => {
      const data = game.getState().data as any
      const questionerId = data.currentQuestionerId as string
      const nonQuestioner = ['p1', 'p2', 'p3'].find((id) => id !== questionerId)!

      expect(
        game.validateMove({
          playerId: nonQuestioner,
          type: 'skip-turn',
          data: {},
          timestamp: new Date(),
        })
      ).toBe(false)
    })

    it('start-voting transitions immediately to VOTING phase', () => {
      expect(
        game.makeMove({
          playerId: 'p1',
          type: 'start-voting',
          data: {},
          timestamp: new Date(),
        })
      ).toBe(true)

      const data = game.getState().data as any
      expect(data.phase).toBe(SpyGamePhase.VOTING)
      expect(data.votes).toEqual({})
    })

    it('start-voting is rejected outside QUESTIONING phase', () => {
      // Still in ROLE_REVEAL (fresh game, players not yet ready)
      const freshGame = new SpyGame('fresh')
      freshGame.addPlayer({ id: 'p1', name: 'Player 1' })
      freshGame.addPlayer({ id: 'p2', name: 'Player 2' })
      freshGame.addPlayer({ id: 'p3', name: 'Player 3' })
      freshGame.startGame()
      freshGame.initializeRound(mockLocations)

      expect(
        freshGame.validateMove({
          playerId: 'p1',
          type: 'start-voting',
          data: {},
          timestamp: new Date(),
        })
      ).toBe(false)
    })
  })

  describe('Role Information', () => {
    beforeEach(() => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.startGame()
      game.initializeRound(mockLocations)
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
    beforeEach(() => {
      game.addPlayer({ id: 'p1', name: 'Player 1' })
      game.addPlayer({ id: 'p2', name: 'Player 2' })
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.startGame()
      game.initializeRound(mockLocations)
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

    it('should mark game as finished after final-round voting resolves', () => {
      const state = game.getState()
      const data = state.data as any

      data.phase = SpyGamePhase.VOTING
      data.currentRound = data.totalRounds
      data.spyPlayerId = 'p1'
      data.scores = { p1: 0, p2: 10, p3: 0 }
      data.votes = {}

      expect(
        game.makeMove({
          playerId: 'p1',
          type: 'vote',
          data: { targetId: 'p2' },
          timestamp: new Date(),
        })
      ).toBe(true)

      expect(
        game.makeMove({
          playerId: 'p2',
          type: 'vote',
          data: { targetId: 'p1' },
          timestamp: new Date(),
        })
      ).toBe(true)

      expect(
        game.makeMove({
          playerId: 'p3',
          type: 'vote',
          data: { targetId: 'p1' },
          timestamp: new Date(),
        })
      ).toBe(true)

      const finalState = game.getState()
      expect(finalState.status).toBe('finished')
      expect(finalState.winner).toBeTruthy()
      expect((finalState.data as any).phase).toBe(SpyGamePhase.RESULTS)
    })

    it('treats tied max votes as no elimination so the spy escapes', () => {
      game.addPlayer({ id: 'p4', name: 'Player 4' })
      game.startGame()
      game.initializeRound(mockLocations)

      const state = game.getState()
      const data = state.data as any

      data.phase = SpyGamePhase.VOTING
      data.currentRound = data.totalRounds
      data.spyPlayerId = 'p1'
      data.scores = { p1: 0, p2: 0, p3: 0, p4: 0 }
      data.votes = {}

      // 2-2 tie between spy (p1) and p2.
      // Vote order intentionally inserts spy target first to catch previous "first max wins" behavior.
      expect(
        game.makeMove({
          playerId: 'p2',
          type: 'vote',
          data: { targetId: 'p1' },
          timestamp: new Date(),
        })
      ).toBe(true)
      expect(
        game.makeMove({
          playerId: 'p1',
          type: 'vote',
          data: { targetId: 'p2' },
          timestamp: new Date(),
        })
      ).toBe(true)
      expect(
        game.makeMove({
          playerId: 'p3',
          type: 'vote',
          data: { targetId: 'p1' },
          timestamp: new Date(),
        })
      ).toBe(true)
      expect(
        game.makeMove({
          playerId: 'p4',
          type: 'vote',
          data: { targetId: 'p2' },
          timestamp: new Date(),
        })
      ).toBe(true)

      const finalState = game.getState()
      const finalData = finalState.data as any

      expect(finalData.phase).toBe(SpyGamePhase.RESULTS)
      // Spy escapes on tie: +300 spy points, regulars do not receive regular-win bonus.
      expect(finalData.scores).toEqual({
        p1: 290, // +300 spy win, -10 incorrect vote
        p2: 50,  // correct vote bonus only
        p3: 50,  // correct vote bonus only
        p4: -10, // incorrect vote penalty
      })
      expect(finalState.status).toBe('finished')
      expect(finalState.winner).toBe('p1')
    })
  })
})
