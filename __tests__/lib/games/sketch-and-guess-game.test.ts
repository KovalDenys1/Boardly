import { Move } from '@/lib/game-engine'
import {
  SketchAndGuessGame,
  SketchAndGuessGameData,
  buildSketchWordHint,
  isSketchAndGuessSolverMuted,
  isSketchNearMiss,
  sanitizeSketchAndGuessActionEventForBroadcast,
  sanitizeSketchAndGuessStateForBroadcast,
} from '@/lib/games/sketch-and-guess-game'
import {
  SKETCH_GUESS_MIN_INTERVAL_MS,
  SKETCH_MAX_GUESSES_PER_ROUND,
  SKETCH_PHASE_SECONDS,
} from '@/lib/games/sketch-and-guess-phases'
import { getSketchWord, type SketchWord } from '@/lib/games/sketch-and-guess-words'

const createMove = (playerId: string, type: string, data: Record<string, unknown>, at?: number): Move => ({
  playerId,
  type,
  data,
  timestamp: new Date(at ?? Date.now()),
})

const getData = (game: SketchAndGuessGame): SketchAndGuessGameData =>
  game.getState().data as SketchAndGuessGameData

const addDefaultPlayers = (game: SketchAndGuessGame): void => {
  game.addPlayer({ id: 'player1', name: 'Player 1' })
  game.addPlayer({ id: 'player2', name: 'Player 2' })
  game.addPlayer({ id: 'player3', name: 'Player 3' })
}

const DRAWING = '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[{"color":"#000","width":3,"points":[{"x":1,"y":1}]}]}'
const BLANK_DRAWING = '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[]}'
const DRAWING_MS = SKETCH_PHASE_SECONDS.drawing * 1000

function newGame(rounds = 2, id = 'sketch-test') {
  const game = new SketchAndGuessGame(id, { maxPlayers: 10, minPlayers: 3, rules: { rounds } })
  addDefaultPlayers(game)
  expect(game.startGame()).toBe(true)
  return game
}

/** Starts a game and has the drawer pick `wordId` if offered, otherwise the first choice. */
function drawingGame(rounds = 2, id = 'sketch-test') {
  const game = newGame(rounds, id)
  const round = getData(game).rounds[0]
  const choice = round.wordChoices[0]
  const startAt = Date.now()
  expect(game.makeMove(createMove('player1', 'choose-word', { wordId: choice.id }, startAt))).toBe(true)
  return { game, word: getData(game).rounds[0].word as SketchWord, startAt }
}

/** Forces a known word onto the current round, for tests about matching specific forms. */
function withWord(game: SketchAndGuessGame, wordId: string): SketchWord {
  const word = getSketchWord(wordId)!
  const round = getData(game).rounds.find((r) => r.round === getData(game).currentRound)!
  round.wordChoices = [word, ...round.wordChoices.slice(1)]
  return word
}

describe('SketchAndGuessGame – choosing (#1082)', () => {
  it('starts every round in `choosing` with three distinct words offered to the drawer', () => {
    const game = newGame()
    const data = getData(game)
    expect(data.phase).toBe('choosing')
    expect(data.currentDrawerId).toBe('player1')
    const round = data.rounds[0]
    expect(round.word).toBeNull()
    expect(round.prompt).toBe('')
    expect(round.wordChoices).toHaveLength(3)
    expect(new Set(round.wordChoices.map((w) => w.id)).size).toBe(3)
    for (const word of round.wordChoices) {
      for (const lang of ['en', 'no', 'ru', 'uk'] as const) expect(word[lang].length).toBeGreaterThan(0)
    }
  })

  it('lets only the drawer choose, and only one of the offered words', () => {
    const game = newGame()
    const [first] = getData(game).rounds[0].wordChoices
    const offered = new Set(getData(game).rounds[0].wordChoices.map((w) => w.id))
    const notOffered = ['castle', 'cat', 'dog', 'apple'].find((id) => !offered.has(id))!

    expect(game.validateMove(createMove('player2', 'choose-word', { wordId: first.id }))).toBe(false)
    expect(game.validateMove(createMove('player1', 'choose-word', { wordId: notOffered }))).toBe(false)
    expect(game.makeMove(createMove('player1', 'choose-word', { wordId: first.id }))).toBe(true)

    const data = getData(game)
    expect(data.phase).toBe('drawing')
    expect(data.rounds[0].word?.id).toBe(first.id)
    expect(data.rounds[0].prompt).toBe(first.en[0])
    expect(data.rounds[0].wordAutoPicked).toBe(false)
    expect(typeof data.rounds[0].drawingStartedAt).toBe('number')
    // A second pick is not a move any more.
    expect(game.validateMove(createMove('player1', 'choose-word', { wordId: first.id }))).toBe(false)
  })

  it('picks one of the three at random when the choosing clock runs out', () => {
    const game = newGame()
    const offered = getData(game).rounds[0].wordChoices.map((w) => w.id)
    const startedAt = getData(game).phaseStartedAt as number

    const result = game.applyTimeoutFallback(undefined, startedAt + SKETCH_PHASE_SECONDS.choosing * 1000 + 1)

    const data = getData(game)
    expect(result.changed).toBe(true)
    expect(result.autoPickedWords).toBe(1)
    expect(data.phase).toBe('drawing')
    expect(offered).toContain(data.rounds[0].word?.id)
    expect(data.rounds[0].wordAutoPicked).toBe(true)
    expect(data.phaseStartedAt).toBe(startedAt + SKETCH_PHASE_SECONDS.choosing * 1000)
  })

  it('never offers a word an earlier round of the same game was played with', () => {
    const game = newGame(10, 'sketch-no-repeat')
    const played: string[] = []
    for (let round = 1; round <= 10; round += 1) {
      const data = getData(game)
      const current = data.rounds.find((r) => r.round === data.currentRound)!
      for (const choice of current.wordChoices) expect(played).not.toContain(choice.id)
      const choice = current.wordChoices[0]
      expect(game.makeMove(createMove(data.currentDrawerId, 'choose-word', { wordId: choice.id }))).toBe(true)
      played.push(choice.id)
      expect(game.makeMove(createMove(data.currentDrawerId, 'submit-drawing', { content: DRAWING }))).toBe(true)
      const phaseStartedAt = getData(game).phaseStartedAt as number
      game.applyTimeoutFallback(undefined, phaseStartedAt + DRAWING_MS)
      expect(game.makeMove(createMove(data.currentDrawerId, 'advance-round', {}))).toBe(true)
    }
    expect(game.getState().status).toBe('finished')
  })
})

