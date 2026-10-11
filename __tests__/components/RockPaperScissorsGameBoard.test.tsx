import { act, render } from '@testing-library/react'
import RockPaperScissorsGameBoard, { RPS_REVEAL_MS, RPS_SHAKE_MS } from '@/components/RockPaperScissorsGameBoard'
import type { RockPaperScissorsGameData } from '@/lib/games/rock-paper-scissors-game'

const mockPrefersReducedMotion = jest.fn(() => false)
jest.mock('@/lib/motion', () => ({
  prefersReducedMotion: () => mockPrefersReducedMotion(),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const PLAYERS = [
  { id: 'me', name: 'Denys' },
  { id: 'bot', name: 'Pattern' },
]

const RESOLVED = {
  mode: 'best-of-3',
  rounds: [{ choices: { me: 'paper', bot: 'scissors' }, winner: 'bot' }],
  playerChoices: { me: null, bot: null },
  scores: { me: 0, bot: 1 },
  playersReady: [],
  gameWinner: null,
} as unknown as RockPaperScissorsGameData

function handIcons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.rps-hand__emoji [data-icon]')).map((el) => el.getAttribute('data-icon'))
}

describe('RockPaperScissorsGameBoard reveal (#1287)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockPrefersReducedMotion.mockReturnValue(false)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows a shaking fist on both cards while the reveal is pending, then the throws', () => {
    const { container } = render(
      <RockPaperScissorsGameBoard gameData={RESOLVED} playerId="me" players={PLAYERS} onSubmitChoice={jest.fn()} />,
    )

    expect(handIcons(container)).toEqual(['rock', 'rock'])
    expect(container.querySelectorAll('.rps-hand--reveal.rps-hand--shaking')).toHaveLength(2)

    act(() => { jest.advanceTimersByTime(RPS_SHAKE_MS - 1) })
    expect(handIcons(container)).toEqual(['rock', 'rock'])

    act(() => { jest.advanceTimersByTime(1) })
    expect(handIcons(container)).toEqual(['paper', 'scissors'])
    expect(container.querySelectorAll('.rps-hand--shaking')).toHaveLength(0)
    expect(RPS_REVEAL_MS).toBe(1100)
  })

  it('shows the throws at once when the viewer prefers reduced motion', () => {
    mockPrefersReducedMotion.mockReturnValue(true)
    const { container } = render(
      <RockPaperScissorsGameBoard gameData={RESOLVED} playerId="me" players={PLAYERS} onSubmitChoice={jest.fn()} />,
    )

    expect(handIcons(container)).toEqual(['paper', 'scissors'])
    expect(container.querySelectorAll('.rps-hand--shaking')).toHaveLength(0)
  })
})

describe('RockPaperScissorsGameBoard round boundary (#1365)', () => {
  const OPENS_AT = 1_003_000

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(1_000_000)
    mockPrefersReducedMotion.mockReturnValue(false)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function tiles(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('.rps-tile'))
  }

  it('holds the result with the tiles shut, then opens the next round on its own', () => {
    const { container, getByText } = render(
      <RockPaperScissorsGameBoard gameData={{ ...RESOLVED, nextRoundAt: OPENS_AT }} playerId="me" players={PLAYERS} onSubmitChoice={jest.fn()} />,
    )

    act(() => { jest.advanceTimersByTime(OPENS_AT - 1_000_000 - 1) })
    expect(container.querySelector('.rps-stage--reveal')).not.toBeNull()
    expect(getByText('games.rock_paper_scissors.roundWonBy')).toBeTruthy()
    expect(tiles(container).every((tile) => tile.disabled)).toBe(true)

    act(() => { jest.advanceTimersByTime(1) })
    expect(container.querySelector('.rps-stage--reveal')).toBeNull()
    expect(container.querySelector('.rps-stage__result--round')?.textContent).toBe('games.rock_paper_scissors.roundNum')
    expect(tiles(container).every((tile) => !tile.disabled)).toBe(true)
  })

  it('keeps the same hold without the animation when the viewer prefers reduced motion', () => {
    mockPrefersReducedMotion.mockReturnValue(true)
    const { container } = render(
      <RockPaperScissorsGameBoard gameData={{ ...RESOLVED, nextRoundAt: OPENS_AT }} playerId="me" players={PLAYERS} onSubmitChoice={jest.fn()} />,
    )

    expect(handIcons(container)).toEqual(['paper', 'scissors'])
    act(() => { jest.advanceTimersByTime(OPENS_AT - 1_000_000 - 1) })
    expect(container.querySelector('.rps-stage--reveal')).not.toBeNull()
    act(() => { jest.advanceTimersByTime(1) })
    expect(container.querySelector('.rps-stage--reveal')).toBeNull()
  })

  it('opens at once when the round opened before the board mounted', () => {
    jest.setSystemTime(OPENS_AT + 10_000)
    const { container } = render(
      <RockPaperScissorsGameBoard gameData={{ ...RESOLVED, nextRoundAt: OPENS_AT }} playerId="me" players={PLAYERS} onSubmitChoice={jest.fn()} />,
    )

    act(() => { jest.advanceTimersByTime(0) })
    expect(container.querySelector('.rps-stage--reveal')).toBeNull()
    expect(tiles(container).every((tile) => !tile.disabled)).toBe(true)
  })
})
