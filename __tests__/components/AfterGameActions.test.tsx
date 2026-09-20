import { render, screen, fireEvent } from '@testing-library/react'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/components/GuestConversionNudge', () => {
  return function MockNudge() {
    return <div data-testid="guest-nudge" />
  }
})

const mockShare = jest.fn()
jest.mock('@/hooks/useInviteShare', () => ({
  useInviteShare: () => mockShare,
}))

const mockTrackDiscordCta = jest.fn()
jest.mock('@/lib/analytics', () => ({
  trackDiscordCta: (...args: unknown[]) => mockTrackDiscordCta(...args),
}))

function discordLink() {
  return screen.getByText('game.ui.discordAfterGame').closest('a') as HTMLAnchorElement
}

describe('AfterGameActions (#982)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('offers the share CTA only when a lobby code is given', () => {
    const { unmount } = render(<AfterGameActions gameType="yahtzee" />)
    expect(screen.queryByText('game.ui.playAgainWithFriends')).toBeNull()
    unmount()

    render(<AfterGameActions gameType="yahtzee" inviteCode="AB12" />)
    fireEvent.click(screen.getByText('game.ui.playAgainWithFriends'))
    expect(mockShare).toHaveBeenCalledWith('result_overlay')
  })

  it('always shows the Discord line, opening in a new tab, and tracks the click with the game', () => {
    render(<AfterGameActions gameType="yahtzee" />)

    const link = discordLink()
    expect(link.getAttribute('href')).toBe('/discord')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')

    // No "shown" event: this renders on every finished game and would drown the flow table.
    expect(mockTrackDiscordCta).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(mockTrackDiscordCta).toHaveBeenCalledWith('after_game', 'yahtzee')
  })

  it('shows the guest nudge only for a guest with a registerUrl', () => {
    const { unmount } = render(
      <AfterGameActions gameType="memory" isGuest registerUrl="/auth/register" />
    )
    expect(screen.getByTestId('guest-nudge')).toBeTruthy()
    unmount()

    render(<AfterGameActions gameType="memory" isGuest />)
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
  })

  it('never shows the guest nudge to a registered player', () => {
    render(<AfterGameActions gameType="alias" isRegistered registerUrl="/auth/register" />)
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
    expect(screen.getByText('game.ui.discordAfterGame')).toBeTruthy()
  })

  it('gives a spectator (neither guest nor registered) share and Discord only', () => {
    render(<AfterGameActions gameType="guess_the_spy" inviteCode="AB12" registerUrl="/auth/register" />)
    expect(screen.getByText('game.ui.playAgainWithFriends')).toBeTruthy()
    expect(screen.getByText('game.ui.discordAfterGame')).toBeTruthy()
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
  })
})
