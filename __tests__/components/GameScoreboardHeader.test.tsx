import { render } from '@testing-library/react'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'

jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

/**
 * The class contract the phone-landscape rules in globals.css depend on
 * (#901). Nothing here can be asserted from computed styles: the rules live
 * inside a media query and jsdom resolves none.
 */
describe('GameScoreboardHeader', () => {
  const base = {
    leftCard: <span>left</span>,
    center: <span>full centre</span>,
    rightCard: <span>right</span>,
  }

  it('renders the three cells with the classes the stylesheet targets', () => {
    const { container } = render(<GameScoreboardHeader {...base} />)
    const header = container.querySelector('.game-scoreboard-header')
    expect(header).not.toBeNull()
    expect(container.querySelector('.game-scoreboard-cell--left')).not.toBeNull()
    expect(container.querySelector('.game-scoreboard-center')).not.toBeNull()
    expect(container.querySelector('.game-scoreboard-cell--right')).not.toBeNull()
  })

  it('carries no geometry in a style prop, which no breakpoint could override', () => {
    const { container } = render(<GameScoreboardHeader {...base} />)
    const header = container.querySelector('.game-scoreboard-header') as HTMLElement
    expect(header.getAttribute('style')).toBeNull()
  })

  it('renders both centres and flags the compact one when a game supplies it', () => {
    const { container, getByText } = render(
      <GameScoreboardHeader {...base} centerCompact={<span>1 : 2</span>} />
    )
    expect(container.querySelector('.game-scoreboard-header--has-compact')).not.toBeNull()
    expect(container.querySelectorAll('.game-scoreboard-center')).toHaveLength(2)
    expect(getByText('full centre')).toBeTruthy()
    expect(getByText('1 : 2')).toBeTruthy()
  })

  it('renders only the full centre when a game supplies none', () => {
    const { container } = render(<GameScoreboardHeader {...base} />)
    expect(container.querySelector('.game-scoreboard-header--has-compact')).toBeNull()
    expect(container.querySelector('.game-scoreboard-center--compact')).toBeNull()
  })

  it('keeps the trailing control beside the right card', () => {
    const { container, getByText } = render(
      <GameScoreboardHeader {...base} trailing={<button>Leave</button>} />
    )
    const right = container.querySelector('.game-scoreboard-cell--right') as HTMLElement
    expect(right.contains(getByText('Leave'))).toBe(true)
    expect(right.querySelector('.game-scoreboard-right-card')).not.toBeNull()
  })
})

describe('GameScoreboardHeader as the one header (#1577)', () => {
  const names = ['Mia', 'Noah', 'Liv', 'Jonas', 'Emma', 'Oskar']
  const row = (active: number, count = 4) =>
    names.slice(0, count).map((name, index) => (
      <div key={name} data-active={index === active ? 'true' : 'false'}>{name}</div>
    ))

  it('keeps the current-turn player at its index in the player row when the turn passes', () => {
    const { container, rerender } = render(<GameScoreboardHeader players={row(0)} />)
    const order = () =>
      [...container.querySelectorAll('.game-scoreboard-players > .game-scoreboard-player')].map((cell) => cell.textContent)
    const active = () =>
      [...container.querySelectorAll('.game-scoreboard-player')].findIndex((cell) => cell.querySelector('[data-active="true"]'))

    expect(order()).toEqual(['Mia', 'Noah', 'Liv', 'Jonas'])
    expect(active()).toBe(0)
    rerender(<GameScoreboardHeader players={row(2)} />)
    expect(order()).toEqual(['Mia', 'Noah', 'Liv', 'Jonas'])
    expect(active()).toBe(2)
  })

  it('gives every seat the same track, from two players to eight', () => {
    for (const count of [2, 3, 6]) {
      const { container, unmount } = render(<GameScoreboardHeader players={row(0, count)} />)
      const players = container.querySelector('.game-scoreboard-players') as HTMLElement
      expect(players.style.getPropertyValue('--game-header-seats')).toBe(String(count))
      expect(players.querySelectorAll(':scope > .game-scoreboard-player')).toHaveLength(count)
      unmount()
    }
  })

  it('puts the game, the room and Leave in the header itself', () => {
    const onLeave = jest.fn()
    const { container, getByText, getByRole } = render(
      <GameScoreboardHeader
        leftCard={<span>left</span>}
        center={<span>0 : 0</span>}
        rightCard={<span>right</span>}
        room={{ gameId: 'connect-four', title: 'Connect Four', code: '7492', onLeave }}
      />
    )
    const header = container.querySelector('.game-header') as HTMLElement
    const bar = header.querySelector('.game-header__title') as HTMLElement
    expect(bar.contains(getByText('Connect Four'))).toBe(true)
    expect(bar.contains(getByText('#7492'))).toBe(true)
    const leave = getByRole('button', { name: 'game.ui.leave' })
    expect(header.querySelector('.game-header__actions')?.contains(leave)).toBe(true)
    leave.click()
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