describe('SketchAndGuessGame – guessing while drawing (#1082)', () => {
  it('takes repeated guesses from a guesser until one is right, then stops taking them', () => {
    const { game, word, startAt } = drawingGame()

    expect(game.makeMove(createMove('player2', 'submit-guess', { guess: 'definitely not it' }, startAt + 1000))).toBe(true)
    expect(game.makeMove(createMove('player2', 'submit-guess', { guess: 'still not it' }, startAt + 2000))).toBe(true)
    expect(getData(game).phase).toBe('drawing')
    expect(game.getLastGuessOutcome()).toMatchObject({ correct: false })

    expect(game.makeMove(createMove('player2', 'submit-guess', { guess: word.en[0] }, startAt + 3000))).toBe(true)
    expect(game.getLastGuessOutcome()).toMatchObject({ correct: true, close: false })
    expect(getData(game).submittedPlayerIds).toEqual(['player2'])
    expect(getData(game).phase).toBe('drawing')

    expect(game.validateMove(createMove('player2', 'submit-guess', { guess: 'another go' }, startAt + 5000))).toBe(false)
    expect(getData(game).rounds[0].guesses).toHaveLength(3)
  })

  it('does not let the drawer guess, nor anyone guess while the word is being chosen', () => {
    const game = newGame()
    expect(game.validateMove(createMove('player2', 'submit-guess', { guess: 'anything' }))).toBe(false)
    const { game: drawing, word, startAt } = drawingGame()
    expect(drawing.validateMove(createMove('player1', 'submit-guess', { guess: word.en[0] }, startAt + 1000))).toBe(false)
  })

  it('scores a correct guess at once: 50 plus speed, 20 more for the first, 40 to the drawer', () => {
    const { game, word, startAt } = drawingGame()
    const drawingStartedAt = getData(game).rounds[0].drawingStartedAt as number
    // A quarter of the clock gone: 50 + 50 * 0.75 = 87.5 → 88, plus 20 for first.
    game.makeMove(createMove('player2', 'submit-guess', { guess: word.en[0] }, drawingStartedAt + DRAWING_MS / 4))
    expect(getData(game).scores.player2).toBe(108)
    expect(getData(game).scores.player1).toBe(40)

    // Three quarters gone: 50 + 12.5 → 63 (Math.round), no first bonus.
    game.makeMove(createMove('player3', 'submit-guess', { guess: word.en[0] }, drawingStartedAt + (3 * DRAWING_MS) / 4))
    expect(getData(game).scores.player3).toBe(63)
    expect(getData(game).scores.player1).toBe(80)
    expect(startAt).toBeLessThanOrEqual(drawingStartedAt)
  })

  it('ends the drawing phase early once every guesser has it', () => {
    const { game, word, startAt } = drawingGame()
    game.makeMove(createMove('player2', 'submit-guess', { guess: word.en[0] }, startAt + 1000))
    expect(getData(game).phase).toBe('drawing')
    game.makeMove(createMove('player3', 'submit-guess', { guess: word.en[0] }, startAt + 2000))

    const data = getData(game)
    expect(data.phase).toBe('reveal')
    expect(data.rounds[0].revealAt).toBe(startAt + 2000)
    expect(data.phaseStartedAt).toBe(startAt + 2000)
  })

  it('goes to the reveal when the drawing clock runs out, and asks nobody for a guess', () => {
    const { game } = drawingGame()
    const phaseStartedAt = getData(game).phaseStartedAt as number
    const result = game.applyTimeoutFallback(undefined, phaseStartedAt + DRAWING_MS)
    expect(getData(game).phase).toBe('reveal')
    expect(result.autoSubmittedGuesses).toBe(0)
    expect(result.phaseTransitions).toBe(1)
    expect(getData(game).rounds[0].guesses).toHaveLength(0)
  })

  it('does not restart the drawing clock on every guess', () => {
    const { game, startAt } = drawingGame()
    const phaseStartedAt = getData(game).phaseStartedAt as number
    for (let i = 1; i <= 5; i += 1) {
      game.makeMove(createMove('player2', 'submit-guess', { guess: `wrong ${i}` }, startAt + i * 1000))
    }
    expect(getData(game).phaseStartedAt).toBe(phaseStartedAt)
    game.applyTimeoutFallback(undefined, phaseStartedAt + DRAWING_MS)
    expect(getData(game).phase).toBe('reveal')
  })

  it('rate-limits a guesser: 800 ms apart and at most 40 in a round', () => {
    const { game, startAt } = drawingGame()
    expect(game.makeMove(createMove('player2', 'submit-guess', { guess: 'first' }, startAt + 1000))).toBe(true)
    const tooSoon = createMove('player2', 'submit-guess', { guess: 'second' }, startAt + 1000 + SKETCH_GUESS_MIN_INTERVAL_MS - 1)
    expect(game.validateMove(tooSoon)).toBe(false)
    expect(game.getGuessRejection(tooSoon)).toBe('too-fast')
    // Another player's clock is their own.
    expect(game.makeMove(createMove('player3', 'submit-guess', { guess: 'other' }, startAt + 1001))).toBe(true)

    let at = startAt + 1000
    for (let i = 1; i < SKETCH_MAX_GUESSES_PER_ROUND; i += 1) {
      at += SKETCH_GUESS_MIN_INTERVAL_MS
      expect(game.makeMove(createMove('player2', 'submit-guess', { guess: `miss ${i}` }, at))).toBe(true)
    }
    const oneTooMany = createMove('player2', 'submit-guess', { guess: 'miss again' }, at + SKETCH_GUESS_MIN_INTERVAL_MS)
    expect(game.validateMove(oneTooMany)).toBe(false)
    expect(game.getGuessRejection(oneTooMany)).toBe('limit-reached')
  })
})

