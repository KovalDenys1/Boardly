// @ts-nocheck
import { act, fireEvent, render, screen } from '@testing-library/react'
import SketchAndGuessGameBoard from '@/components/SketchAndGuessGameBoard'

// The real hook keeps one `t` across renders (lib/i18n-helpers.ts); a fresh one
// per render would make every callback that depends on it unstable. The key is
// echoed with its interpolation values so a test can read who a line names.
let mockLanguage = 'en'
jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string, options?: Record<string, unknown>) =>
    options && typeof options === 'object' && Object.keys(options).length > 0
      ? `${key}:${Object.values(options).join('|')}`
      : key
  return { useTranslation: () => ({ t, i18n: { language: mockLanguage } }) }
})

const CASTLE = { id: 'castle', en: ['castle', 'castles'], no: ['slott', 'borg'], ru: ['замок'], uk: ['замок'] }
const CAT = { id: 'cat', en: ['cat'], no: ['katt'], ru: ['кошка'], uk: ['кіт'] }
const DOG = { id: 'dog', en: ['dog'], no: ['hund'], ru: ['собака'], uk: ['собака'] }

function buildGameData(overrides = {}, roundOverrides = {}) {
  return {
    phase: 'drawing',
    phaseStartedAt: Date.now(),
    currentRound: 1,
    totalRounds: 3,
    drawerOrder: ['user-2', 'user-1', 'user-3'],
    currentDrawerId: 'user-2',
    rounds: [
      {
        round: 1,
        drawerId: 'user-2',
        prompt: '',
        word: null,
        wordChoices: [],
        wordAutoPicked: false,
        drawingStartedAt: Date.now(),
        drawingContent: null,
        drawingSubmittedAt: null,
        drawingAutoSubmitted: false,
        guesses: [],
        revealAt: null,
        isScored: false,
        scoredAt: null,
        ...roundOverrides,
      },
    ],
    submittedPlayerIds: [],
    scores: { 'user-1': 0, 'user-2': 0, 'user-3': 0 },
    scoreBreakdown: {},
    winnerId: null,
    ranking: [],
    completionReason: null,
    finishedAt: null,
    isMvpScaffold: false,
    ...overrides,
  }
}

function buildProps(overrides = {}) {
  return {
    gameData: buildGameData(),
    gameStatus: 'playing',
    playerId: 'user-1',
    players: [
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
      { id: 'user-3', name: 'Cara' },
    ],
    onSubmitGuess: jest.fn(() => new Promise(() => {})),
    onAdvanceRound: jest.fn(),
    onChooseWord: jest.fn(async () => {}),
    onAcceptGuess: jest.fn(async () => {}),
    isSubmitting: false,
    ...overrides,
  }
}

beforeEach(() => {
  mockLanguage = 'en'
})

