import { render, screen } from '@testing-library/react'
import ReplayViewerModal from '@/components/ReplayViewerModal'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'profile.gameReplay.summaryWinner' && options) {
        return `${key}:${options.player}`
      }

      if (key === 'profile.gameReplay.stepOf' && options) {
        return `${key}:${options.current}/${options.total}`
      }

      if (key === 'profile.gameReplay.stepLabel' && options) {
        return `${key}:${options.value}`
      }

      if (key === 'profile.gameReplay.rankValue' && options) {
        return `${key}:${options.value}`
      }

      return key
    },
  }),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/components/LoadingSpinner', () => {
  function MockLoadingSpinner() {
    return <div>loading-spinner</div>
  }

  return MockLoadingSpinner
})

jest.mock('@/components/Modal', () => {
  function MockModal({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean
    title?: string
    children: React.ReactNode
  }) {
    if (!isOpen) return null

    return (
      <div>
        <div>{title}</div>
        <div>{children}</div>
      </div>
    )
  }

  return MockModal
})

const originalFetch = global.fetch
const mockFetch = jest.fn()

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('ReplayViewerModal', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as any
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as any
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders a user-friendly replay overview with controls and moments', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        game: {
          id: 'game-1',
          lobbyCode: 'ABCD12',
          lobbyName: 'Friday Finals',
          gameType: 'chess',
          status: 'finished',
          createdAt: '2026-03-01T10:00:00.000Z',
          updatedAt: '2026-03-01T10:15:00.000Z',
          endedAt: '2026-03-01T10:15:00.000Z',
          durationMs: 15 * 60 * 1000,
          players: [
            {
              userId: 'user-1',
              username: 'Player One',
              isBot: false,
            },
            {
              userId: 'user-2',
              username: 'Player Two',
              isBot: false,
            },
          ],
        },
        replay: {
          count: 2,
          snapshots: [
            {
              id: 'snapshot-1',
              turnNumber: 0,
              playerId: 'user-1',
              actionType: 'game:start',
              actionPayload: null,
              state: {
                status: 'playing',
                players: [
                  { id: 'user-1', score: 0, isWinner: false },
                  { id: 'user-2', score: 0, isWinner: false },
                ],
              },
              createdAt: '2026-03-01T10:00:10.000Z',
            },
            {
              id: 'snapshot-2',
              turnNumber: 1,
              playerId: 'user-1',
              actionType: 'place',
              actionPayload: { row: 0, col: 0 },
              state: {
                status: 'finished',
                winner: 'user-1',
                players: [
                  { id: 'user-1', score: 1, isWinner: true },
                  { id: 'user-2', score: 0, isWinner: false },
                ],
              },
              createdAt: '2026-03-01T10:15:00.000Z',
            },
          ],
        },
      })
    )

    render(<ReplayViewerModal gameId="game-1" onClose={jest.fn()} />)

    expect(await screen.findByText('Friday Finals')).toBeTruthy()
    expect(screen.getByText('profile.gameReplay.summaryWinner:Player One')).toBeTruthy()
    expect(screen.getByText('profile.gameReplay.duration')).toBeTruthy()
    expect(screen.getByText('profile.gameReplay.started')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'profile.gameReplay.play' })).toBeTruthy()
    expect(screen.getByText('profile.gameReplay.timeline')).toBeTruthy()
    expect(screen.getByText('profile.gameReplay.currentStep')).toBeTruthy()
    expect(screen.getByText('profile.gameReplay.scoreboard')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'profile.gameReplay.download' }).getAttribute('href')
    ).toBe('/api/game/game-1/replay?download=1')
  })
})