describe('SketchAndGuessGame – every language counts (#1082)', () => {
  function guessAgainst(wordId: string, guess: string) {
    const game = newGame(1, `sketch-lang-${wordId}`)
    withWord(game, wordId)
    game.makeMove(createMove('player1', 'choose-word', { wordId }))
    game.makeMove(createMove('player2', 'submit-guess', { guess }))
    return game.getLastGuessOutcome()
  }

  it.each([
    ['hedgehog', 'hedgehog'],
    ['hedgehog', 'Pinnsvin'],
    ['hedgehog', 'ежик'], // ё folded to е
    ['hedgehog', 'Ёжик'],
    ['hedgehog', 'їжак'],
    ['island', 'ØY'],
    ['football', 'мяч'], // Ukrainian м'яч without its apostrophe
    ['football', 'м’яч'],
    ['cat', '  cats  '],
    ['cat', 'котёнок'],
    ['cat', 'кошеня'],
    ['submarine', 'подводная   лодка'],
    ['deer', 'radyr'], // å stripped both ways
    ['shirt', 't shirt'],
  ])('accepts %s as %j', (wordId, guess) => {
    expect(guessAgainst(wordId, guess)).toMatchObject({ correct: true, close: false })
  })

  it('keeps й a letter of its own rather than folding it into и', () => {
    // "чаика" is one letter off nothing in the bank we pick, so it is simply wrong.
    const game = newGame(1, 'sketch-short-i')
    const tea: SketchWord = { id: 'test-seagull', en: ['seagull'], no: ['måke'], ru: ['чайка'], uk: ['чайка'] }
    getData(game).rounds[0].wordChoices = [tea]
    game.makeMove(createMove('player1', 'choose-word', { wordId: tea.id }))
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'чаика' }))
    expect(game.getLastGuessOutcome()).toMatchObject({ correct: false })
  })

  it('gives the author a private "close" for one letter off, without counting it', () => {
    const outcome = guessAgainst('elephant', 'elephan')
    expect(outcome).toMatchObject({ correct: false, close: true })
    expect(guessAgainst('elephant', 'eliphant')).toMatchObject({ correct: false, close: true })
    expect(guessAgainst('elephant', 'elepant')).toMatchObject({ correct: false, close: true })
    expect(guessAgainst('elephant', 'giraffe')).toMatchObject({ correct: false, close: false })
  })

  it('does not hand out "close" on a word of three letters or fewer, where one letter is the answer', () => {
    expect(guessAgainst('cow', 'kuu')).toMatchObject({ correct: false, close: false })
    expect(guessAgainst('cat', 'cot')).toMatchObject({ correct: false, close: false })
    expect(guessAgainst('cat', 'kot')).toMatchObject({ correct: false, close: false })
  })
})

describe('SketchAndGuessGame – host accepts a guess (#1082)', () => {
  const accept = (guessId: string, by = 'player1', at?: number) =>
    createMove(by, 'accept-guess', { guessId }, at)

  function withWrongGuess() {
    const { game, word, startAt } = drawingGame()
    // What the route does once it has checked lobby.creatorId.
    game.authorizeHost('player1')
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'elefant-ish typo' }, startAt + 1000))
    const guessId = getData(game).rounds[0].guesses[0].id
    return { game, word, startAt, guessId }
  }

  it('marks a wrong guess correct and scores it as of the moment it was typed', () => {
    const { game, guessId, startAt } = withWrongGuess()
    const drawingStartedAt = getData(game).rounds[0].drawingStartedAt as number
    // player3 gets it right later; the accepted one was typed first and takes the bonus.
    game.makeMove(createMove('player3', 'submit-guess', { guess: getData(game).rounds[0].word!.en[0] }, startAt + 40_000))

    expect(game.makeMove(accept(guessId, 'player1', startAt + 50_000))).toBe(true)

    const round = getData(game).rounds[0]
    expect(round.guesses[0]).toMatchObject({ isCorrect: true, acceptedByHost: true, submittedAt: startAt + 1000 })
    const share = (drawingStartedAt + DRAWING_MS - (startAt + 1000)) / DRAWING_MS
    expect(getData(game).scores.player2).toBe(50 + Math.round(50 * share) + 20)
    expect(getData(game).scoreBreakdown.player3.guessPoints).toBeLessThan(100)
    // Both guessers now have it, so the round ends.
    expect(getData(game).phase).toBe('reveal')
  })

  it('is idempotent: accepting twice scores once', () => {
    const { game, guessId } = withWrongGuess()
    expect(game.makeMove(accept(guessId))).toBe(true)
    const after = getData(game).scores.player2
    expect(game.isGuessAcceptedByHost(guessId)).toBe(true)
    expect(game.makeMove(accept(guessId))).toBe(true)
    expect(getData(game).scores.player2).toBe(after)
    expect(getData(game).submittedPlayerIds).toEqual(['player2'])
  })

  it('refuses without the route saying the mover is the host', () => {
    const { game, startAt } = drawingGame()
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'typo' }, startAt + 1000))
    const guessId = getData(game).rounds[0].guesses[0].id
    expect(game.validateMove(createMove('player1', 'accept-guess', { guessId }))).toBe(false)
  })

  it("refuses the host's own guess", () => {
    // player2 draws in round 2, so the host (player1) is a guesser there.
    const { game, word, startAt } = drawingGame()
    game.makeMove(createMove('player2', 'submit-guess', { guess: word.en[0] }, startAt + 1000))
    game.makeMove(createMove('player3', 'submit-guess', { guess: word.en[0] }, startAt + 2000))
    game.makeMove(createMove('player1', 'submit-drawing', { content: DRAWING }))
    game.makeMove(createMove('player1', 'advance-round', {}))
    const round2 = getData(game).rounds[1]
    game.makeMove(createMove('player2', 'choose-word', { wordId: round2.wordChoices[0].id }))
    game.makeMove(createMove('player1', 'submit-guess', { guess: 'my own miss' }))
    const ownGuessId = getData(game).rounds[1].guesses[0].id
    game.authorizeHost('player1')

    expect(game.validateMove(accept(ownGuessId, 'player1'))).toBe(false)
  })

  it('refuses a guess that is already correct, one from a finished round, or one that does not exist', () => {
    const { game, word, startAt, guessId } = withWrongGuess()
    game.makeMove(createMove('player2', 'submit-guess', { guess: word.en[0] }, startAt + 5000))
    // player2 already has it; their earlier miss is history now.
    expect(game.validateMove(accept(guessId))).toBe(false)
    const correctId = getData(game).rounds[0].guesses[1].id
    expect(game.validateMove(accept(correctId))).toBe(false)
    expect(game.validateMove(accept('r1-g999'))).toBe(false)
  })

  it('works during the reveal, before the round is advanced, and not after', () => {
    const { game, guessId } = withWrongGuess()
    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    expect(getData(game).phase).toBe('reveal')
    expect(game.makeMove(accept(guessId))).toBe(true)
    expect(getData(game).rounds[0].guesses[0].isCorrect).toBe(true)
    expect(getData(game).phase).toBe('reveal')

    game.makeMove(createMove('player1', 'submit-drawing', { content: DRAWING }))
    game.makeMove(createMove('player1', 'advance-round', {}))
    expect(getData(game).currentRound).toBe(2)
    expect(game.validateMove(accept(guessId))).toBe(false)
  })
})

