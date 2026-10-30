import { render, screen } from '@testing-library/react'
import GameStatusBanner, { type GameTurn } from '@/components/game-chrome/GameStatusBanner'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))
jest.mock('@/lib/i18n-helpers', () => {
  const { englishT } = jest.requireActual('@/__tests__/fixtures/english-t')
  return { useTranslation: () => ({ t: englishT }) }
})

const base = { isFinished: false, secs: 30, turnTimerLimit: 60, barColor: 'var(--bd-sun)' }

/** The banner's one line, read as the player reads it. */
function lineFor(turn: GameTurn, extra: { isSpectator?: boolean } = {}) {
  const { unmount } = render(<GameStatusBanner {...base} {...extra} turn={turn} />)
  const text = screen.getByTestId('game-status-title').textContent
  unmount()
  return text
}

describe('one status grammar, "<whose turn>: <what to do>" (#1566)', () => {
  it.each<[GameTurn, string]>([
    [{ whose: 'you', action: 'drop a disc' }, 'Your turn: drop a disc'],
    [{ whose: 'everyone', action: 'vote for the spy' }, "Everyone's turn: vote for the spy"],
  ])('tells the viewer what to do on a turn they act in: %j', (turn, line) => {
    expect(lineFor(turn)).toBe(line)
  })

  it("says what another player is doing, never what to do", () => {
    expect(lineFor({ whose: 'player', player: 'Anna', doing: 'dropping a disc' })).toBe("Anna's turn: dropping a disc")
    expect(lineFor({ whose: 'player', player: 'Anna', doing: 'dropping a disc' }, { isSpectator: true })).toBe("Anna's turn: dropping a disc")
  })

  it('keeps a game\'s own line between turns, when nobody acts', () => {
    expect(lineFor({ whose: 'nobody', line: 'Revealing…' })).toBe('Revealing…')
  })
})
