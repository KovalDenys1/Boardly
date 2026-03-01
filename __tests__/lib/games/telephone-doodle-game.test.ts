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
})