describe('SketchAndGuessGame – the drawing and the reveal (#1082)', () => {
  it('keeps the drawing the drawer sends as the reveal opens, and does not move on without it', () => {
    const { game, word, startAt } = drawingGame()
    game.makeMove(createMove('player2', 'submit-guess', { guess: word.en[0] }, startAt + 1000))
    game.makeMove(createMove('player3', 'submit-guess', { guess: word.en[0] }, startAt + 2000))
    expect(getData(game).phase).toBe('reveal')

    expect(game.validateMove(createMove('player2', 'advance-round', {}))).toBe(false)
    expect(game.validateMove(createMove('player2', 'submit-drawing', { content: DRAWING }))).toBe(false)
    expect(game.makeMove(createMove('player1', 'submit-drawing', { content: DRAWING }))).toBe(true)
    expect(getData(game).rounds[0].drawingContent).toBe(DRAWING)
    expect(getData(game).rounds[0].drawingAutoSubmitted).toBe(false)
    // Once only.
    expect(game.validateMove(createMove('player1', 'submit-drawing', { content: DRAWING }))).toBe(false)

    expect(game.makeMove(createMove('player2', 'advance-round', {}))).toBe(true)
    const data = getData(game)
    expect(data.currentRound).toBe(2)
    expect(data.phase).toBe('choosing')
    expect(data.currentDrawerId).toBe('player2')
    expect(data.submittedPlayerIds).toEqual([])
  })

  it('penalises a blank drawing like a missing one', () => {
    const { game } = drawingGame(1, 'sketch-blank')
    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    game.makeMove(createMove('player1', 'submit-drawing', { content: BLANK_DRAWING }))
    expect(getData(game).rounds[0].drawingAutoSubmitted).toBe(true)
    game.makeMove(createMove('player2', 'advance-round', {}))
    expect(getData(game).scoreBreakdown.player1.autoSubmissionPenalty).toBe(20)
  })

  it('runs a whole unattended round out on the clocks and finishes deterministically', () => {
    const game = newGame(1, 'sketch-timeout')
    const startedAt = getData(game).phaseStartedAt as number
    const elapsed = (SKETCH_PHASE_SECONDS.choosing + SKETCH_PHASE_SECONDS.drawing + SKETCH_PHASE_SECONDS.reveal) * 1000
    const result = game.applyTimeoutFallback(undefined, startedAt + elapsed)
    const data = getData(game)

    expect(result.changed).toBe(true)
    expect(result.timeoutWindowsConsumed).toBe(3)
    expect(result.phaseTransitions).toBe(2)
    expect(result.revealAdvances).toBe(1)
    expect(result.autoPickedWords).toBe(1)
    expect(result.autoSubmittedDrawings).toBe(1)
    expect(result.autoSubmittedGuesses).toBe(0)
    expect(result.autoSubmittedPlayerIds).toEqual(['player1'])
    expect(game.getState().status).toBe('finished')
    expect(data.completionReason).toBe('all-rounds-finished')
    expect(data.scoreBreakdown.player1.autoSubmissionPenalty).toBe(20)
    expect(data.scoreBreakdown.player2.autoSubmissionPenalty).toBe(0)
    expect(data.ranking).toEqual(['player2', 'player3', 'player1'])
    expect(data.winnerId).toBe('player2')
  })

  it('keeps stable tie-break ordering when scores are equal', () => {
    const { game } = drawingGame(1, 'sketch-tie')
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'wrong' }))
    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    game.makeMove(createMove('player1', 'submit-drawing', { content: DRAWING }))
    game.makeMove(createMove('player1', 'advance-round', {}))

    const data = getData(game)
    expect(game.getState().status).toBe('finished')
    expect(data.scores).toEqual({ player1: 0, player2: 0, player3: 0 })
    expect(data.ranking).toEqual(['player1', 'player2', 'player3'])
    expect(data.winnerId).toBe('player1')
  })
})

describe('SketchAndGuessGame – a game persisted before #1082', () => {
  /** The shape a round had in production on 2026-09-24: English prompt, one guess each. */
  function legacyState(phase: 'drawing' | 'guessing' | 'reveal') {
    const now = Date.now()
    return {
      id: 'legacy',
      gameType: 'sketch_and_guess',
      status: 'playing',
      players: [
        { id: 'player1', name: 'P1', score: 0 },
        { id: 'player2', name: 'P2', score: 0 },
        { id: 'player3', name: 'P3', score: 0 },
      ],
      currentPlayerIndex: 0,
      lastMoveAt: now - 5000,
      updatedAt: new Date(),
      data: {
        phase,
        currentRound: 1,
        totalRounds: 2,
        drawerOrder: ['player1', 'player2', 'player3'],
        currentDrawerId: 'player1',
        rounds: [
          {
            round: 1,
            drawerId: 'player1',
            prompt: 'castle',
            drawingContent: phase === 'drawing' ? null : DRAWING,
            drawingSubmittedAt: phase === 'drawing' ? null : now - 6000,
            drawingAutoSubmitted: false,
            guesses:
              phase === 'drawing'
                ? []
                : [{ playerId: 'player2', guess: 'house', submittedAt: now - 5000, isCorrect: false }],
            revealAt: phase === 'reveal' ? now - 1000 : null,
            isScored: false,
            scoredAt: null,
          },
        ],
        submittedPlayerIds: phase === 'guessing' ? ['player2'] : [],
        scores: {},
        scoreBreakdown: {},
        winnerId: null,
        ranking: [],
        completionReason: null,
        finishedAt: null,
        isMvpScaffold: true,
      },
    }
  }

  function restore(phase: 'drawing' | 'guessing' | 'reveal') {
    const game = new SketchAndGuessGame('legacy')
    game.restoreState(legacyState(phase) as never)
    return game
  }

  it('reads `guessing` as a drawing phase that already has its guesses, and lets a wrong guesser try again', () => {
    const game = restore('guessing')
    const data = getData(game)
    expect(data.phase).toBe('drawing')
    expect(data.submittedPlayerIds).toEqual([])
    expect(data.rounds[0].word?.id).toBe('castle')
    expect(data.rounds[0].guesses[0].id).toBe('r1-g1')
    expect(typeof data.phaseStartedAt).toBe('number')

    expect(game.makeMove(createMove('player2', 'submit-guess', { guess: 'замок' }))).toBe(true)
    expect(game.getLastGuessOutcome()).toMatchObject({ correct: true })
    expect(game.makeMove(createMove('player3', 'submit-guess', { guess: 'slott' }))).toBe(true)
    expect(getData(game).phase).toBe('reveal')
    // The drawing was stored under the old rules, so the round can move on.
    expect(game.makeMove(createMove('player1', 'advance-round', {}))).toBe(true)
    expect(getData(game).phase).toBe('choosing')
  })

  it('times a legacy `guessing` phase out into the reveal instead of crashing', () => {
    const game = restore('guessing')
    const result = game.applyTimeoutFallback(undefined, Date.now() + DRAWING_MS)
    expect(result.changed).toBe(true)
    expect(getData(game).phase).not.toBe('guessing')
  })

  it('carries a legacy drawing phase on, with the English prompt matched in every language', () => {
    const game = restore('drawing')
    expect(getData(game).phase).toBe('drawing')
    expect(game.makeMove(createMove('player2', 'submit-guess', { guess: 'Slott' }))).toBe(true)
    expect(game.getLastGuessOutcome()).toMatchObject({ correct: true })
  })

  it('lets a legacy reveal advance into the new choosing phase', () => {
    const game = restore('reveal')
    expect(game.makeMove(createMove('player2', 'advance-round', {}))).toBe(true)
    expect(getData(game).phase).toBe('choosing')
    expect(getData(game).rounds[1].wordChoices).toHaveLength(3)
    expect(getData(game).rounds[1].wordChoices.map((w) => w.id)).not.toContain('castle')
  })

  it('gives a legacy prompt that is no longer in the bank an English-only word rather than none', () => {
    const state = legacyState('drawing')
    state.data.rounds[0].prompt = 'kaleidoscope'
    const game = new SketchAndGuessGame('legacy-unknown')
    game.restoreState(state as never)
    expect(getData(game).rounds[0].word).toEqual({ id: 'legacy:kaleidoscope', en: ['kaleidoscope'], no: [], ru: [], uk: [] })
    expect(game.makeMove(createMove('player2', 'submit-guess', { guess: 'kaleidoscope' }))).toBe(true)
    expect(game.getLastGuessOutcome()).toMatchObject({ correct: true })
  })
})