// #1006 — the guess box is cleared only after the round trip, so the typed word
// is still on screen while the request is out and pressing Enter again is the
// natural thing to do. Since #1082 the box is read-only rather than disabled
// while a guess is out, so a phone keeps its keyboard up between guesses.
describe('SketchAndGuessGameBoard guess input (#1006, #1082)', () => {
  const guessBox = () => screen.getByPlaceholderText('games.guess_my_drawing.game.guessPlaceholder')

  it('ignores Enter once a guess of its own is in flight', () => {
    const props = buildProps()
    const { rerender } = render(<SketchAndGuessGameBoard {...props} />)

    fireEvent.change(guessBox(), { target: { value: 'apple' } })
    fireEvent.keyDown(guessBox(), { key: 'Enter' })
    expect(props.onSubmitGuess).toHaveBeenCalledTimes(1)

    // What the page does the moment the request leaves.
    rerender(<SketchAndGuessGameBoard {...props} isSubmitting />)

    expect(guessBox()).toHaveAttribute('readonly')
    expect(guessBox()).not.toBeDisabled()
    fireEvent.keyDown(guessBox(), { key: 'Enter' })
    expect(props.onSubmitGuess).toHaveBeenCalledTimes(1)
    expect(props.onSubmitGuess).toHaveBeenCalledWith('apple')
  })

  it('takes no keystrokes while a guess is in flight', () => {
    const props = buildProps({ isSubmitting: true })
    render(<SketchAndGuessGameBoard {...props} />)

    fireEvent.change(guessBox(), { target: { value: 'apple' } })
    fireEvent.keyDown(guessBox(), { key: 'Enter' })

    expect(props.onSubmitGuess).not.toHaveBeenCalled()
  })

  it('lets a guesser keep guessing while the drawer draws, and tells them privately when they were close', async () => {
    const props = buildProps({ onSubmitGuess: jest.fn(async () => ({ correct: false, close: true })) })
    render(<SketchAndGuessGameBoard {...props} />)

    fireEvent.change(guessBox(), { target: { value: 'castel' } })
    await act(async () => {
      fireEvent.keyDown(guessBox(), { key: 'Enter' })
    })

    expect(screen.getByText('games.guess_my_drawing.game.closeGuess')).not.toBeNull()
    expect(guessBox()).toHaveValue('')
    fireEvent.change(guessBox(), { target: { value: 'castle' } })
    expect(screen.queryByText('games.guess_my_drawing.game.closeGuess')).toBeNull()
  })

  it('shows the server’s word hint as blanks and uncovered letters, and never to the drawer', () => {
    const gameData = buildGameData({}, { wordHint: { lang: 'en', cells: ['c', null, null, ' ', null] } })
    const { container } = render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)
    const cells = Array.from(container.querySelectorAll('.sketch-word-hint__cell')).map((node) => node.textContent)
    expect(cells).toEqual(['c', '_', '_', '_'])
    expect(container.querySelectorAll('.sketch-word-hint__gap')).toHaveLength(1)
  })

  it('takes the box away once the viewer has it', () => {
    const gameData = buildGameData({ submittedPlayerIds: ['user-1'] })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)

    expect(screen.queryByPlaceholderText('games.guess_my_drawing.game.guessPlaceholder')).toBeNull()
    expect(screen.getByText('games.guess_my_drawing.game.alreadyGuessed')).not.toBeNull()
  })
})

describe('SketchAndGuessGameBoard choosing (#1082)', () => {
  it('offers the drawer the three words in their own language', () => {
    mockLanguage = 'no'
    const gameData = buildGameData({ phase: 'choosing' }, { wordChoices: [CASTLE, CAT, DOG] })
    const props = buildProps({ gameData, playerId: 'user-2' })
    render(<SketchAndGuessGameBoard {...props} />)

    expect(screen.getByText('games.guess_my_drawing.game.chooseWordTitle')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'katt' }))
    expect(props.onChooseWord).toHaveBeenCalledWith('cat')
    expect(screen.queryByText('castle')).toBeNull()
    expect(screen.getByRole('button', { name: 'slott' })).not.toBeNull()
  })

  it('tells everyone else who is choosing, and shows them no word', () => {
    const gameData = buildGameData({ phase: 'choosing' }, { wordChoices: [CASTLE, CAT, DOG] })
    const { container } = render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)

    expect(screen.getByText(/games\.guess_my_drawing\.game\.choosingWait:Bob/)).not.toBeNull()
    for (const form of ['castle', 'cat', 'dog', 'slott', 'katt']) expect(container.textContent).not.toContain(form)
  })
})

