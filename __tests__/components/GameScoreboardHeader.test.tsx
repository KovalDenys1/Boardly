import { render } from '@testing-library/react'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'

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