/**
 * No non-drawer is ever handed the word – in any language, or the three it was
 * picked from – or the text of a correct guess, before the reveal. The ids are
 * the shapes the wire actually carries: `Players.userId` is a cuid for a
 * registered player and `guest-<uuid>` for a guest (#1032).
 */
describe('sanitizeSketchAndGuessStateForBroadcast (#1032, #1082)', () => {
  const DRAWER = 'cmua6hebe0000aksighngh8r3'
  const FIRST_GUESSER = 'guest-4f9bcf7e-1167-4596-abe3-a3983f932586'
  const SECOND_GUESSER = 'guest-0a7a332d-a9dc-42c4-8a34-375259b2f741'

  function seatedGame() {
    const game = new SketchAndGuessGame('sketch-leak', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
    game.addPlayer({ id: DRAWER, name: 'Host' })
    game.addPlayer({ id: FIRST_GUESSER, name: 'Bea' })
    game.addPlayer({ id: SECOND_GUESSER, name: 'Cyd' })
    game.startGame()
    expect(getData(game).currentDrawerId).toBe(DRAWER)
    return game
  }

  function drawingWithCorrectGuess() {
    const game = seatedGame()
    const choices = getData(game).rounds[0].wordChoices
    game.makeMove(createMove(DRAWER, 'choose-word', { wordId: choices[0].id }))
    const word = getData(game).rounds[0].word as SketchWord
    game.makeMove(createMove(FIRST_GUESSER, 'submit-guess', { guess: word.ru[0] }))
    game.makeMove(createMove(SECOND_GUESSER, 'submit-guess', { guess: 'plainly wrong' }))
    expect(getData(game).phase).toBe('drawing')
    return { game, word, choices }
  }

  /** Every form of these words, in every language, as the client would see it. */
  function formsOf(words: SketchWord[]): string[] {
    return words.flatMap((word) => [...word.en, ...word.no, ...word.ru, ...word.uk])
  }

  const liveRound = (state: { data?: unknown }) => (state.data as SketchAndGuessGameData).rounds[0]

  /** A form is only "found" as a whole JSON string value, so `cat` does not match `category`. */
  function leaks(published: unknown, forms: string[]): string[] {
    const json = JSON.stringify(published)
    return forms.filter((form) => json.includes(JSON.stringify(form)))
  }

  it('gives the three choices to the drawer and nothing of them to anyone else while choosing', () => {
    const game = seatedGame()
    const choices = getData(game).rounds[0].wordChoices

    expect(liveRound(sanitizeSketchAndGuessStateForBroadcast(game.getState(), DRAWER)).wordChoices).toHaveLength(3)
    for (const viewer of [FIRST_GUESSER, SECOND_GUESSER, null]) {
      const published = sanitizeSketchAndGuessStateForBroadcast(game.getState(), viewer)
      expect(liveRound(published).wordChoices).toEqual([])
      expect(liveRound(published).word).toBeNull()
      expect(leaks(published, formsOf(choices))).toEqual([])
    }
  })

  it('gives no non-drawer any form of the word, or the choices, while drawing', () => {
    const { game, word, choices } = drawingWithCorrectGuess()

    for (const viewer of [SECOND_GUESSER, null]) {
      const published = sanitizeSketchAndGuessStateForBroadcast(game.getState(), viewer)
      expect(liveRound(published).prompt).toBe('')
      expect(liveRound(published).word).toBeNull()
      expect(leaks(published, formsOf([word, ...choices]))).toEqual([])
    }
  })

  it('shows every guess in the feed, with a correct one blanked for everyone but its author and the drawer', () => {
    const { game, word } = drawingWithCorrectGuess()

    const forSecond = liveRound(sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER))
    expect(forSecond.guesses).toHaveLength(2)
    expect(forSecond.guesses[0]).toMatchObject({ playerId: FIRST_GUESSER, isCorrect: true, guess: '' })
    expect(forSecond.guesses[1]).toMatchObject({ playerId: SECOND_GUESSER, guess: 'plainly wrong' })

    const forAuthor = liveRound(sanitizeSketchAndGuessStateForBroadcast(game.getState(), FIRST_GUESSER))
    expect(forAuthor.guesses[0].guess).toBe(word.ru[0])
    // The author knows the answer now, but is still not handed the other languages.
    expect(forAuthor.word).toBeNull()

    const forDrawer = liveRound(sanitizeSketchAndGuessStateForBroadcast(game.getState(), DRAWER))
    expect(forDrawer.guesses[0].guess).toBe(word.ru[0])
    expect(forDrawer.word?.id).toBe(word.id)
    expect(forDrawer.prompt).toBe(word.en[0])

    const forSpectator = liveRound(sanitizeSketchAndGuessStateForBroadcast(game.getState(), null))
    expect(forSpectator.guesses[0].guess).toBe('')
  })

  it('leaves the head count intact, so the board can say who has it', () => {
    const { game } = drawingWithCorrectGuess()
    const published = sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER)
    expect((published.data as SketchAndGuessGameData).submittedPlayerIds).toEqual([FIRST_GUESSER])
  })

  it('does not smuggle the answer into the drawing the timeout auto-submits', () => {
    const game = seatedGame()
    const base = getData(game).phaseStartedAt as number
    // Through choosing and into drawing, not on into the reveal where the word is public on purpose.
    game.applyTimeoutFallback(undefined, base + SKETCH_PHASE_SECONDS.choosing * 1000 + 1)
    expect(getData(game).phase).toBe('drawing')
    const word = getData(game).rounds[0].word as SketchWord

    for (const viewer of [FIRST_GUESSER, SECOND_GUESSER, null]) {
      expect(leaks(sanitizeSketchAndGuessStateForBroadcast(game.getState(), viewer), formsOf([word]))).toEqual([])
    }
  })

  it('reads a persisted legacy `guessing` state as unrevealed', () => {
    const { game } = drawingWithCorrectGuess()
    const legacy = { ...game.getState(), data: { ...getData(game), phase: 'guessing' } }
    const published = sanitizeSketchAndGuessStateForBroadcast(legacy as never, SECOND_GUESSER) as { data: SketchAndGuessGameData }
    expect(published.data.rounds[0].prompt).toBe('')
  })

  it('shows everything to everyone once the round reaches the reveal', () => {
    const { game, word } = drawingWithCorrectGuess()
    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    expect(getData(game).phase).toBe('reveal')

    const published = liveRound(sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER))
    expect(published.word?.id).toBe(word.id)
    expect(published.guesses[0].guess).toBe(word.ru[0])
  })

  it('keeps past rounds visible and redacts only the live one', () => {
    const { game, word } = drawingWithCorrectGuess()
    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    game.makeMove(createMove(DRAWER, 'submit-drawing', { content: DRAWING }))
    game.makeMove(createMove(DRAWER, 'advance-round', {}))
    expect(getData(game).currentDrawerId).toBe(FIRST_GUESSER)

    const rounds = (sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER).data as SketchAndGuessGameData).rounds
    expect(rounds[0].word?.id).toBe(word.id)
    expect(rounds[1].wordChoices).toEqual([])
  })

  it("does not mutate the engine's own state while redacting", () => {
    const { game, word } = drawingWithCorrectGuess()
    sanitizeSketchAndGuessStateForBroadcast(game.getState(), SECOND_GUESSER)
    expect(getData(game).rounds[0].word?.id).toBe(word.id)
    expect(getData(game).rounds[0].guesses[0].guess).toBe(word.ru[0])
  })
})

