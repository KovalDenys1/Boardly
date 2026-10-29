import { render, screen, fireEvent } from '@testing-library/react'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/components/GuestConversionNudge', () => {
  return function MockNudge({ hasReplay }: { hasReplay?: boolean }) {
    return <div data-testid="guest-nudge" data-has-replay={String(Boolean(hasReplay))} />
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

  it('shows a guest who finished a game no signup prompt (#1515)', () => {
    render(<AfterGameActions gameType="memory" inviteCode="AB12" gameId="game-42" isGuest />)
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
    expect(screen.getByText('game.ui.playAgainWithFriends')).toBeTruthy()
    expect(screen.getByText('game.ui.discordAfterGame')).toBeTruthy()
  })

  it('offers the push ask to a registered player and never to a guest (#984)', () => {
    const { unmount } = render(
      <AfterGameActions gameType="alias" isRegistered />
    )
    const nudge = screen.getByTestId('push-nudge')
    expect(nudge.getAttribute('data-source')).toBe('after_game')
    expect(nudge.getAttribute('data-game-type')).toBe('alias')
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
    unmount()

    // A guest has no account to hang a subscription on.
    render(<AfterGameActions gameType="alias" isGuest />)
    expect(screen.queryByTestId('push-nudge')).toBeNull()
  })

  it('leaves the push ask out of the result dialog\'s More list, which shows it on its main view', () => {
    render(<AfterGameActions gameType="alias" isRegistered variant="menu" />)
    expect(screen.getByText('game.ui.discordAfterGame')).toBeTruthy()
    expect(screen.queryByTestId('push-nudge')).toBeNull()
  })

  it('gives a spectator (neither guest nor registered) share and Discord only', () => {
    render(<AfterGameActions gameType="guess_the_spy" inviteCode="AB12" />)
    expect(screen.getByText('game.ui.playAgainWithFriends')).toBeTruthy()
    expect(screen.getByText('game.ui.discordAfterGame')).toBeTruthy()
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
    expect(screen.queryByTestId('push-nudge')).toBeNull()
  })

  describe('Watch replay (#1421)', () => {
    const replayLink = () => screen.queryByRole('link', { name: 'profile.gameReplay.watch' }) as HTMLAnchorElement | null

    it('links a signed-in player of a finished game to its replay', () => {
      render(<AfterGameActions gameType="memory" gameId="game-42" isRegistered />)
      expect(replayLink()?.getAttribute('href')).toBe('/replay/game-42')
    })

    it('links a guest to the replay of the game they just played (#1440)', () => {
      render(<AfterGameActions gameType="memory" gameId="game-42" isGuest />)
      expect(replayLink()?.getAttribute('href')).toBe('/replay/game-42')
    })

    it('shows a spectator no replay link', () => {
      render(<AfterGameActions gameType="memory" gameId="game-42" />)
      expect(replayLink()).toBeNull()
    })

    it('needs the game id and a game the replay page can draw', () => {
      const { unmount } = render(<AfterGameActions gameType="memory" isRegistered />)
      expect(replayLink()).toBeNull()
      unmount()
      render(<AfterGameActions gameType="alias" gameId="game-42" isRegistered />)
      expect(replayLink()).toBeNull()
    })
  })
})
