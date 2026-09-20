/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react'
import WaitingRoom from '@/app/lobby/[code]/components/WaitingRoom'

jest.mock('@/lib/sounds', () => ({ sounds: { play: jest.fn() } }))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('@/hooks/useInviteShare', () => ({ useInviteShare: () => jest.fn() }))
jest.mock('@/components/LobbyThemeBanner', () => ({
  __esModule: true,
  default: () => null,
  RICH_BANNER_THEMES: [],
}))
jest.mock('@/app/lobby/[code]/components/TryBotGamesBanner', () => ({
  __esModule: true,
  default: () => null,
}))

const mockTrackDiscordCta = jest.fn()
jest.mock('@/lib/analytics', () => ({
  trackDiscordCta: (...args: unknown[]) => mockTrackDiscordCta(...args),
  toAnalyticsGameType: (value: unknown) => value,
}))

const HINT = 'game.ui.aloneDiscordHint'
const ALONE_DELAY_MS = 20_000

function renderRoom({
  playerCount = 1,
  currentUserId = 'u0',
  createdAt = new Date().toISOString(),
}: { playerCount?: number; currentUserId?: string; createdAt?: string } = {}) {
  const lobby = { code: 'ABCD', gameType: 'yahtzee', maxPlayers: 4, creatorId: 'u0' }
  const game = {
    createdAt,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i}`,
      userId: `u${i}`,
      name: `Player ${i}`,
      user: {},
    })),
  }
  return render(
    <WaitingRoom
      game={game as never}
      lobby={lobby as never}
      gameEngine={null}
      minPlayers={2}
      getCurrentUserId={() => currentUserId}
    />
  )
}

describe('WaitingRoomDiscordHint – the lone host (#982)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  it('stays hidden while the host has only just created the lobby', () => {
    renderRoom()
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it('appears once the host has been alone for the delay', () => {
    renderRoom()

    act(() => {
      jest.advanceTimersByTime(ALONE_DELAY_MS)
    })

    expect(screen.queryByText(HINT)).not.toBeNull()
  })

  it('renders immediately when the lobby has already been open longer than the delay', () => {
    renderRoom({ createdAt: new Date(Date.now() - 120_000).toISOString() })
    expect(screen.queryByText(HINT)).not.toBeNull()
  })

  it('is gone as soon as somebody joins', () => {
    renderRoom({ playerCount: 2, createdAt: new Date(Date.now() - 120_000).toISOString() })
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it('is not shown to a player who is not the host', () => {
    renderRoom({ currentUserId: 'someone-else', createdAt: new Date(Date.now() - 120_000).toISOString() })
    expect(screen.queryByText(HINT)).toBeNull()
  })

  it('links to /discord in a new tab and tracks the click with the waiting-room source', () => {
    renderRoom({ createdAt: new Date(Date.now() - 120_000).toISOString() })

    const link = screen.getByText(HINT).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/discord')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')

    act(() => {
      link.click()
    })
    expect(mockTrackDiscordCta).toHaveBeenCalledWith('waiting_room', 'yahtzee')
  })
})
