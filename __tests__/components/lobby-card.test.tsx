import { render, screen } from '@testing-library/react'
import LobbyCard, { type LobbyCardData } from '@/components/LobbyCard'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, value?: string | Record<string, unknown>) => {
      if (typeof value === 'string') return value
      if (value && typeof value === 'object' && 'count' in value) {
        return `${key}:${String((value as { count: number }).count)}`
      }
      return key
    },
  }),
}))

describe('LobbyCard responsive text handling', () => {
  it('keeps long lobby names truncated to avoid mobile overflow', () => {
    const longLobbyName =
      'Extremely long lobby name that would normally overflow on narrow mobile screens if truncation was missing'

    const lobby: LobbyCardData = {
      id: 'lobby-1',
      code: 'A1B2C',
      name: longLobbyName,
      gameType: 'rock_paper_scissors',
      isPrivate: false,
      maxPlayers: 4,
      allowSpectators: true,
      spectatorCount: 2,
      creator: {
        username: 'owner-with-a-very-long-name',
        email: 'owner@example.com',
      },
      games: [
        {
          id: 'game-1',
          status: 'playing',
          _count: {
            players: 3,
          },
        },
      ],
    }

    render(
      <LobbyCard
        lobby={lobby}
        index={0}
        onOpenLobby={jest.fn()}
        onWatchLobby={jest.fn()}
      />
    )

    const lobbyHeading = screen.getByTitle(longLobbyName)
    expect(lobbyHeading.className).toContain('truncate')
  })
})
