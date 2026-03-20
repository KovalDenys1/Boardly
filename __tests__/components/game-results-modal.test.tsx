import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GameResultsModal from '@/components/GameResultsModal'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'profile.gameResults.replayReady' && options) {
        return `${key}:${options.count}`
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

describe('GameResultsModal', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as any
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as any
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders match details and opens replay from the details view', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        id: 'game-1',
        lobbyCode: 'ABCD1',
        lobbyName: 'Friday Match',
        gameType: 'chess',
        status: 'finished',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:30:00.000Z',
        finishedAt: null,
        abandonedAt: null,
        hasReplay: true,
        replayStepCount: 18,
        state: {},
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
      })
    )

    const handleWatchReplay = jest.fn()

    render(
      <GameResultsModal
        gameId="game-1"
        onClose={jest.fn()}
        onWatchReplay={handleWatchReplay}
      />
    )

    expect((await screen.findAllByText('Friday Match')).length).toBeGreaterThan(0)
    expect(screen.getByText('profile.gameResults.quickFacts')).toBeTruthy()
    expect(screen.getByText('profile.gameResults.replayReady:18')).toBeTruthy()
    expect(screen.getAllByText('ABCD1').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'profile.gameReplay.watch' }))

    expect(handleWatchReplay).toHaveBeenCalledWith('game-1')
  })

  it('shows replay as unavailable when no snapshots exist', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        id: 'game-2',
        lobbyCode: 'EFGH2',
        lobbyName: 'No Replay Match',
        gameType: 'memory',
        status: 'finished',
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:15:00.000Z',
        finishedAt: null,
        abandonedAt: null,
        hasReplay: false,
        replayStepCount: 0,
        state: {},
        players: [
          {
            id: 'player-1',
            username: 'Player One',
            avatar: null,
            isBot: false,
            score: 25,
            finalScore: 25,
            placement: 1,
            isWinner: true,
          },
        ],
      })
    )

    render(<GameResultsModal gameId="game-2" onClose={jest.fn()} />)

    const replayButton = await screen.findByRole('button', {
      name: 'profile.gameReplay.unavailable',
    })

    await waitFor(() => {
      expect((replayButton as HTMLButtonElement).disabled).toBe(true)
    })
  })
})