describe('SketchAndGuessGameBoard guess feed (#1082)', () => {
  const guesses = [
    { id: 'r1-g1', playerId: 'user-3', guess: 'house', submittedAt: 1, isCorrect: false },
    { id: 'r1-g2', playerId: 'user-1', guess: 'tower', submittedAt: 2, isCorrect: false },
    { id: 'r1-g3', playerId: 'user-3', guess: '', submittedAt: 3, isCorrect: true },
  ]

  it('shows wrong guesses by text and a correct one as "<name> guessed it!"', () => {
    const gameData = buildGameData({ submittedPlayerIds: ['user-3'] }, { guesses })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)

    expect(screen.getByText('house')).not.toBeNull()
    expect(screen.getByText('tower')).not.toBeNull()
    expect(screen.getByText('games.guess_my_drawing.game.guessedIt:Cara')).not.toBeNull()
  })

  it('gives the host an Accept on other players’ misses only – not their own, not a player who has it', () => {
    const extra = [...guesses, { id: 'r1-g4', playerId: 'user-2', guess: 'n/a', submittedAt: 4, isCorrect: false }]
    const gameData = buildGameData({ submittedPlayerIds: ['user-3'] }, { guesses: extra })
    const props = buildProps({ gameData, isHost: true })
    render(<SketchAndGuessGameBoard {...props} />)

    // user-3 already has it; user-1 is the host themselves; user-2 is the drawer.
    expect(screen.queryAllByRole('button', { name: 'games.guess_my_drawing.game.acceptGuess' })).toHaveLength(0)
  })

  it('shows a near miss the server masked as "<name> is close!", and the text where it was not (#1082)', () => {
    const masked = [
      { id: 'r1-g1', playerId: 'user-3', guess: '', submittedAt: 1, isCorrect: false, nearMiss: true },
      { id: 'r1-g2', playerId: 'user-1', guess: 'castel', submittedAt: 2, isCorrect: false, nearMiss: true },
    ]
    render(<SketchAndGuessGameBoard {...buildProps({ gameData: buildGameData({}, { guesses: masked }) })} />)
    expect(screen.getByText('games.guess_my_drawing.game.isClose:Cara')).not.toBeNull()
    expect(screen.getByText('castel')).not.toBeNull()
  })

  it('calls onAcceptGuess with the guess id', () => {
    const gameData = buildGameData({}, { guesses: [guesses[0]] })
    const props = buildProps({ gameData, isHost: true })
    render(<SketchAndGuessGameBoard {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'games.guess_my_drawing.game.acceptGuess' }))
    expect(props.onAcceptGuess).toHaveBeenCalledWith('r1-g1')
  })

  it('gives a player who is not the host no Accept at all', () => {
    const gameData = buildGameData({}, { guesses: [guesses[0]] })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData, playerId: 'user-3' })} />)
    expect(screen.queryByRole('button', { name: 'games.guess_my_drawing.game.acceptGuess' })).toBeNull()
  })

  it('shows the drawer the feed under the canvas, with their word in their language', () => {
    mockLanguage = 'ru'
    const gameData = buildGameData({}, { word: CASTLE, prompt: 'castle', guesses: [guesses[0]] })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData, playerId: 'user-2' })} />)

    expect(screen.getByText('замок')).not.toBeNull()
    expect(screen.getByText('house')).not.toBeNull()
    expect(screen.queryByPlaceholderText('games.guess_my_drawing.game.guessPlaceholder')).toBeNull()
  })
})

