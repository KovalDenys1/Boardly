import { Move } from '@/lib/game-engine'
import {
  SketchAndGuessGame,
  SketchAndGuessGameData,
  sanitizeSketchAndGuessStateForBroadcast,
} from '@/lib/games/sketch-and-guess-game'
import { SKETCH_PHASE_SECONDS } from '@/lib/games/sketch-and-guess-phases'

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
    expect(typeof data.rounds[0].prompt).toBe('string')
    expect(data.rounds[0].prompt.length).toBeGreaterThan(0)
    expect(data.rounds[0].drawerId).toBe('player1')
  })

  it('picks a different prompt across repeated round starts (not a fixed formula)', () => {
    const seenPrompts = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const trial = new SketchAndGuessGame(`sketch-random-${i}`, {
        maxPlayers: 10,
        minPlayers: 3,
        rules: { rounds: 1 },
      })
      addDefaultPlayers(trial)
      trial.startGame()
      seenPrompts.add(getData(trial).rounds[0].prompt)
    }
    // With a 25-entry pool and 40 independent random draws, seeing only one
    // distinct value would mean the pick isn't actually random.
    expect(seenPrompts.size).toBeGreaterThan(1)
  })

  it('accepts drawer drawing, then guesses, then reveal and score update', () => {
    expect(game.startGame()).toBe(true)
    const prompt = getData(game).rounds[0].prompt

    expect(
      game.validateMove(createMove('player2', 'submit-drawing', { content: '{"x":1}' }))
    ).toBe(false)
    expect(
      game.makeMove(createMove('player1', 'submit-drawing', { content: '{"strokes":[1]}' }))
    ).toBe(true)
    expect(getData(game).phase).toBe('guessing')

    expect(
      game.makeMove(createMove('player2', 'submit-guess', { guess: prompt }))
    ).toBe(true)
    expect(
      game.makeMove(createMove('player3', 'submit-guess', { guess: `${prompt}-wrong` }))
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
    // #1022: the phases have their own budgets now — 90 s drawing, 60 s guessing,
    // 8 s reveal — so running all three out takes 158 s rather than the three
    // equal 30 s windows this used to assume. The argument is ignored.
    const elapsed =
      (SKETCH_PHASE_SECONDS.drawing + SKETCH_PHASE_SECONDS.guessing + SKETCH_PHASE_SECONDS.reveal) * 1000
    const timeoutResult = oneRoundGame.applyTimeoutFallback(undefined, phaseStartAt + elapsed)
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

describe('sanitizeSketchAndGuessStateForBroadcast', () => {
  let game: SketchAndGuessGame

  beforeEach(() => {
    game = new SketchAndGuessGame('sketch-sanitize', {
      maxPlayers: 10,
      minPlayers: 3,
      rules: { rounds: 2 },
    })
    addDefaultPlayers(game)
    game.startGame()
  })

  it('hides the live prompt from a non-drawer during the drawing phase', () => {
    const prompt = getData(game).rounds[0].prompt
    const state = game.getState()
    expect(getData(game).currentDrawerId).toBe('player1')

    const forGuesser = sanitizeSketchAndGuessStateForBroadcast(state, 'player2')
    expect((forGuesser.data as SketchAndGuessGameData).rounds[0].prompt).toBe('')

    // original state object must be untouched (no accidental mutation)
    expect(getData(game).rounds[0].prompt).toBe(prompt)
  })

  it('hides the live prompt from a shared broadcast with no viewer (null)', () => {
    const state = game.getState()
    const forBroadcast = sanitizeSketchAndGuessStateForBroadcast(state, null)
    expect((forBroadcast.data as SketchAndGuessGameData).rounds[0].prompt).toBe('')
  })

  it('still shows the prompt to the drawer themselves', () => {
    const prompt = getData(game).rounds[0].prompt
    const state = game.getState()
    const forDrawer = sanitizeSketchAndGuessStateForBroadcast(state, 'player1')
    expect((forDrawer.data as SketchAndGuessGameData).rounds[0].prompt).toBe(prompt)
  })

  it('hides the prompt from a non-drawer during the guessing phase too', () => {
    game.makeMove(createMove('player1', 'submit-drawing', { content: '{"strokes":[1]}' }))
    expect(getData(game).phase).toBe('guessing')

    const state = game.getState()
    const forGuesser = sanitizeSketchAndGuessStateForBroadcast(state, 'player3')
    expect((forGuesser.data as SketchAndGuessGameData).rounds[0].prompt).toBe('')
  })

  it('reveals the prompt to everyone once the round is revealed', () => {
    const prompt = getData(game).rounds[0].prompt
    game.makeMove(createMove('player1', 'submit-drawing', { content: '{"strokes":[1]}' }))
    game.makeMove(createMove('player2', 'submit-guess', { guess: prompt }))
    game.makeMove(createMove('player3', 'submit-guess', { guess: 'wrong' }))
    expect(getData(game).phase).toBe('reveal')

    const state = game.getState()
    const forGuesser = sanitizeSketchAndGuessStateForBroadcast(state, 'player2')
    expect((forGuesser.data as SketchAndGuessGameData).rounds[0].prompt).toBe(prompt)
  })

  it('keeps past rounds fully visible to everyone once a new round has started', () => {
    const round1Prompt = getData(game).rounds[0].prompt
    game.makeMove(createMove('player1', 'submit-drawing', { content: '{"strokes":[1]}' }))
    game.makeMove(createMove('player2', 'submit-guess', { guess: round1Prompt }))
    game.makeMove(createMove('player3', 'submit-guess', { guess: 'wrong' }))
    game.makeMove(createMove('player1', 'advance-round', {}))
    expect(getData(game).currentRound).toBe(2)
    expect(getData(game).currentDrawerId).toBe('player2')

    const state = game.getState()
    // player3 is neither round 1's nor round 2's drawer
    const forOutsider = sanitizeSketchAndGuessStateForBroadcast(state, 'player3')
    const rounds = (forOutsider.data as SketchAndGuessGameData).rounds
    expect(rounds[0].prompt).toBe(round1Prompt) // past round, already revealed — safe
    expect(rounds[1].prompt).toBe('') // new live round, player3 isn't the drawer
  })

  it('treats a finished game as fully revealed regardless of phase', () => {
    const oneRoundGame = new SketchAndGuessGame('sketch-sanitize-finished', {
      maxPlayers: 10,
      minPlayers: 3,
      rules: { rounds: 1 },
    })
    addDefaultPlayers(oneRoundGame)
    oneRoundGame.startGame()
    const prompt = getData(oneRoundGame).rounds[0].prompt
    oneRoundGame.makeMove(createMove('player1', 'submit-drawing', { content: '{"d":1}' }))
    oneRoundGame.makeMove(createMove('player2', 'submit-guess', { guess: 'wrong' }))
    oneRoundGame.makeMove(createMove('player3', 'submit-guess', { guess: 'also wrong' }))
    oneRoundGame.makeMove(createMove('player1', 'advance-round', {}))
    expect(oneRoundGame.getState().status).toBe('finished')

    const state = oneRoundGame.getState()
    const forOutsider = sanitizeSketchAndGuessStateForBroadcast(state, 'player2')
    expect((forOutsider.data as SketchAndGuessGameData).rounds[0].prompt).toBe(prompt)
  })
})

/**
 * #1032, found by playing it: the prompt was redacted and the guesses were not,
 * so a player who had not answered yet could read the first correct guess –
 * which is the prompt, spelled out, with `isCorrect: true` beside it. The ids
 * here are the shapes the wire actually carries: `Players.userId` is a cuid for
 * a registered player and `guest-<uuid>` for a guest, and both were in the
 * lobby this was reproduced in.
 */
describe('sanitizeSketchAndGuessStateForBroadcast – live guesses (#1032)', () => {
  const DRAWER = 'cmua6hebe0000aksighngh8r3'
  const FIRST_GUESSER = 'guest-4f9bcf7e-1167-4596-abe3-a3983f932586'
  const SECOND_GUESSER = 'guest-0a7a332d-a9dc-42c4-8a34-375259b2f741'

  function guessingGame() {
    const game = new SketchAndGuessGame('sketch-leak', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
    game.addPlayer({ id: DRAWER, name: 'Host' })
    game.addPlayer({ id: FIRST_GUESSER, name: 'Bea' })
    game.addPlayer({ id: SECOND_GUESSER, name: 'Cyd' })
    game.startGame()
    expect(getData(game).currentDrawerId).toBe(DRAWER)

    const prompt = getData(game).rounds[0].prompt
    game.makeMove(createMove(DRAWER, 'submit-drawing', { content: '{"strokes":[1]}' }))
    game.makeMove(createMove(FIRST_GUESSER, 'submit-guess', { guess: prompt }))
    expect(getData(game).phase).toBe('guessing')
    return { game, prompt }
  }

  const liveRound = (state: { data?: unknown }) => (state.data as SketchAndGuessGameData).rounds[0]

  it('does not hand a still-choosing guesser the answer another player already typed', () => {
    const { game, prompt } = guessingGame()

    const forSecondGuesser = sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER)

    expect(liveRound(forSecondGuesser).guesses).toHaveLength(0)
    expect(JSON.stringify(forSecondGuesser)).not.toContain(prompt)
  })

  // The third route the same leak took (#1032). The first fix closed the state route and
  // the second the realtime broadcast; this one only opens when the drawing phase runs out
  // of time, which no unit test reached and no reviewer hit by eye. The engine used to put
  // `promptHint: prompt` inside the auto-submitted fallback drawing, and the sanitizer
  // publishes `rounds[].drawingContent` verbatim - so the moment the clock expired, every
  // guesser and the whole lobby channel were handed the word.
  it('does not smuggle the answer into the drawing the timeout auto-submits', () => {
    const game = new SketchAndGuessGame('sketch-timeout-leak', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
    game.addPlayer({ id: DRAWER, name: 'Host' })
    game.addPlayer({ id: FIRST_GUESSER, name: 'Bea' })
    game.addPlayer({ id: SECOND_GUESSER, name: 'Cyd' })
    game.startGame()

    const prompt = getData(game).rounds[0].prompt
    // applyTimeoutFallback measures from state.lastMoveAt, not from the round's own
    // phaseStartedAt, and consumes every window the interval covers - overshoot by one
    // window too many and it runs on into reveal, where the prompt is published to
    // everyone on purpose and the assertion below would mean nothing.
    const base = (game.getState() as { lastMoveAt?: number }).lastMoveAt ?? Date.now()
    game.applyTimeoutFallback(undefined, base + (SKETCH_PHASE_SECONDS.drawing + 1) * 1000)

    expect(getData(game).phase).toBe('guessing')
    expect(getData(game).rounds[0].drawingContent).toBeTruthy()

    // Both the per-viewer state and the shared channel, which is where it actually went out.
    for (const viewer of [FIRST_GUESSER, SECOND_GUESSER, null]) {
      const published = sanitizeSketchAndGuessStateForBroadcast(game.getState(), viewer)
      expect(JSON.stringify(published)).not.toContain(prompt)
    }
  })

  it('keeps a guesser their own guess, which is what "you have answered" is read from', () => {
    const { game, prompt } = guessingGame()

    const forFirstGuesser = sanitizeSketchAndGuessStateForBroadcast(game.getState(), FIRST_GUESSER)
    const guesses = liveRound(forFirstGuesser).guesses

    expect(guesses).toHaveLength(1)
    expect(guesses[0].playerId).toBe(FIRST_GUESSER)
    expect(guesses[0].guess).toBe(prompt)
  })

  it('leaves the head count intact, so the board can still say how many have answered', () => {
    const { game } = guessingGame()

    const forSecondGuesser = sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER)

    expect((forSecondGuesser.data as SketchAndGuessGameData).submittedPlayerIds).toEqual([FIRST_GUESSER])
  })

  it('hides live guesses from the drawer too, while still giving them their prompt', () => {
    const { game, prompt } = guessingGame()

    const forDrawer = sanitizeSketchAndGuessStateForBroadcast(game.getState(), DRAWER)

    expect(liveRound(forDrawer).prompt).toBe(prompt)
    expect(liveRound(forDrawer).guesses).toHaveLength(0)
  })

  it('hides every live guess from a spectator and from the shared broadcast', () => {
    const { game, prompt } = guessingGame()

    const forSpectator = sanitizeSketchAndGuessStateForBroadcast(game.getState(), null)

    expect(liveRound(forSpectator).prompt).toBe('')
    expect(liveRound(forSpectator).guesses).toHaveLength(0)
    expect(JSON.stringify(forSpectator)).not.toContain(prompt)
  })

  it('shows every guess to everyone once the round reaches the reveal', () => {
    const { game, prompt } = guessingGame()
    game.makeMove(createMove(SECOND_GUESSER, 'submit-guess', { guess: 'wrongwrong' }))
    expect(getData(game).phase).toBe('reveal')

    const forSecondGuesser = sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER)
    const guesses = liveRound(forSecondGuesser).guesses

    expect(guesses).toHaveLength(2)
    expect(guesses.map((g) => g.guess).sort()).toEqual([prompt, 'wrongwrong'].sort())
    expect(liveRound(forSecondGuesser).prompt).toBe(prompt)
  })

  it("does not mutate the engine's own state while redacting", () => {
    const { game, prompt } = guessingGame()

    sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER)

    expect(getData(game).rounds[0].prompt).toBe(prompt)
    expect(getData(game).rounds[0].guesses).toHaveLength(1)
  })
})