describe('sanitizeSketchAndGuessActionEventForBroadcast', () => {
  it('drops the chosen word id and the guess text, keeps the timeout counters', () => {
    expect(sanitizeSketchAndGuessActionEventForBroadcast({ wordId: 'castle' })).toEqual({})
    expect(sanitizeSketchAndGuessActionEventForBroadcast({ guess: 'castle' })).toEqual({})
    expect(sanitizeSketchAndGuessActionEventForBroadcast({ autoPickedWords: 1, timeoutWindowsConsumed: 1 })).toEqual({
      autoPickedWords: 1,
      timeoutWindowsConsumed: 1,
    })
  })
})


describe('Sketch & Guess word hint (#1082)', () => {
  const DRAW_MS = SKETCH_PHASE_SECONDS.drawing * 1000
  const start = 1_000_000
  const castle = getSketchWord('castle')!
  const shown = (cells: Array<string | null>) => cells.filter((cell) => cell !== null).length

  it('starts as blanks, one per letter, in the viewer language', () => {
    const hint = buildSketchWordHint(castle, 'ru', start, start + 1000, 1)
    expect(hint.lang).toBe('ru')
    expect(hint.cells).toEqual([null, null, null, null, null]) // замок
  })

  it('uncovers one letter at half the drawing clock and another at three quarters', () => {
    expect(shown(buildSketchWordHint(castle, 'en', start, start + DRAW_MS * 0.49, 1).cells)).toBe(0)
    expect(shown(buildSketchWordHint(castle, 'en', start, start + DRAW_MS * 0.5, 1).cells)).toBe(1)
    const late = buildSketchWordHint(castle, 'en', start, start + DRAW_MS * 0.8, 1).cells
    expect(shown(late)).toBe(2)
    // Whatever is uncovered is the real letter in its real place.
    late.forEach((cell, index) => { if (cell !== null) expect(cell).toBe('castle'[index]) })
  })

  it('never uncovers more than a third of the letters', () => {
    const cat = getSketchWord('cat')!
    expect(shown(buildSketchWordHint(cat, 'en', start, start + DRAW_MS, 1).cells)).toBe(1) // 3 letters -> 1
    const cow = getSketchWord('cow')!
    expect(shown(buildSketchWordHint(cow, 'no', start, start + DRAW_MS, 1).cells)).toBe(0) // "ku" -> 0
  })

  it('shows spaces and apostrophes as they are – they are the shape, not the answer', () => {
    const football = getSketchWord('football')!
    const hint = buildSketchWordHint(football, 'uk', start, start, 1)
    expect(hint.cells).toEqual([null, "'", null, null]) // м'яч
    const sub = buildSketchWordHint(getSketchWord('submarine')!, 'ru', start, start, 1)
    expect(sub.cells.filter((cell) => cell === ' ')).toHaveLength(1)
  })

  it('uncovers the same letters on every request', () => {
    const a = buildSketchWordHint(castle, 'en', start, start + DRAW_MS * 0.8, 1)
    const b = buildSketchWordHint(castle, 'en', start, start + DRAW_MS * 0.8, 1)
    expect(a).toEqual(b)
  })

  it('is given to a guesser in their locked language only, never to the drawer, the broadcast or a spectator', () => {
    const { game } = drawingGame(1, 'sketch-hint')
    const round = (published: unknown) => (published as { data: SketchAndGuessGameData }).data.rounds[0]
    expect(game.lockHintLocale('player2', 'no')).toBe(true)
    const state = game.getState()

    expect(round(sanitizeSketchAndGuessStateForBroadcast(state, 'player2')).wordHint?.lang).toBe('no')
    expect(round(sanitizeSketchAndGuessStateForBroadcast(state, null)).wordHint).toBeUndefined()
    expect(round(sanitizeSketchAndGuessStateForBroadcast(state, 'player3')).wordHint).toBeUndefined()
    expect(round(sanitizeSketchAndGuessStateForBroadcast(state, 'player1')).wordHint).toBeUndefined()
  })

  it('never spells the word out, even at the end of the clock', () => {
    for (const lang of ['en', 'no', 'ru', 'uk'] as const) {
      const { game, word } = drawingGame(1, `sketch-hint-late-${lang}`)
      const startedAt = getData(game).rounds[0].drawingStartedAt as number
      game.lockHintLocale('player2', lang)
      const published = sanitizeSketchAndGuessStateForBroadcast(game.getState(), 'player2', {
        now: startedAt + DRAW_MS - 1,
      }) as { data: SketchAndGuessGameData }
      const hint = published.data.rounds[0].wordHint!
      expect(hint.cells.join('')).not.toBe(word[lang][0])
      for (const form of [...word.en, ...word.no, ...word.ru, ...word.uk]) {
        expect(JSON.stringify(published)).not.toContain(JSON.stringify(form))
      }
    }
  })

  it('is not given while the word is still being chosen', () => {
    const game = newGame(1, 'sketch-hint-choosing')
    expect(game.lockHintLocale('player2', 'en')).toBe(false)
    const published = sanitizeSketchAndGuessStateForBroadcast(game.getState(), 'player2') as {
      data: SketchAndGuessGameData
    }
    expect(published.data.rounds[0].wordHint).toBeUndefined()
  })
})


