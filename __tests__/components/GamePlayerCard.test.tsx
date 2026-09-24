import { render, screen } from '@testing-library/react'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('GamePlayerCard (#736 phase 3)', () => {
  const base = {
    name: 'Alice',
    isActive: false,
    isMe: false,
    isWinner: false,
    side: 'left' as const,
    accentColor: 'var(--bd-mint)',
  }

  it('shows "Your turn" on the active local player card', () => {
    render(<GamePlayerCard {...base} isActive isMe />)
    expect(screen.getByText('game.ui.yourTurn')).toBeTruthy()
    expect(screen.queryByText('game.ui.theirTurn')).toBeNull()
  })

  it("shows \"Their turn\" on the opponent's active card (the old Memory bug)", () => {
    render(<GamePlayerCard {...base} isActive isMe={false} />)
    expect(screen.getByText('game.ui.theirTurn')).toBeTruthy()
    expect(screen.queryByText('game.ui.yourTurn')).toBeNull()
  })

  it('shows no turn indicator when inactive', () => {
    render(<GamePlayerCard {...base} />)
    expect(screen.queryByText('game.ui.yourTurn')).toBeNull()
    expect(screen.queryByText('game.ui.theirTurn')).toBeNull()
  })

  it('renders win badge and premium crown', () => {
    render(<GamePlayerCard {...base} isWinner isPremium />)
    expect(screen.getByText('game.ui.winBadge')).toBeTruthy()
    expect(screen.getByTitle('Premium')).toBeTruthy()
  })

  it('renders the subline and avatar-initial fallback', () => {
    render(<GamePlayerCard {...base} subline="3W" />)
    expect(screen.getByText('3W')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
  })

  // The phone-landscape rules in globals.css shrink this card and hide the
  // two lines the status banner already shows (#901). They can only do that
  // through these classes, and only while the same numbers are not also in a
  // style prop – an inline style outranks every stylesheet rule.
  it('carries the classes the phone-landscape rules target', () => {
    const { container } = render(<GamePlayerCard {...base} isActive isMe subline="3W" />)
    expect(container.querySelector('.game-player-card--left')).not.toBeNull()
    expect(container.querySelector('.game-player-avatar--initial')).not.toBeNull()
    expect(container.querySelector('.game-player-identity')).not.toBeNull()
    expect(container.querySelector('.game-player-subline')).not.toBeNull()
    expect(container.querySelector('.game-player-turn')).not.toBeNull()
  })

  it('flips the card class, not a style prop, for the right-hand seat', () => {
    const { container } = render(<GamePlayerCard {...base} side="right" />)
    expect(container.querySelector('.game-player-card--right')).not.toBeNull()
    const card = container.querySelector('.game-player-card') as HTMLElement
    expect(card.style.flexDirection).toBe('')
    expect(card.style.gap).toBe('')
    expect(card.style.padding).toBe('')
  })

  it('keeps no size in the avatar style prop', () => {
    const { container } = render(<GamePlayerCard {...base} />)
    const avatar = container.querySelector('.game-player-avatar') as HTMLElement
    expect(avatar.style.width).toBe('')
    expect(avatar.style.height).toBe('')
  })
})

describe('GamePlayerCard active motion (#1111)', () => {
  const base = {
    name: 'Alice',
    isActive: false,
    isMe: true,
    isWinner: false,
    side: 'left' as const,
    accentColor: 'var(--bd-coral)',
  }

  it('marks the active turn with a class for the CSS plate, not inline colours', () => {
    const { container, rerender } = render(<GamePlayerCard {...base} />)
    const card = container.querySelector('.game-player-card') as HTMLElement
    expect(card.classList.contains('game-player-card--active')).toBe(false)
    expect(card.style.background).toBe('')
    expect(card.style.border).toBe('')
    expect(card.style.boxShadow).toBe('')

    rerender(<GamePlayerCard {...base} isActive />)
    const active = container.querySelector('.game-player-card') as HTMLElement
    // Same node: the plate transitions in, the card is not remounted.
    expect(active).toBe(card)
    expect(active.classList.contains('game-player-card--active')).toBe(true)
    expect(active.style.background).toBe('')
    expect(container.querySelector('.game-player-turn')?.className).toContain('game-status-cue')
  })
})
