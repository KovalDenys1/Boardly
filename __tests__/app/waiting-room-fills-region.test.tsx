/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import WaitingRoom from '@/app/lobby/[code]/components/WaitingRoom'

// WaitingRoom reaches lib/analytics through WaitingRoomDiscordHint (#982), and
// @vercel/analytics ships ESM that jest does not transform.
jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))
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

function renderRoom(playerCount: number) {
  const lobby = { code: 'ABCD', gameType: 'tic_tac_toe', maxPlayers: 2, creatorId: 'host' }
  const game = {
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
      getCurrentUserId={() => 'u0'}
    />
  )
}

describe('WaitingRoom – the region under the player list is not empty (#899)', () => {
  it('ends with the guide instead of stopping at the last row', () => {
    // A full lobby renders no empty slots, which is the case that left ~340 px of
    // blank card above the Start bar at 1280x900.
    renderRoom(2)
    expect(screen.getByText('game.ui.howToPlayTitle')).toBeTruthy()
    expect(screen.getByText('game.ui.howToPlayRuleTicTacToe')).toBeTruthy()
  })

  it('stretches its column so the guide can take the slack', () => {
    const { container } = renderRoom(2)
    // The gap was a short block in a taller scroll area; the fix is the column
    // filling that area and the guide (flex-1) absorbing what is left over.
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('min-h-full')
    expect(root.className).toContain('flex-col')
    const guide = screen.getByText('game.ui.howToPlayTitle').closest('section')
    expect(guide?.className).toContain('flex-1')
  })
})