/**
 * #1082 review: a wrong guess one letter off the word is the word for anyone
 * who reads it. Only its author, the drawer and the host (who decides whether
 * to accept it) are handed the text; everyone else sees that someone is close.
 */
describe('near-miss redaction (#1082)', () => {
  const HOST = 'player1' // lobby creator; draws round 1
  function roundWithNearMisses() {
    const game = newGame(2, 'sketch-near-miss')
    withWord(game, 'elephant')
    game.makeMove(createMove('player1', 'choose-word', { wordId: 'elephant' }))
    const t0 = Date.now()
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'elephan' }, t0 + 1000)) // one edit
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'a big elephant!!' }, t0 + 2000)) // contains a whole form, so wrong but a giveaway
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'слоны' }, t0 + 3000)) // one edit from слон
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'giraffe' }, t0 + 4000)) // plainly wrong
    return game
  }
  const texts = ['elephan', 'a big elephant!!', 'слоны']

  it('keeps near misses out of a third player’s state entirely', () => {
    const game = roundWithNearMisses()
    const published = sanitizeSketchAndGuessStateForBroadcast(game.getState(), 'player3', { hostUserId: HOST })
    const json = JSON.stringify(published)
    for (const text of texts) expect(json).not.toContain(JSON.stringify(text))
    const guesses = (published.data as SketchAndGuessGameData).rounds[0].guesses
    expect(guesses.filter((g) => g.nearMiss && g.guess === '')).toHaveLength(3)
    expect(guesses.find((g) => g.guess === 'giraffe')?.nearMiss).toBeUndefined()
  })

  it('and out of the shared broadcast and a spectator’s', () => {
    const game = roundWithNearMisses()
    const json = JSON.stringify(sanitizeSketchAndGuessStateForBroadcast(game.getState(), null, { hostUserId: HOST }))
    for (const text of texts) expect(json).not.toContain(JSON.stringify(text))
  })

  it('hands the text to its author and the drawer (who is the host here)', () => {
    const game = roundWithNearMisses()
    for (const viewer of ['player2', 'player1']) {
      const guesses = (sanitizeSketchAndGuessStateForBroadcast(game.getState(), viewer, { hostUserId: HOST }).data as SketchAndGuessGameData).rounds[0].guesses
      expect(guesses.filter((g) => g.nearMiss).map((g) => g.guess)).toEqual(texts)
    }
    // A host who is guessing this round and has not got it yet is a guesser
    // like any other (PR #1100 review) – see the review block below.
    const asHostGuesser = (sanitizeSketchAndGuessStateForBroadcast(game.getState(), 'player3', { hostUserId: 'player3' }).data as SketchAndGuessGameData).rounds[0].guesses
    expect(asHostGuesser.filter((g) => g.nearMiss).map((g) => g.guess)).toEqual(['', '', ''])
  })

  it('shows everything once the round is revealed', () => {
    const game = roundWithNearMisses()
    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    const json = JSON.stringify(sanitizeSketchAndGuessStateForBroadcast(game.getState(), 'player3'))
    for (const text of texts) expect(json).toContain(JSON.stringify(text))
  })
})

describe('Sketch & Guess chat rules (#1082)', () => {
  it('mutes a guesser who has the word while the round is drawn, and nobody else', () => {
    const { game, word } = drawingGame(2, 'sketch-chat-solver')
    game.makeMove(createMove('player2', 'submit-guess', { guess: word.en[0] }))
    const params = (userId: string) => ({ gameStatus: 'playing', state: game.getState(), userId })
    expect(isSketchAndGuessSolverMuted(params('player2'))).toBe(true)
    expect(isSketchAndGuessSolverMuted(params('player3'))).toBe(false)

    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    expect(getData(game).phase).toBe('reveal')
    expect(isSketchAndGuessSolverMuted(params('player2'))).toBe(false)
  })

})

