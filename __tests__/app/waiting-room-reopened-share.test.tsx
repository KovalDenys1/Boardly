/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import WaitingRoom from '@/app/(site)/lobby/[code]/components/WaitingRoom'

/**
 * A reopened table is empty but for the one who came back (#1594), and the only thing that
 * fills it is the link reaching the friend. So the room opens on the share button.
 */

const mockShare = jest.fn()

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn() }))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('@/hooks/useInviteShare', () => ({ useInviteShare: () => mockShare }))
jest.mock('@/components/LobbyThemeBanner', () => ({ __esModule: true, default: () => null, RICH_BANNER_THEMES: [] }))
jest.mock('@/app/(site)/lobby/[code]/components/TryBotGamesBanner', () => ({ __esModule: true, default: () => null }))

function renderRoom(leadWithShare?: boolean) {
  const lobby = { code: '4821', gameType: 'connect_four', maxPlayers: 2, creatorId: 'u0' }
  const game = { players: [{ id: 'p0', userId: 'u0', name: 'Ben', user: { username: 'Ben' } }] }
  return render(
    <WaitingRoom
      game={game as never}
      lobby={lobby as never}
      gameEngine={null}
      minPlayers={2}
      getCurrentUserId={() => 'u0'}
      onInviteFriends={() => undefined}
      leadWithShare={leadWithShare}
    />
  )
}

describe('WaitingRoom after a reopen', () => {
  beforeEach(() => mockShare.mockClear())

  it('leads with the share button, above the players', () => {
    renderRoom(true)

    const share = screen.getByRole('button', { name: /lobby\.reopen\.share/ })
    const firstPlayer = screen.getByText('Ben')
    expect(share.compareDocumentPosition(firstPlayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('lobby.reopen.sharedTitle')).toBeTruthy()

    fireEvent.click(share)
    expect(mockShare).toHaveBeenCalledWith('table_reopened')
  })

  it('shows no share lead in an ordinary waiting room', () => {
    renderRoom()

    expect(screen.queryByRole('button', { name: /lobby\.reopen\.share/ })).toBeNull()
  })
})
