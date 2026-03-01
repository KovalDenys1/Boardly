import { Move } from '@/lib/game-engine'
import {
  TelephoneDoodleGame,
  TelephoneDoodleGameData,
  TelephoneDoodleStepPhase,
} from '@/lib/games/telephone-doodle-game'

const createMove = (playerId: string, type: string, data: Record<string, unknown>): Move => ({
  type,
  playerId,
  data,
  timestamp: new Date(),
})

const dataOfState = (
  state: ReturnType<TelephoneDoodleGame['getState']>
): TelephoneDoodleGameData => state.data as TelephoneDoodleGameData

const addDefaultPlayers = (game: TelephoneDoodleGame): void => {
  game.addPlayer({ id: 'player1', name: 'Player 1' })
  game.addPlayer({ id: 'player2', name: 'Player 2' })
  game.addPlayer({ id: 'player3', name: 'Player 3' })
}

const TEST_PLAYERS = ['player1', 'player2', 'player3'] as const
const STEP_PHASES: TelephoneDoodleStepPhase[] = ['prompt', 'drawing', 'caption']

function resolveExpectedChainId(
  playerId: string,
  phase: TelephoneDoodleStepPhase,
  round: number,
): string {
  const playerIndex = TEST_PLAYERS.indexOf(playerId as (typeof TEST_PLAYERS)[number])
  const phaseOffset = STEP_PHASES.indexOf(phase)
  const totalOffset = phaseOffset + (round - 1) * STEP_PHASES.length
  const chainIndex = (playerIndex + totalOffset) % TEST_PLAYERS.length
  return `chain-${TEST_PLAYERS[chainIndex]}`
}

const submitStep = (game: TelephoneDoodleGame, playerId: string, chainId: string, content: string): void => {
  game.processMove(
    createMove(playerId, 'submit-step', {
      chainId,
      content,
    })
  )
}

const submitPhase = (
  game: TelephoneDoodleGame,
  phase: TelephoneDoodleStepPhase,
  round: number,
): void => {
  for (const playerId of TEST_PLAYERS) {
    submitStep(
      game,
      playerId,
      resolveExpectedChainId(playerId, phase, round),
      `${phase}-${round}-${playerId}`,
    )
  }
}

