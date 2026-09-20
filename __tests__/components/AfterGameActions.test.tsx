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

// The props are the whole point of slot 3: `source` is what separates the after-game ask
// from the profile checkbox it exists to beat, and `gameType` is the only dimension that
// says which end screen converts. A mock that ignored them let the real call site be
// rewritten to `<PushOptInNudge source="profile" />` with the suite still green.
jest.mock('@/components/PushOptInNudge', () => {
  return function MockPushNudge(props: { source: string; gameType?: string }) {
    return (
      <div
        data-testid="push-nudge"
        data-source={props.source}
        data-game-type={props.gameType ?? ''}
      />
    )
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

  it('offers the push ask to a registered player and never to a guest (#984)', () => {
    const { unmount } = render(
      <AfterGameActions gameType="alias" isRegistered registerUrl="/auth/register" />
    )
    const nudge = screen.getByTestId('push-nudge')
    expect(nudge.getAttribute('data-source')).toBe('after_game')
    expect(nudge.getAttribute('data-game-type')).toBe('alias')
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
    unmount()

    // A guest has no account to hang a subscription on, so the two boxes can never coexist.
    render(<AfterGameActions gameType="alias" isGuest registerUrl="/auth/register" />)
    expect(screen.queryByTestId('push-nudge')).toBeNull()
    expect(screen.getByTestId('guest-nudge')).toBeTruthy()
  })

  it('gives a spectator (neither guest nor registered) share and Discord only', () => {
    render(<AfterGameActions gameType="guess_the_spy" inviteCode="AB12" registerUrl="/auth/register" />)
    expect(screen.getByText('game.ui.playAgainWithFriends')).toBeTruthy()
    expect(screen.getByText('game.ui.discordAfterGame')).toBeTruthy()
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
    expect(screen.queryByTestId('push-nudge')).toBeNull()
  })
})