/** PR #1100 review, items 1–3 and 5–8. */
describe('PR #1100 review fixes', () => {
  it('1: ignores a client-supplied authorizedAsHost – authority comes only from authorizeHost()', () => {
    const { game, startAt } = drawingGame(2, 'review-forgery')
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'not it' }, startAt + 1000))
    const guessId = getData(game).rounds[0].guesses[0].id
    // player3 forges the flag the old engine trusted.
    expect(game.makeMove(createMove('player3', 'accept-guess', { guessId, authorizedAsHost: true }))).toBe(false)
    expect(game.makeMove(createMove('player1', 'accept-guess', { guessId, authorizedAsHost: true }))).toBe(false)
    game.authorizeHost('player1')
    expect(game.makeMove(createMove('player1', 'accept-guess', { guessId }))).toBe(true)
  })

  it('2: shows a host who is guessing (and has not solved it) no near-miss text', () => {
    const game = newGame(2, 'review-host-guesser')
    withWord(game, 'elephant')
    game.makeMove(createMove('player1', 'choose-word', { wordId: 'elephant' }))
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'elephnat' }))
    const view = (host: string) =>
      (sanitizeSketchAndGuessStateForBroadcast(game.getState(), 'player3', { hostUserId: host }).data as SketchAndGuessGameData)
        .rounds[0].guesses[0].guess
    expect(view('player3')).toBe('')
    // Once the host has solved the round they may read it.
    game.makeMove(createMove('player3', 'submit-guess', { guess: 'elephant' }, Date.now() + 5000))
    expect(view('player3')).toBe('elephnat')
  })

  it('3: locks the hint language per player per round; a second language is never served', () => {
    const { game } = drawingGame(2, 'review-hint-lock')
    const hintFor = (viewer: string) =>
      (sanitizeSketchAndGuessStateForBroadcast(game.getState(), viewer).data as SketchAndGuessGameData).rounds[0].wordHint
    expect(hintFor('player2')).toBeUndefined()
    expect(game.lockHintLocale('player2', 'ru')).toBe(true)
    expect(game.lockHintLocale('player2', 'en')).toBe(false)
    expect(hintFor('player2')?.lang).toBe('ru')
    expect(game.lockHintLocale('player1', 'en')).toBe(false) // the drawer gets no hint
    expect(hintFor('player3')).toBeUndefined()
  })

  it('5: hides near misses by whole token and transposition, ignores short forms in text', () => {
    const elephant = getSketchWord('elephant')!
    expect(isSketchNearMiss('elepahnt', elephant)).toBe(true) // transposition = 1
    expect(isSketchNearMiss('big elephant here', elephant)).toBe(true) // whole token
    expect(isSketchNearMiss('elephants', elephant)).toBe(true)
    expect(isSketchNearMiss('elepantx', elephant)).toBe(true) // 2 edits, 8 letters
    const chicken = getSketchWord('chicken')!
    expect(isSketchNearMiss('when', chicken)).toBe(false) // "hen" is too short to hunt for in text
    expect(isSketchNearMiss('the hen', chicken)).toBe(false)
    const cat = getSketchWord('cat')!
    expect(isSketchNearMiss('который', cat)).toBe(false)
  })

  it('6: a drawer-host who accepts a guess earns no drawer points for it', () => {
    const { game, startAt } = drawingGame(2, 'review-drawer-host')
    game.makeMove(createMove('player2', 'submit-guess', { guess: 'close enough' }, startAt + 1000))
    const guessId = getData(game).rounds[0].guesses[0].id
    game.authorizeHost('player1') // player1 created the lobby and draws round 1
    expect(game.makeMove(createMove('player1', 'accept-guess', { guessId }))).toBe(true)
    expect(getData(game).scores.player2).toBeGreaterThan(0)
    expect(getData(game).scores.player1).toBe(0)
    expect(getData(game).scoreBreakdown.player1.drawerPoints).toBe(0)
  })

  it('7: save-drawing stores the drawing mid-round and the reveal timeout keeps it without a penalty', () => {
    const { game, startAt } = drawingGame(1, 'review-save')
    expect(game.makeMove(createMove('player2', 'save-drawing', { content: DRAWING }, startAt + 1000))).toBe(false)
    expect(game.makeMove(createMove('player1', 'save-drawing', { content: DRAWING }, startAt + 6000))).toBe(true)
    expect(getData(game).phase).toBe('drawing')
    expect(game.validateMove(createMove('player1', 'save-drawing', { content: DRAWING }, startAt + 6500))).toBe(false) // too soon
    const started = getData(game).phaseStartedAt as number
    const result = game.applyTimeoutFallback(undefined, started + DRAWING_MS + SKETCH_PHASE_SECONDS.reveal * 1000)
    expect(result.autoSubmittedDrawings).toBe(0)
    expect(getData(game).rounds[0].drawingContent).toBe(DRAWING)
    expect(getData(game).scoreBreakdown.player1.autoSubmissionPenalty).toBe(0)
  })

  it('7: the final submit at the reveal still replaces a saved drawing', () => {
    const { game, startAt } = drawingGame(1, 'review-save-final')
    game.makeMove(createMove('player1', 'save-drawing', { content: BLANK_DRAWING }, startAt + 6000))
    game.applyTimeoutFallback(undefined, (getData(game).phaseStartedAt as number) + DRAWING_MS)
    expect(game.makeMove(createMove('player1', 'submit-drawing', { content: DRAWING }))).toBe(true)
    expect(getData(game).rounds[0].drawingContent).toBe(DRAWING)
    expect(getData(game).rounds[0].drawingAutoSubmitted).toBe(false)
    expect(game.validateMove(createMove('player1', 'submit-drawing', { content: DRAWING }))).toBe(false)
  })

  it('8: a legacy guessing phase runs its clock from when guessing began (drawingSubmittedAt)', () => {
    const now = Date.now()
    const game = new SketchAndGuessGame('legacy-clock')
    game.restoreState({
      id: 'legacy-clock', gameType: 'sketch_and_guess', status: 'playing',
      players: [{ id: 'a', name: 'A', score: 0 }, { id: 'b', name: 'B', score: 0 }, { id: 'c', name: 'C', score: 0 }],
      currentPlayerIndex: 0, lastMoveAt: now - 1000, updatedAt: new Date(),
      data: {
        phase: 'guessing', currentRound: 1, totalRounds: 1, drawerOrder: ['a', 'b', 'c'], currentDrawerId: 'a',
        rounds: [{ round: 1, drawerId: 'a', prompt: 'castle', drawingContent: DRAWING, drawingSubmittedAt: now - 50_000,
          drawingAutoSubmitted: false, guesses: [{ playerId: 'b', guess: 'x', submittedAt: now - 1000, isCorrect: false }],
          revealAt: null, isScored: false, scoredAt: null }],
        submittedPlayerIds: ['b'], scores: {}, scoreBreakdown: {}, winnerId: null, ranking: [], completionReason: null,
        finishedAt: null, isMvpScaffold: true,
      },
    } as never)
    expect(getData(game).phaseStartedAt).toBe(now - 50_000)
    expect(getData(game).rounds[0].drawingStartedAt).toBe(now - 50_000)
  })
})