describe('TelephoneDoodleGame (MVP scaffold)', () => {
  let game: TelephoneDoodleGame

  beforeEach(() => {
    game = new TelephoneDoodleGame('telephone-test')
    addDefaultPlayers(game)
  })

  it('initializes phase and chains on start', () => {
    expect(game.startGame()).toBe(true)

    const state = game.getState()
    const data = dataOfState(state)
    expect(data.phase).toBe('prompt')
    expect(data.chains).toHaveLength(3)
    expect(data.chains.map((chain) => chain.id)).toEqual([
      'chain-player1',
      'chain-player2',
      'chain-player3',
    ])
    expect(data.isMvpScaffold).toBe(true)
  })

  it('rejects duplicate submit-step from same player in same phase', () => {
    game.startGame()

    const firstSubmit = createMove('player1', 'submit-step', {
      chainId: resolveExpectedChainId('player1', 'prompt', 1),
      content: 'Secret prompt',
    })
    const duplicateSubmit = createMove('player1', 'submit-step', {
      chainId: resolveExpectedChainId('player1', 'prompt', 1),
      content: 'Another prompt',
    })

    expect(game.validateMove(firstSubmit)).toBe(true)
    game.processMove(firstSubmit)
    expect(game.validateMove(duplicateSubmit)).toBe(false)
  })

  it('requires non-empty content with minimum length', () => {
    game.startGame()

    const assignedChainId = resolveExpectedChainId('player1', 'prompt', 1)

    expect(
      game.validateMove(
        createMove('player1', 'submit-step', {
          chainId: assignedChainId,
          content: '',
        })
      )
    ).toBe(false)

    expect(
      game.validateMove(
        createMove('player1', 'submit-step', {
          chainId: assignedChainId,
          content: 'ok',
        })
      )
    ).toBe(false)

    expect(
      game.validateMove(
        createMove('player1', 'submit-step', {
          chainId: assignedChainId,
          content: 'Valid content',
        })
      )
    ).toBe(true)
  })

  it('progresses through prompt -> drawing -> caption -> reveal -> finished', () => {
    game.startGame()

    submitPhase(game, 'prompt', 1)
    expect(dataOfState(game.getState()).phase).toBe('drawing')

    submitPhase(game, 'drawing', 1)
    expect(dataOfState(game.getState()).phase).toBe('caption')

    submitPhase(game, 'caption', 1)
    expect(dataOfState(game.getState()).phase).toBe('reveal')

    game.processMove(createMove('player1', 'advance-reveal', {}))
    game.processMove(createMove('player2', 'advance-reveal', {}))
    expect(game.getState().status).toBe('playing')
    game.processMove(createMove('player3', 'advance-reveal', {}))
    expect(game.getState().status).toBe('finished')
  })

  it('rejects submit-step when player targets a non-assigned chain', () => {
    game.startGame()

    const invalidMove = createMove('player1', 'submit-step', {
      chainId: 'chain-player2',
      content: 'Wrong chain',
    })

    expect(game.validateMove(invalidMove)).toBe(false)
  })

  it('loops rounds before reveal when maxRounds is greater than 1', () => {
    const twoRoundGame = new TelephoneDoodleGame('telephone-test-rounds', {
      maxPlayers: 12,
      minPlayers: 3,
      rules: { maxRounds: 2 },
    })
    addDefaultPlayers(twoRoundGame)
    expect(twoRoundGame.startGame()).toBe(true)

    submitPhase(twoRoundGame, 'prompt', 1)
    submitPhase(twoRoundGame, 'drawing', 1)
    submitPhase(twoRoundGame, 'caption', 1)
    expect(dataOfState(twoRoundGame.getState()).phase).toBe('prompt')
    expect(dataOfState(twoRoundGame.getState()).round).toBe(2)

    submitPhase(twoRoundGame, 'prompt', 2)
    submitPhase(twoRoundGame, 'drawing', 2)
    submitPhase(twoRoundGame, 'caption', 2)
    expect(dataOfState(twoRoundGame.getState()).phase).toBe('reveal')
    expect(dataOfState(twoRoundGame.getState()).round).toBe(2)
  })

  it('exposes assigned chain and pending players for reconnect-safe clients', () => {
    expect(game.startGame()).toBe(true)

    expect(game.getAssignedChainIdForPlayer('player2')).toBe('chain-player2')
    expect(game.getPendingPlayerIdsForCurrentStep()).toEqual(['player1', 'player2', 'player3'])

    submitStep(game, 'player1', resolveExpectedChainId('player1', 'prompt', 1), 'Prompt by player1')
    expect(game.getPendingPlayerIdsForCurrentStep()).toEqual(['player2', 'player3'])
  })

  it('auto-submits missing players and advances phase when timeout expires', () => {
    expect(game.startGame()).toBe(true)

    submitStep(game, 'player1', resolveExpectedChainId('player1', 'prompt', 1), 'Prompt by player1')
    const phaseStartAt = game.getState().lastMoveAt as number

    const timeoutResult = game.applyTimeoutFallback(30, phaseStartAt + 30_000)
    const state = game.getState()
    const data = dataOfState(state)

    expect(timeoutResult.changed).toBe(true)
    expect(timeoutResult.timeoutWindowsConsumed).toBe(1)
    expect(timeoutResult.phaseTransitions).toBe(1)
    expect(timeoutResult.autoSubmittedSteps).toBe(2)
    expect(data.phase).toBe('drawing')
    expect(data.submittedPlayerIds).toEqual([])
    expect(state.lastMoveAt).toBe(phaseStartAt + 30_000)

    const autoPromptSteps = data.chains
      .flatMap((chain) => chain.steps)
      .filter((step) => step.round === 1 && step.phase === 'prompt' && step.autoSubmitted)

    expect(autoPromptSteps).toHaveLength(2)
    expect(autoPromptSteps.map((step) => step.playerId).sort()).toEqual(['player2', 'player3'])
  })

  it('consumes multiple timeout windows and auto-transitions through all step phases', () => {
    expect(game.startGame()).toBe(true)

    const phaseStartAt = game.getState().lastMoveAt as number
    const timeoutResult = game.applyTimeoutFallback(30, phaseStartAt + 90_000)
    const data = dataOfState(game.getState())

    expect(timeoutResult.changed).toBe(true)
    expect(timeoutResult.timeoutWindowsConsumed).toBe(3)
    expect(timeoutResult.phaseTransitions).toBe(3)
    expect(timeoutResult.autoSubmittedSteps).toBe(9)
    expect(data.round).toBe(1)
    expect(data.phase).toBe('reveal')
  })

  it('auto-advances reveal on timeout and finishes when all chains are revealed', () => {
    expect(game.startGame()).toBe(true)

    submitPhase(game, 'prompt', 1)
    submitPhase(game, 'drawing', 1)
    submitPhase(game, 'caption', 1)

    const revealStartAt = game.getState().lastMoveAt as number
    const timeoutResult = game.applyTimeoutFallback(20, revealStartAt + 60_000)

    expect(timeoutResult.changed).toBe(true)
    expect(timeoutResult.revealAdvances).toBe(3)
    expect(game.getState().status).toBe('finished')
  })
})
