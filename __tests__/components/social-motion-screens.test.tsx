// @ts-nocheck
/**
 * Motion wiring for the conversation games (#1115): the entry classes are
 * added only for what changed while the screen was mounted, never for the
 * state a screen mounts into.
 */
import { render, screen } from '@testing-library/react'
import SketchAndGuessGameBoard from '@/components/SketchAndGuessGameBoard'
import SpyRoleReveal from '@/components/SpyRoleReveal'
import SpyResults from '@/components/SpyResults'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t, i18n: { language: 'en' } }) }
})

const CAT = { id: 'cat', en: ['cat'], no: ['katt'], ru: ['кошка'], uk: ['кіт'] }

function gameData(phase = 'drawing', guesses = [], extra = {}) {
  return {
    phase,
    phaseStartedAt: Date.now(),
    currentRound: 1,
    totalRounds: 3,
    drawerOrder: ['user-2', 'user-1', 'user-3'],
    currentDrawerId: 'user-2',
    rounds: [{
      round: 1, drawerId: 'user-2', prompt: '', word: CAT, wordChoices: [], wordAutoPicked: false,
      drawingStartedAt: Date.now(), drawingContent: null, drawingSubmittedAt: null, drawingAutoSubmitted: false,
      guesses, revealAt: null, isScored: false, scoredAt: null,
    }],
    submittedPlayerIds: [],
    scores: { 'user-1': 0, 'user-2': 0, 'user-3': 0 },
    scoreBreakdown: {}, winnerId: null, ranking: [], completionReason: null, finishedAt: null, isMvpScaffold: false,
    ...extra,
  }
}

const boardProps = (data) => ({
  gameData: data,
  gameStatus: 'playing',
  playerId: 'user-1',
  players: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }, { id: 'user-3', name: 'Cara' }],
  onSubmitGuess: jest.fn(async () => {}),
  onAdvanceRound: jest.fn(),
  onChooseWord: jest.fn(async () => {}),
  onAcceptGuess: jest.fn(async () => {}),
  isSubmitting: false,
})

describe('Sketch & Guess motion', () => {
  const g1 = { id: 'r1-g1', playerId: 'user-3', guess: 'dog', submittedAt: 1, isCorrect: false }
  const g2 = { id: 'r1-g2', playerId: 'user-3', guess: '', submittedAt: 2, isCorrect: true }

  it('does not animate the guesses a feed mounts with, but lands the next one', () => {
    const { container, rerender } = render(<SketchAndGuessGameBoard {...boardProps(gameData('drawing', [g1]))} />)
    expect(container.querySelector('.social-entry-in, .social-entry-hit')).toBeNull()
    rerender(<SketchAndGuessGameBoard {...boardProps(gameData('drawing', [g1, g2]))} />)
    const items = container.querySelectorAll('.sketch-feed__item')
    // Newest first in the DOM; a correct guess gets the emphasis, not the plain slide.
    expect(items[0].className).toContain('social-entry-hit')
    expect(items[1].className).not.toContain('social-entry')
  })

  it('scales the reveal in when it opens, not when a board mounts on it', () => {
    const { rerender } = render(<SketchAndGuessGameBoard {...boardProps(gameData('drawing'))} />)
    rerender(<SketchAndGuessGameBoard {...boardProps(gameData('reveal'))} />)
    expect(screen.getByTestId('sketch-reveal-view').className).toContain('sketch-reveal-in')

    render(<SketchAndGuessGameBoard {...boardProps(gameData('reveal'))} />)
    const views = screen.getAllByTestId('sketch-reveal-view')
    expect(views[1].className).not.toContain('sketch-reveal-in')
  })
})

describe('Guess the Spy motion', () => {
  const roleProps = { role: 'Spy', possibleCategories: ['Beach'], onReady: jest.fn(), playersReady: 1, totalPlayers: 4, isReady: false }

  it('turns the role card over only when asked, and fills the ready meter by transform', () => {
    const { rerender } = render(<SpyRoleReveal {...roleProps} />)
    expect(screen.getByTestId('spy-role-flip').className).not.toContain('--play')
    rerender(<SpyRoleReveal {...roleProps} flip />)
    expect(screen.getByTestId('spy-role-flip').className).toContain('spy-role-flip__inner--play')
    const fill = document.querySelector('.spy-ready-meter > .social-meter-fill') as HTMLElement
    expect(fill.style.transform).toBe('scaleX(0.25)')
    expect(fill.style.width).toBe('')
  })

  it('staggers the results in only while they are fresh', () => {
    const players = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cy' }]
    const props = {
      players, votes: { a: 'b', c: 'b' }, eliminatedId: 'b', spyId: 'b', location: 'Beach',
      scores: { a: 1, c: 1 }, currentRound: 1, totalRounds: 3,
    }
    const { container, rerender } = render(<SpyResults {...props} />)
    expect(container.querySelector('.social-rise, .social-entry-hit')).toBeNull()
    rerender(<SpyResults {...props} reveal />)
    expect(container.querySelectorAll('.spy-score-row.social-rise')).toHaveLength(3)
    // The spy's vote row is the one that lands with an overshoot.
    expect(container.querySelectorAll('.spy-result-row.social-entry-hit')).toHaveLength(1)
  })

  it('keeps a ten-seat table in order: every score row starts after the one above it', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const scores = Object.fromEntries(players.map((p, i) => [p.id, 100 - i]))
    const { container } = render(
      <SpyResults players={players} votes={{}} eliminatedId="" spyId="p3" location="Beach" scores={scores} currentRound={1} totalRounds={3} reveal />,
    )
    const delays = [...container.querySelectorAll('.spy-score-row')].map((row) => parseInt((row as HTMLElement).style.animationDelay, 10))
    expect(delays).toHaveLength(10)
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1])
  })
})
