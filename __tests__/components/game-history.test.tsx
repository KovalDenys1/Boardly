import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GameHistory from '@/components/GameHistory'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'profile.gameHistory.showing' && options) {
        return `${key}:${options.start}-${options.end}-${options.total}`
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

jest.mock('@/components/GameResultsModal', () => {
  function MockGameResultsModal({ gameId }: { gameId: string | null }) {
    return <div>results-modal:{gameId ?? 'closed'}</div>
  }

  return MockGameResultsModal
})

jest.mock('@/components/ReplayViewerModal', () => {
  function MockReplayViewerModal({ gameId }: { gameId: string | null }) {
    return <div>replay-modal:{gameId ?? 'closed'}</div>
  }

  return MockReplayViewerModal
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

describe('GameHistory', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as any
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as any
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the game cards and opens details and replay actions', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        games: [
          {
            id: 'game-1',
            lobbyCode: 'ABCD1',
            lobbyName: 'Friday Match',
            gameType: 'chess',
            status: 'finished',
            createdAt: '2026-03-01T10:00:00.000Z',
            updatedAt: '2026-03-01T10:30:00.000Z',
            abandonedAt: null,
            hasReplay: true,
            players: [
              {
                id: 'player-1',
                username: 'Player One',
                avatar: null,
                isBot: false,
                score: 0,
                finalScore: 1,
                placement: 1,
                isWinner: true,
              },
              {
                id: 'player-2',
                username: 'Player Two',
                avatar: null,
                isBot: false,
                score: 0,
                finalScore: 0,
                placement: 2,
                isWinner: false,
              },
            ],
          },
        ],
        pagination: {
          limit: 20,
          offset: 0,
          totalCount: 1,
          hasMore: false,
        },
      })
    )

    render(<GameHistory />)

    expect(await screen.findByText('Friday Match')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'profile.gameHistory.title' })).toBeTruthy()
    expect(screen.getByText('profile.gameHistory.showing:1-1-1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'profile.gameHistory.clickToView' }))

    await waitFor(() => {
      expect(screen.getByText('results-modal:game-1')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'profile.gameReplay.watch' }))

    await waitFor(() => {
      expect(screen.getByText('replay-modal:game-1')).toBeTruthy()
    })
  })

  it('shows the empty state when there are no games', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        games: [],
        pagination: {
          limit: 20,
          offset: 0,
          totalCount: 0,
          hasMore: false,
        },
      })
    )

    render(<GameHistory />)

    expect((await screen.findAllByText('profile.gameHistory.noGames')).length).toBeGreaterThan(0)
    expect(screen.getByText('results-modal:closed')).toBeTruthy()
    expect(screen.getByText('replay-modal:closed')).toBeTruthy()
  })
})
