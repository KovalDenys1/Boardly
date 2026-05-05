import { render, screen, waitFor } from '@testing-library/react'
import PlayerStatsDashboard from '@/components/PlayerStatsDashboard'

const mockTranslate = (key: string) => key

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: mockTranslate,
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

const originalFetch = global.fetch
const mockFetch = jest.fn()

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('PlayerStatsDashboard', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as any
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as any
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders summary cards and updates the selected game analytics', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        userId: 'user-1',
        overall: {
          totalGames: 24,
          wins: 18,
          losses: 4,
          draws: 2,
          winRate: 75,
          avgGameDurationMinutes: 18,
          favoriteGame: 'chess',
          currentWinStreak: 3,
          longestWinStreak: 7,
        },
        byGame: [
          {
            gameType: 'chess',
            gamesPlayed: 10,
            wins: 8,
            losses: 1,
            draws: 1,
            winRate: 80,
            avgScore: null,
            bestScore: null,
            lastPlayed: '2026-03-12T12:00:00.000Z',
          },
          {
            gameType: 'memory',
            gamesPlayed: 6,
            wins: 4,
            losses: 2,
            draws: 0,
            winRate: 67,
            avgScore: 120,
            bestScore: 160,
            lastPlayed: '2026-03-15T12:00:00.000Z',
          },
        ],
        trends: [],
        generatedAt: '2026-03-16T12:00:00.000Z',
      })
    )

    render(<PlayerStatsDashboard userId="user-1" />)

    expect(await screen.findByText('profile.stats.dashboard.title')).toBeTruthy()
    expect(screen.getByText('24')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('1080profile.stats.dashboard.summary.secondsSuffix')).toBeTruthy()

    expect(mockFetch).toHaveBeenCalledWith('/api/user/user-1/stats', { cache: 'no-store' })

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'profile.stats.dashboard.filters.gameLabel',
        }).textContent
      ).toContain('Memory')
    })

    expect(screen.getAllByText('160')).toHaveLength(2)
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.getByText('profile.stats.dashboard.gameProfiles.memory.title')).toBeTruthy()
    expect(screen.getByText('profile.stats.dashboard.gameProfiles.memory.description')).toBeTruthy()
  })

  it('uses game-specific analytics for tic-tac-toe instead of score metrics', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        userId: 'user-1',
        overall: {
          totalGames: 9,
          wins: 3,
          losses: 2,
          draws: 4,
          winRate: 33,
          avgGameDurationMinutes: 4,
          favoriteGame: 'tic_tac_toe',
          currentWinStreak: 0,
          longestWinStreak: 2,
        },
        byGame: [
          {
            gameType: 'tic_tac_toe',
            gamesPlayed: 9,
            wins: 3,
            losses: 2,
            draws: 4,
            winRate: 33,
            avgScore: 12,
            bestScore: 18,
            lastPlayed: '2026-03-20T12:00:00.000Z',
          },
        ],
        trends: [],
        generatedAt: '2026-03-21T12:00:00.000Z',
      })
    )

    render(<PlayerStatsDashboard userId="user-1" />)

    expect(await screen.findByText('profile.stats.dashboard.gameProfiles.ticTacToe.title')).toBeTruthy()
    expect(screen.getByText('profile.stats.dashboard.gameProfiles.ticTacToe.description')).toBeTruthy()
    expect(screen.getAllByText('profile.stats.dashboard.summary.unbeatenRate')).toHaveLength(2)
    expect(screen.getAllByText('78%')).toHaveLength(2)
    expect(screen.getByText('profile.stats.dashboard.summary.drawRate')).toBeTruthy()
    expect(screen.queryByText('profile.stats.dashboard.sections.byGame.columns.avgScore')).toBeNull()
    expect(screen.queryByText('profile.stats.dashboard.sections.byGame.columns.bestScore')).toBeNull()
  })
})
