import { Move } from '@/lib/game-engine'
import { SketchAndGuessGame, SketchAndGuessGameData } from '@/lib/games/sketch-and-guess-game'

const createMove = (playerId: string, type: string, data: Record<string, unknown>): Move => ({
  playerId,
  type,
  data,
  timestamp: new Date(),
})

const getData = (game: SketchAndGuessGame): SketchAndGuessGameData =>
  game.getState().data as SketchAndGuessGameData

const addDefaultPlayers = (game: SketchAndGuessGame): void => {
  game.addPlayer({ id: 'player1', name: 'Player 1' })
  game.addPlayer({ id: 'player2', name: 'Player 2' })
  game.addPlayer({ id: 'player3', name: 'Player 3' })
}

describe('SketchAndGuessGame (MVP scaffold)', () => {
  let game: SketchAndGuessGame

  beforeEach(() => {
    game = new SketchAndGuessGame('sketch-test', {
      maxPlayers: 10,
      minPlayers: 3,
      rules: { rounds: 2 },
    })
    addDefaultPlayers(game)
  })

  it('initializes round, drawer and prompt on start', () => {
    expect(game.startGame()).toBe(true)

    const data = getData(game)
    expect(data.phase).toBe('drawing')
    expect(data.currentRound).toBe(1)
    expect(data.currentDrawerId).toBe('player1')
    expect(data.rounds).toHaveLength(1)
    expect(data.rounds[0].prompt).toBe('castle')
    expect(data.rounds[0].drawerId).toBe('player1')
  })

  it('accepts drawer drawing, then guesses, then reveal and score update', () => {
    expect(game.startGame()).toBe(true)

    expect(
      game.validateMove(createMove('player2', 'submit-drawing', { content: '{"x":1}' }))
    ).toBe(false)
    expect(
      game.makeMove(createMove('player1', 'submit-drawing', { content: '{"strokes":[1]}' }))
    ).toBe(true)
    expect(getData(game).phase).toBe('guessing')

    expect(
      game.makeMove(createMove('player2', 'submit-guess', { guess: 'castle' }))
    ).toBe(true)
    expect(
      game.makeMove(createMove('player3', 'submit-guess', { guess: 'volcano' }))
    ).toBe(true)
    expect(getData(game).phase).toBe('reveal')

    expect(game.makeMove(createMove('player1', 'advance-round', {}))).toBe(true)
    const data = getData(game)
    expect(data.currentRound).toBe(2)
    expect(data.currentDrawerId).toBe('player2')
    expect(data.phase).toBe('drawing')
    expect(data.scores.player2).toBe(120)
    expect(data.scores.player1).toBe(40)
    expect(data.scores.player3).toBe(0)
  })

  it('applies timeout fallback across drawing/guessing/reveal and finishes deterministic', () => {
    const oneRoundGame = new SketchAndGuessGame('sketch-timeout', {
      maxPlayers: 10,
      minPlayers: 3,
      rules: { rounds: 1 },
    })
    addDefaultPlayers(oneRoundGame)
    expect(oneRoundGame.startGame()).toBe(true)

    const phaseStartAt = oneRoundGame.getState().lastMoveAt as number
    const timeoutResult = oneRoundGame.applyTimeoutFallback(30, phaseStartAt + 90_000)
    const data = getData(oneRoundGame)

    expect(timeoutResult.changed).toBe(true)
    expect(timeoutResult.timeoutWindowsConsumed).toBe(3)
    expect(timeoutResult.phaseTransitions).toBe(2)
    expect(timeoutResult.revealAdvances).toBe(1)
    expect(timeoutResult.autoSubmittedDrawings).toBe(1)
    expect(timeoutResult.autoSubmittedGuesses).toBe(2)
    expect(oneRoundGame.getState().status).toBe('finished')
    expect(data.completionReason).toBe('all-rounds-finished')
    expect(data.scoreBreakdown.player1.autoSubmissionPenalty).toBe(20)
    expect(data.scoreBreakdown.player2.autoSubmissionPenalty).toBe(10)
    expect(data.scoreBreakdown.player3.autoSubmissionPenalty).toBe(10)
    expect(data.ranking).toEqual(['player2', 'player3', 'player1'])
    expect(data.winnerId).toBe('player2')
  })

  it('keeps stable tie-break ordering when scores are equal', () => {
    const oneRoundGame = new SketchAndGuessGame('sketch-tie', {
      maxPlayers: 10,
      minPlayers: 3,
      rules: { rounds: 1 },
    })
    addDefaultPlayers(oneRoundGame)
    expect(oneRoundGame.startGame()).toBe(true)

    expect(oneRoundGame.makeMove(createMove('player1', 'submit-drawing', { content: '{"d":1}' }))).toBe(true)
    expect(oneRoundGame.makeMove(createMove('player2', 'submit-guess', { guess: 'wrong' }))).toBe(true)
    expect(oneRoundGame.makeMove(createMove('player3', 'submit-guess', { guess: 'also wrong' }))).toBe(true)
    expect(oneRoundGame.makeMove(createMove('player1', 'advance-round', {}))).toBe(true)

    const data = getData(oneRoundGame)
    expect(oneRoundGame.getState().status).toBe('finished')
    expect(data.scores.player1).toBe(0)
    expect(data.scores.player2).toBe(0)
    expect(data.scores.player3).toBe(0)
    expect(data.ranking).toEqual(['player1', 'player2', 'player3'])
    expect(data.winnerId).toBe('player1')
  })
})
