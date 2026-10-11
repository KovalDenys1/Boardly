import {
  RockPaperScissorsGame,
  RockPaperScissorsGameData,
  RPSChoice,
  sanitizeRpsStateForBroadcast,
  RPS_ROUND_HOLD_MS,
} from '@/lib/games/rock-paper-scissors-game'
import { Move } from '@/lib/game-engine'

const createMove = (playerId: string, type: string, data: Record<string, unknown>): Move => ({
  type,
  playerId,
  data,
  timestamp: new Date(),
})

const createChoiceMove = (playerId: string, choice: unknown): Move =>
  createMove(playerId, 'submit-choice', { choice })

const dataOfState = (state: ReturnType<RockPaperScissorsGame['getState']>): RockPaperScissorsGameData =>
  state.data as RockPaperScissorsGameData

const addDefaultPlayers = (game: RockPaperScissorsGame): void => {
  game.addPlayer({ id: 'player1', name: 'Player 1' })
  game.addPlayer({ id: 'player2', name: 'Player 2' })
}

const submitChoice = (game: RockPaperScissorsGame, playerId: string, choice: RPSChoice): void => {
  game.processMove(createChoiceMove(playerId, choice))
}

describe('RockPaperScissorsGame', () => {
  let game: RockPaperScissorsGame

  beforeEach(() => {
    game = new RockPaperScissorsGame('test-game')
    addDefaultPlayers(game)
  })

  describe('Initialization', () => {
    it('creates game with default best-of-3 mode', () => {
      const state = game.getState()
      expect(dataOfState(state).mode).toBe('best-of-3')
      expect(dataOfState(state).rounds).toEqual([])
      expect(dataOfState(state).playerChoices).toEqual({})
      expect(dataOfState(state).playersReady).toEqual([])
      expect(dataOfState(state).scores).toEqual({})
      expect(dataOfState(state).gameWinner).toBeNull()
      expect(state.gameType).toBe('rockPaperScissors')
    })
  })

  describe('Player Management', () => {
    it('requires at least 2 players to start', () => {
      const gameWithOne = new RockPaperScissorsGame('test-one-player')
      gameWithOne.addPlayer({ id: 'p1', name: 'P1' })
      expect(gameWithOne.startGame()).toBe(false)
    })

    it('starts with 2 players', () => {
      expect(game.startGame()).toBe(true)
      expect(game.getState().status).toBe('playing')
    })

    it('does not allow more than 2 players', () => {
      expect(game.addPlayer({ id: 'p3', name: 'P3' })).toBe(false)
      expect(game.getPlayers()).toHaveLength(2)
    })
  })

  describe('Move Validation', () => {
    beforeEach(() => {
      game.startGame()
    })

    it.each(['rock', 'paper', 'scissors'] as const)('accepts valid choice %s', (choice) => {
      expect(game.validateMove(createChoiceMove('player1', choice))).toBe(true)
    })

    it('rejects invalid choice', () => {
      expect(game.validateMove(createChoiceMove('player1', 'invalid'))).toBe(false)
    })

    it('rejects move from unknown player', () => {
      expect(game.validateMove(createChoiceMove('unknown', 'rock'))).toBe(false)
    })

    it('rejects duplicate submission in the same round', () => {
      submitChoice(game, 'player1', 'rock')
      expect(game.validateMove(createChoiceMove('player1', 'paper'))).toBe(false)
    })

    it('rejects invalid move type', () => {
      expect(game.validateMove(createMove('player1', 'roll', {}))).toBe(false)
    })

    it('rejects moves after game is finished', () => {
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')
      submitChoice(game, 'player1', 'paper')
      submitChoice(game, 'player2', 'rock')

      expect(game.getState().status).toBe('finished')
      expect(game.validateMove(createChoiceMove('player1', 'rock'))).toBe(false)
    })
  })

  describe('Round Resolution', () => {
    beforeEach(() => {
      game.startGame()
    })

    it.each([
      ['rock', 'scissors', 'player1'],
      ['scissors', 'paper', 'player1'],
      ['paper', 'rock', 'player1'],
      ['rock', 'paper', 'player2'],
      ['paper', 'scissors', 'player2'],
      ['scissors', 'rock', 'player2'],
    ] as const)('resolves %s vs %s winner=%s', (p1, p2, expectedWinner) => {
      submitChoice(game, 'player1', p1)
      submitChoice(game, 'player2', p2)

      const state = game.getState()
      expect(dataOfState(state).rounds).toHaveLength(1)
      expect(dataOfState(state).rounds[0].winner).toBe(expectedWinner)
    })

    it('handles draw correctly', () => {
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'rock')

      const state = game.getState()
      expect(dataOfState(state).rounds[0].winner).toBe('draw')
      expect(dataOfState(state).scores.player1).toBe(0)
      expect(dataOfState(state).scores.player2).toBe(0)
    })

    it('resets current round choices after round completion if game continues', () => {
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')

      const state = game.getState()
      expect(dataOfState(state).playerChoices).toEqual({
        player1: null,
        player2: null,
      })
      expect(dataOfState(state).playersReady).toEqual([])
    })

    it('preserves round history across rounds', () => {
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')
      submitChoice(game, 'player1', 'paper')
      submitChoice(game, 'player2', 'paper')

      const state = game.getState()
      expect(dataOfState(state).rounds).toHaveLength(2)
      expect(dataOfState(state).rounds[0].winner).toBe('player1')
      expect(dataOfState(state).rounds[1].winner).toBe('draw')
    })
  })

  describe('Game Completion', () => {
    beforeEach(() => {
      game.startGame()
    })

    it('finishes best-of-3 when one player reaches 2 wins', () => {
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')
      submitChoice(game, 'player1', 'paper')
      submitChoice(game, 'player2', 'rock')

      const state = game.getState()
      expect(state.status).toBe('finished')
      expect(dataOfState(state).gameWinner).toBe('player1')
      expect(dataOfState(state).scores.player1).toBe(2)
    })

    it('supports best-of-5 mode and requires 3 wins', () => {
      const state = game.getState()
      dataOfState(state).mode = 'best-of-5'
      game.restoreState(state)

      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')
      submitChoice(game, 'player1', 'paper')
      submitChoice(game, 'player2', 'rock')

      expect(game.getState().status).toBe('playing')

      submitChoice(game, 'player1', 'scissors')
      submitChoice(game, 'player2', 'paper')

      const finishedState = game.getState()
      expect(finishedState.status).toBe('finished')
      expect(dataOfState(finishedState).gameWinner).toBe('player1')
      expect(dataOfState(finishedState).scores.player1).toBe(3)
    })

    it('does not finish on draw-only rounds', () => {
      for (let i = 0; i < 4; i += 1) {
        submitChoice(game, 'player1', 'rock')
        submitChoice(game, 'player2', 'rock')
      }

      const state = game.getState()
      expect(state.status).toBe('playing')
      expect(dataOfState(state).gameWinner).toBeNull()
      expect(dataOfState(state).rounds).toHaveLength(4)
    })
  })

  describe('Rules and Persistence', () => {
    it('returns expected game rules', () => {
      const rules = game.getGameRules()
      expect(rules).toHaveLength(5)
      expect(rules[0]).toContain('Both players')
      expect(rules[1]).toContain('Rock beats Scissors')
    })

    it('restores state correctly', () => {
      game.startGame()
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')

      const originalState = game.getState()
      const restored = new RockPaperScissorsGame('restored-game')
      restored.restoreState(originalState)

      const restoredState = restored.getState()
      expect(dataOfState(restoredState).scores).toEqual(dataOfState(originalState).scores)
      expect(dataOfState(restoredState).rounds).toEqual(dataOfState(originalState).rounds)
      expect(dataOfState(restoredState).gameWinner).toEqual(dataOfState(originalState).gameWinner)
    })
  })

  describe('sanitizeRpsStateForBroadcast (#652 choice-leak fix)', () => {
    it('hides the first submitter\'s choice from other viewers while the opponent has not yet moved', () => {
      game.startGame()
      submitChoice(game, 'player1', 'rock')

      const sanitized = sanitizeRpsStateForBroadcast(game.getState()) as ReturnType<RockPaperScissorsGame['getState']>
      expect(dataOfState(sanitized).playerChoices.player1).toBeNull()
      expect(dataOfState(sanitized).playerChoices.player2).toBeNull()
      // playersReady (the safe "submitted" signal) is untouched
      expect(dataOfState(sanitized).playersReady).toEqual(['player1'])
    })

    it('keeps the submitting viewer\'s own pending choice visible to themselves', () => {
      game.startGame()
      submitChoice(game, 'player1', 'rock')

      const sanitized = sanitizeRpsStateForBroadcast(
        game.getState(),
        'player1'
      ) as ReturnType<RockPaperScissorsGame['getState']>
      expect(dataOfState(sanitized).playerChoices.player1).toBe('rock')
      expect(dataOfState(sanitized).playerChoices.player2).toBeNull()
    })

    it('does not redact once both players have submitted and the round resolved', () => {
      game.startGame()
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')

      const state = game.getState()
      const sanitized = sanitizeRpsStateForBroadcast(state) as ReturnType<RockPaperScissorsGame['getState']>
      // Round resolved and reset for the next round — nothing sensitive left to hide
      expect(sanitized).toEqual(state)
    })

    it('does not redact the final round once the game has finished', () => {
      game.startGame()
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')
      submitChoice(game, 'player1', 'paper')
      submitChoice(game, 'player2', 'rock')

      const state = game.getState()
      expect(state.status).toBe('finished')
      const sanitized = sanitizeRpsStateForBroadcast(state) as ReturnType<RockPaperScissorsGame['getState']>
      expect(sanitized).toEqual(state)
    })

    it('passes through untouched state with no data', () => {
      const bare = { status: 'waiting' }
      expect(sanitizeRpsStateForBroadcast(bare)).toBe(bare)
    })
  })

  describe('Win Condition API', () => {
    it('returns null when game has no winner yet', () => {
      game.startGame()
      expect(game.checkWinCondition()).toBeNull()
    })

    it('returns player object when game has winner', () => {
      game.startGame()
      submitChoice(game, 'player1', 'rock')
      submitChoice(game, 'player2', 'scissors')
      submitChoice(game, 'player1', 'paper')
      submitChoice(game, 'player2', 'rock')

      const winner = game.checkWinCondition()
      expect(winner).not.toBeNull()
      expect(winner?.id).toBe('player1')
    })
  })
})