describe('SketchAndGuessGameBoard reveal (#1082)', () => {
  const revealGuesses = [
    { id: 'r1-g1', playerId: 'user-1', guess: 'slott', submittedAt: 1, isCorrect: true },
    { id: 'r1-g2', playerId: 'user-3', guess: 'castel', submittedAt: 2, isCorrect: true, acceptedByHost: true },
  ]

  it('shows the word in the viewer’s language and who guessed it, host-accepted ones marked', () => {
    mockLanguage = 'uk'
    const gameData = buildGameData({ phase: 'reveal' }, { word: CASTLE, prompt: 'castle', guesses: revealGuesses, drawingContent: '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[]}' })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)

    expect(screen.getByText('замок')).not.toBeNull()
    // Who got it: the feed, with the host-accepted one marked, and its text now public.
    expect(screen.getByText(/guessedIt:Alice/)).not.toBeNull()
    expect(screen.getByText(/guessedIt:Cara/)).not.toBeNull()
    expect(screen.getAllByText(/acceptedByHost/)).toHaveLength(1)
    expect(screen.getByText(/castel/)).not.toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.nobodyGuessed')).toBeNull()
  })

  it('says nobody guessed it when nobody did', () => {
    const gameData = buildGameData({ phase: 'reveal' }, { word: CASTLE, prompt: 'castle', drawingContent: '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[]}' })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)
    expect(screen.getByText(/games\.guess_my_drawing\.game\.nobodyGuessed/)).not.toBeNull()
  })

  it('puts "Next round" in the header row above the canvas, never under the fold', () => {
    const gameData = buildGameData({ phase: 'reveal' }, { word: CASTLE, prompt: 'castle', drawingContent: '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[]}' })
    const { container } = render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)
    const head = container.querySelector('.sketch-reveal-head')
    expect(head?.textContent).toContain('games.guess_my_drawing.game.nextRound')
    // The header comes before the canvas in the phase column.
    const phase = container.querySelector('.sketch-phase')!
    expect(phase.firstElementChild).toBe(head)
  })

  it('holds "Next round" until the drawer’s drawing is in', () => {
    const gameData = buildGameData({ phase: 'reveal' }, { word: CASTLE, prompt: 'castle' })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)
    const button = screen.getByRole('button', { name: /games\.guess_my_drawing\.game\.waitingForDrawing/ })
    expect(button).toBeDisabled()
  })

  it('reads a pre-#1082 round, which has only its English prompt', () => {
    mockLanguage = 'ru'
    const gameData = buildGameData({ phase: 'reveal' }, { word: undefined, prompt: 'castle', drawingContent: '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[]}' })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData })} />)
    expect(screen.getByText('castle')).not.toBeNull()
  })
})

/**
 * #1033 put this game on the spectator route, and #1032/#1034 must not take it
 * away again: a spectator watches the drawing appear and never gets the prompt
 * or a way to play. The prompt half is enforced server-side by
 * sanitizeSketchAndGuessStateForBroadcast; this is the half the board owns.
 */
describe('SketchAndGuessGameBoard for a spectator', () => {
  it('gives a spectator the drawing and the feed but no guess box', () => {
    const props = buildProps({ isSpectator: true, playerId: '' })
    const { container } = render(<SketchAndGuessGameBoard {...props} />)

    expect(container.querySelector('canvas')).not.toBeNull()
    expect(screen.queryByPlaceholderText('games.guess_my_drawing.game.guessPlaceholder')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.submitGuess')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.spectatorNotice')).not.toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.guessFeedEmpty')).not.toBeNull()
  })

  it('never puts the drawing tools in front of a spectator, even on the drawer seat', () => {
    // The drawing phase with the spectator sitting on the drawer's own id: the
    // one case where a missing !isSpectator would hand over the prompt.
    const gameData = buildGameData({}, { word: CASTLE, prompt: 'castle' })
    const props = buildProps({ gameData, isSpectator: true, playerId: 'user-2' })
    render(<SketchAndGuessGameBoard {...props} />)

    expect(screen.queryByText('games.guess_my_drawing.game.yourPrompt')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.undo')).toBeNull()
    expect(screen.queryByText('castle')).toBeNull()
  })

  it('never offers a spectator the word choices, even on the drawer seat', () => {
    const gameData = buildGameData({ phase: 'choosing' }, { wordChoices: [CASTLE, CAT, DOG] })
    render(<SketchAndGuessGameBoard {...buildProps({ gameData, isSpectator: true, playerId: 'user-2' })} />)
    expect(screen.queryByRole('button', { name: 'castle' })).toBeNull()
  })

  it('does not offer a spectator the button that ends the reveal', () => {
    const gameData = buildGameData({ phase: 'reveal' }, { word: CASTLE, prompt: 'castle' })
    const props = buildProps({ gameData, isSpectator: true, playerId: '' })
    render(<SketchAndGuessGameBoard {...props} />)

    expect(screen.queryByText('games.guess_my_drawing.game.nextRound')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.seeResults')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.spectatorNotice')).not.toBeNull()
  })
})
