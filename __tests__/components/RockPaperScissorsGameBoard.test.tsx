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