describe('RockPaperScissorsGame round boundary (#1365)', () => {
  let game: RockPaperScissorsGame
  let now: jest.SpyInstance<number, []>

  beforeEach(() => {
    now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    game = new RockPaperScissorsGame('boundary-game')
    addDefaultPlayers(game)
    game.startGame()
  })

  afterEach(() => {
    now.mockRestore()
  })

  it('stamps when the next round opens, a hold after the reveal, and starts the round clock there', () => {
    expect(game.makeMove(createChoiceMove('player1', 'rock'))).toBe(true)
    now.mockReturnValue(1_000_400)
    expect(game.makeMove(createChoiceMove('player2', 'scissors'))).toBe(true)

    const data = dataOfState(game.getState())
    expect(RPS_ROUND_HOLD_MS).toBeGreaterThanOrEqual(2_000)
    expect(data.nextRoundAt).toBe(1_000_400 + RPS_ROUND_HOLD_MS)
    expect(game.getState().turnStartedAt).toBe(data.nextRoundAt)
  })

  it('stamps no next round once the match is decided', () => {
    for (let round = 0; round < 2; round += 1) {
      game.makeMove(createChoiceMove('player1', 'rock'))
      game.makeMove(createChoiceMove('player2', 'scissors'))
    }

    expect(game.getState().status).toBe('finished')
    expect(dataOfState(game.getState()).nextRoundAt).toBeNull()
  })
})
