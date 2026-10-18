import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GameHistory from '@/components/GameHistory'

const mockTranslate = (key: string, options?: Record<string, unknown>) => {
  if (key === 'profile.gameHistory.showing' && options) {
    return `${key}:${options.start}-${options.end}-${options.total}`
  }
  if (options && typeof options.count === 'number') return `${key}:${options.count}`
  return key
}

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: mockTranslate, i18n: { language: 'en' } }),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
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

const originalFetch = global.fetch
const mockFetch = jest.fn()

function mockJsonResponse(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

const player = (overrides: Record<string, unknown>) => ({
  id: 'p', userId: 'u', isViewer: false, username: 'Someone', isBot: false, score: 0, finalScore: null, placement: null, isWinner: false, ...overrides,
})

const game = (overrides: Record<string, unknown>) => ({
  id: 'game-1',
  lobbyCode: 'ABCD1',
  lobbyName: 'Friday Match',
  gameType: 'connect_four',
  status: 'finished',
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  updatedAt: new Date().toISOString(),
  abandonedAt: null,
  durationMs: 4 * 60_000,
  viewerResult: 'won',
  hasReplay: true,
  players: [
    player({ id: 'p1', userId: 'me', isViewer: true, username: 'Me', isWinner: true }),
    player({ id: 'p2', userId: 'bot', username: 'Robo', isBot: true }),
  ],
  ...overrides,
})

const pagination = (overrides: Record<string, unknown> = {}) => ({ limit: 20, offset: 0, totalCount: 1, hasMore: false, ...overrides })

describe('GameHistory', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as never
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as never
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('draws one row per game: name, the viewer result, the opponents, when and how long, and a replay link', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ games: [game({})], pagination: pagination() }))

    render(<GameHistory />)

    expect(await screen.findByText('games.connect_four.name')).toBeTruthy()
    expect(screen.getByText('profile.gameHistory.result.won')).toBeTruthy()
    expect(screen.getByText('Robo')).toBeTruthy()
    expect(screen.getByText('profile.gameReplay.bot')).toBeTruthy()
    expect(screen.queryByText('Me')).toBeNull()
    expect(screen.getByText(/2 hours ago · 4m/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /profile.gameReplay.watch/ })).toHaveAttribute('href', '/replay/game-1')
    expect(screen.getByText('profile.gameHistory.showing:1-1-1')).toBeTruthy()
  })

  it('opens the details when the row is tapped', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ games: [game({})], pagination: pagination() }))

    render(<GameHistory />)
    fireEvent.click(await screen.findByRole('button', { name: /profile.gameHistory.clickToView/ }))

    await waitFor(() => expect(screen.getByText('results-modal:game-1')).toBeTruthy())
  })

  it('offers no replay link when the API has none, and says Solo game with no opponent', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        games: [game({ hasReplay: false, viewerResult: 'abandoned', status: 'abandoned', players: [player({ isViewer: true })] })],
        pagination: pagination(),
      })
    )

    render(<GameHistory />)

    expect(await screen.findByText('profile.gameHistory.result.abandoned')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /profile.gameReplay.watch/ })).toBeNull()
    expect(screen.getByText('profile.gameHistory.soloGame')).toBeTruthy()
  })

  it('tells a free user how many games Premium would add, with a link to the Premium tab', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ games: [game({})], pagination: pagination({ totalCount: 20, capped: true, hiddenCount: 33 }) }))

    render(<GameHistory />)

    const link = await screen.findByRole('link', { name: 'profile.gameHistory.moreWithPremium:33' })
    expect(link).toHaveAttribute('href', '/profile?tab=premium')
  })

  it('lists every available catalog game in the filter', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ games: [], pagination: pagination({ totalCount: 0 }) }))

    render(<GameHistory />)
    expect((await screen.findAllByText('profile.gameHistory.noGames')).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'profile.gameHistory.gameType' }))
    const options = await screen.findAllByRole('option')
    expect(options.length).toBe(12)
    expect(options.map((o) => o.textContent)).toEqual(expect.arrayContaining(['games.checkers.name', 'games.ludo.name', 'games.liars_party.name']))
  })
})

describe('GameHistory in the Play app (#1465)', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as never
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as never
  })

  afterEach(() => {
    delete document.documentElement.dataset.appShell
  })

  it('does not point a free user at the Premium tab inside the app', async () => {
    document.documentElement.dataset.appShell = 'play'
    mockFetch.mockResolvedValue(mockJsonResponse({ games: [game({})], pagination: pagination({ totalCount: 20, capped: true, hiddenCount: 33 }) }))

    render(<GameHistory />)

    expect(await screen.findByText('games.connect_four.name')).toBeTruthy()
    expect(screen.queryByText('profile.gameHistory.moreWithPremium:33')).toBeNull()
    expect(document.querySelector('a[href="/profile?tab=premium"]')).toBeNull()
  })

  it('marks the Premium row on the web so the app hides it before hydration', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ games: [game({})], pagination: pagination({ totalCount: 20, capped: true, hiddenCount: 33 }) }))

    render(<GameHistory />)

    const link = await screen.findByRole('link', { name: 'profile.gameHistory.moreWithPremium:33' })
    expect(link.closest('li')).toHaveAttribute('data-purchase-ui')
  })
})
