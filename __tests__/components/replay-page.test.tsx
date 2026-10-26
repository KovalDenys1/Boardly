import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReplayPageClient from '@/app/(site)/replay/[gameId]/ReplayPageClient'

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'replays', 'tic_tac_toe.json'), 'utf-8'))

let mockSession: { status: string; data: unknown } = { status: 'authenticated', data: { user: { id: 'player-ada' } } }
const mockPush = jest.fn()

jest.mock('next-auth/react', () => ({ useSession: () => mockSession }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(',')}` : key),
    i18n: { language: 'en' },
  }),
}))
jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() } }))
jest.mock('@/components/replay/registry', () => ({
  loadReplayRenderer: async () => {
    function StubRenderer({ step }: { step: { index: number } }) {
      return <div>board-step:{step.index}</div>
    }
    return StubRenderer
  },
}))
jest.mock('@/components/game-chrome/GamePlayerCard', () => {
  function MockCard({ name, isActive, isWinner }: { name: string; isActive: boolean; isWinner: boolean }) {
    return <div>{`card:${name}:${isActive ? 'active' : 'idle'}:${isWinner ? 'winner' : ''}`}</div>
  }
  return MockCard
})

const originalFetch = global.fetch
const mockFetch = jest.fn()

function payload(isPremium = false) {
  return {
    game: { id: 'game-1', gameType: 'tic_tac_toe', lobbyCode: 'ABCD', lobbyName: 'Lobby', players: fixture.players.map((p: { userId: string; name: string; isBot: boolean; seat: number }) => ({ userId: p.userId, username: p.name, isBot: p.isBot, position: p.seat })) },
    viewer: { isPremium },
    replay: { count: fixture.snapshots.length, snapshots: fixture.snapshots },
  }
}

describe('ReplayPageClient', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as never
  })
  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as never
  })
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession = { status: 'authenticated', data: { user: { id: 'player-ada' } } }
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload() })
  })

  it('opens on the first step with the board, both seats and the caption', async () => {
    render(<ReplayPageClient gameId="game-1" />)

    expect(await screen.findByText('board-step:0')).toBeTruthy()
    expect(screen.getByTestId('replay-caption').textContent).toBe('profile.gameReplay.captions.common.gameStarted')
    expect(screen.getByText(/card:Ada:active/)).toBeTruthy()
    expect(screen.getByText(/card:Robo:idle/)).toBeTruthy()
    expect(mockFetch).toHaveBeenCalledWith('/api/game/game-1/replay', expect.anything())
  })

  it('steps with the keyboard and the transport, and names the winner on the last step', async () => {
    render(<ReplayPageClient gameId="game-1" />)
    await screen.findByText('board-step:0')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(await screen.findByText('board-step:1')).toBeTruthy()
    expect(screen.getByTestId('replay-caption').textContent).toMatch(/captions\.ticTacToe\.mark/)

    fireEvent.keyDown(window, { key: 'End' })
    const last = fixture.snapshots.length - 1
    expect(await screen.findByText(`board-step:${last}`)).toBeTruthy()
    expect(screen.getByText(/card:.*:winner/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'profile.gameReplay.first' }))
    expect(await screen.findByText('board-step:0')).toBeTruthy()

    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } })
    expect(await screen.findByText('board-step:2')).toBeTruthy()
  })

  it('shows the download only to Premium', async () => {
    const { unmount } = render(<ReplayPageClient gameId="game-1" />)
    await screen.findByText('board-step:0')
    expect(screen.queryByRole('link', { name: 'profile.gameReplay.download' })).toBeNull()
    unmount()

    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload(true) })
    render(<ReplayPageClient gameId="game-1" />)
    await screen.findByText('board-step:0')
    expect(screen.getByRole('link', { name: 'profile.gameReplay.download' })).toHaveAttribute('href', '/api/game/game-1/replay?download=1')
  })

  it('sends a signed-out visitor to sign in and shows one card when the API says no', async () => {
    mockSession = { status: 'unauthenticated', data: null }
    const { unmount } = render(<ReplayPageClient gameId="game-1" />)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/login?returnUrl=/replay/game-1'))
    unmount()

    mockSession = { status: 'authenticated', data: { user: { id: 'player-ada' } } }
    mockFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) })
    render(<ReplayPageClient gameId="game-1" />)
    expect(await screen.findByText('profile.gameReplay.noData')).toBeTruthy()
    expect(screen.getByRole('link', { name: /backToHistory/ })).toHaveAttribute('href', '/profile?tab=history')
  })

  describe('as a guest (#1440)', () => {
    beforeEach(() => {
      mockSession = { status: 'unauthenticated', data: null }
      localStorage.setItem('boardly_guest_token', 'guest.token')
      localStorage.setItem('boardly_guest_id', 'player-ada')
      localStorage.setItem('boardly_guest_name', 'Ada')
    })
    afterEach(() => localStorage.clear())

    it('loads the replay with the guest token and leads back to the lobby', async () => {
      render(<ReplayPageClient gameId="game-1" />)

      expect(await screen.findByText('board-step:0')).toBeTruthy()
      const headers = mockFetch.mock.calls[0][1].headers as Headers
      expect(headers.get('X-Guest-Token')).toBe('guest.token')
      expect(screen.getByRole('link', { name: /backToLobby/ })).toHaveAttribute('href', '/lobby/ABCD')
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('sends a guest whose token was refused to sign in', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

      render(<ReplayPageClient gameId="game-1" />)

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/login?returnUrl=/replay/game-1'))
    })
  })
})
