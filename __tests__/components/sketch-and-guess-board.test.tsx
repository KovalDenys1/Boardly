// @ts-nocheck
import { fireEvent, render, screen } from '@testing-library/react'
import SketchAndGuessGameBoard from '@/components/SketchAndGuessGameBoard'

// The real hook keeps one `t` across renders (lib/i18n-helpers.ts); a fresh one
// per render would make every callback that depends on it unstable.
jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

function buildGameData() {
  return {
    phase: 'guessing',
    currentRound: 1,
    totalRounds: 3,
    drawerOrder: ['user-2', 'user-1'],
    currentDrawerId: 'user-2',
    rounds: [
      {
        round: 1,
        drawerId: 'user-2',
        prompt: 'apple',
        drawingContent: null,
        drawingSubmittedAt: null,
        drawingAutoSubmitted: false,
        guesses: [],
        revealAt: null,
        isScored: false,
        scoredAt: null,
      },
    ],
    submittedPlayerIds: [],
    scores: { 'user-1': 0, 'user-2': 0 },
    scoreBreakdown: {},
    winnerId: null,
    ranking: [],
    completionReason: null,
    finishedAt: null,
    isMvpScaffold: false,
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
    ],
    onSubmitDrawing: jest.fn(),
    onSubmitGuess: jest.fn(() => new Promise(() => {})),
    onAdvanceRound: jest.fn(),
    isSubmitting: false,
    ...overrides,
  }
}

// #1006 — the guess box is cleared only after the round trip, so the typed word
// is still on screen while the request is out and pressing Enter again is the
// natural thing to do. The keyboard path went straight to handleSubmit, past
// the LoadingButton every other submit in this board goes through.
describe('SketchAndGuessGameBoard guess input (#1006)', () => {
  const guessBox = () => screen.getByPlaceholderText('games.guess_my_drawing.game.guessPlaceholder')

  it('ignores Enter once a guess of its own is in flight', () => {
    const props = buildProps()
    const { rerender } = render(<SketchAndGuessGameBoard {...props} />)

    fireEvent.change(guessBox(), { target: { value: 'apple' } })
    fireEvent.keyDown(guessBox(), { key: 'Enter' })
    expect(props.onSubmitGuess).toHaveBeenCalledTimes(1)

    // What the page does the moment the request leaves.
    rerender(<SketchAndGuessGameBoard {...props} isSubmitting />)

    expect(guessBox()).toBeDisabled()
    fireEvent.keyDown(guessBox(), { key: 'Enter' })
    expect(props.onSubmitGuess).toHaveBeenCalledTimes(1)
    expect(props.onSubmitGuess).toHaveBeenCalledWith('apple')
  })

  it('takes no keystrokes at all while a guess is in flight', () => {
    const props = buildProps({ isSubmitting: true })
    render(<SketchAndGuessGameBoard {...props} />)

    expect(guessBox()).toBeDisabled()

    fireEvent.change(guessBox(), { target: { value: 'apple' } })
    fireEvent.keyDown(guessBox(), { key: 'Enter' })

    expect(props.onSubmitGuess).not.toHaveBeenCalled()
  })
})

/**
 * #1033 put this game on the spectator route, and #1032/#1034 must not take it
 * away again: a spectator watches the drawing appear and never gets the prompt
 * or a way to play. The prompt half is enforced server-side by
 * sanitizeSketchAndGuessStateForBroadcast; this is the half the board owns.
 */
describe('SketchAndGuessGameBoard for a spectator', () => {
  it('gives a spectator the drawing but no guess box', () => {
    const props = buildProps({ isSpectator: true, playerId: '' })
    const { container } = render(<SketchAndGuessGameBoard {...props} />)

    expect(container.querySelector('canvas')).not.toBeNull()
    expect(screen.queryByPlaceholderText('games.guess_my_drawing.game.guessPlaceholder')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.submitGuess')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.spectatorNotice')).not.toBeNull()
  })

  it('never puts the drawing tools in front of a spectator, even on the drawer seat', () => {
    // The drawing phase with the spectator sitting on the drawer's own id: the
    // one case where a missing !isSpectator would hand over the prompt.
    const gameData = buildGameData()
    gameData.phase = 'drawing'
    const props = buildProps({ gameData, isSpectator: true, playerId: 'user-2' })
    render(<SketchAndGuessGameBoard {...props} />)

    expect(screen.queryByText('games.guess_my_drawing.game.submitDrawing')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.yourPrompt')).toBeNull()
    expect(screen.queryByText('apple')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.waitingForDrawer')).not.toBeNull()
  })

  it('does not offer a spectator the button that ends the reveal', () => {
    const gameData = buildGameData()
    gameData.phase = 'reveal'
    const props = buildProps({ gameData, isSpectator: true, playerId: '' })
    render(<SketchAndGuessGameBoard {...props} />)

    expect(screen.queryByText('games.guess_my_drawing.game.nextRound')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.seeResults')).toBeNull()
    expect(screen.queryByText('games.guess_my_drawing.game.spectatorNotice')).not.toBeNull()
  })
})
