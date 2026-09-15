import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import LeaderboardPage from '@/app/leaderboard/page'
import { fetchLeaderboardPage } from '@/lib/server/leaderboard'
import { apiLogger } from '@/lib/logger'
import type { LeaderboardEntry } from '@/lib/leaderboard'

jest.mock('@/lib/server/leaderboard', () => ({
  fetchLeaderboardPage: jest.fn(),
}))

jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), error: jest.fn() }
  return { apiLogger: () => log }
})

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}))

const mockFetchLeaderboardPage = fetchLeaderboardPage as jest.MockedFunction<typeof fetchLeaderboardPage>

const entry = (rank: number, username: string): LeaderboardEntry => ({
  rank,
  userId: `user-${rank}`,
  username,
  publicProfileId: null,
  avatarUrl: null,
  isPremium: false,
  gamesPlayed: 12,
  wins: 8,
  losses: 4,
  winRate: 66.7,
})

async function renderPage(searchParams: Record<string, string> = {}) {
  const ui = await LeaderboardPage({ searchParams: Promise.resolve(searchParams) })
  return render(ui)
}

describe('/leaderboard server render (#922)', () => {
  const fetchSpy = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ entries: [], hasMore: false }) })
    global.fetch = fetchSpy as unknown as typeof fetch
  })

  it('renders the top rows from the server query and the client does not refetch on mount', async () => {
    mockFetchLeaderboardPage.mockResolvedValue({ entries: [entry(1, 'Alice'), entry(2, 'Bob')], hasMore: false })

    await renderPage()

    expect(mockFetchLeaderboardPage).toHaveBeenCalledWith({ gameType: undefined, period: 'all', page: 0 })
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Loading leaderboard…')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled())
  })

  it('queries the filters from the URL so the HTML matches what the client shows', async () => {
    mockFetchLeaderboardPage.mockResolvedValue({ entries: [entry(1, 'Carol')], hasMore: true })

    await renderPage({ period: '30d', gameType: 'yahtzee' })

    expect(mockFetchLeaderboardPage).toHaveBeenCalledWith({ gameType: 'yahtzee', period: '30d', page: 0 })
    expect(screen.getAllByText('Carol').length).toBeGreaterThan(0)
    expect(screen.getByText('Load more')).toBeInTheDocument()
  })

  it('falls back to the client fetch when the server query fails', async () => {
    mockFetchLeaderboardPage.mockRejectedValue(new Error('db down'))
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ entries: [entry(1, 'Dave')], hasMore: false }) })

    await renderPage()

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/leaderboard?period=all&page=0'))
    expect(await screen.findAllByText('Dave')).not.toHaveLength(0)
    // and the failure is not swallowed: the server logs it like the API route does
    expect(apiLogger('/leaderboard').error).toHaveBeenCalledWith('Leaderboard SSR query failed', expect.any(Error))
  })
})
