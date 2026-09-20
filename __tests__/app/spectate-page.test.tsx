// @ts-nocheck
import { render, screen, waitFor } from '@testing-library/react'
import SpectatorLobbyPage from '@/app/lobby/[code]/spectate/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

jest.mock('next/navigation', () => ({
  useParams: () => ({ code: 'abcd' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestName: null, guestId: null }),
}))

jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

const mockChannel: any = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn(() => mockChannel),
  track: jest.fn(),
  send: jest.fn(),
  presenceState: jest.fn(() => ({})),
}

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

// #1033: the spectate route's dedicated-game dispatch never listed
// sketch_and_guess, so a Sketch & Guess lobby fell through to the generic
// fallback board instead of mounting the real game page. The dedicated page
// itself is already covered (isSpectator behaviour) by
// __tests__/app/sketch-and-guess-page.test.tsx, so it's stubbed out here —
// this suite is only about which branch the spectate route takes.
jest.mock('@/app/lobby/[code]/sketch-and-guess-page', () => ({
  __esModule: true,
  default: ({ code, isSpectator }: { code: string; isSpectator?: boolean }) => (
    <div data-testid="sketch-and-guess-dedicated-page">
      dedicated:{code}:{isSpectator ? 'spectator' : 'player'}
    </div>
  ),
}))

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

function buildSpectateResponse() {
  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      name: 'Guess My Drawing Lobby',
      gameType: 'sketch_and_guess',
      maxPlayers: 6,
      spectatorCount: 0,
    },
    activeGame: {
      id: 'game-1',
      status: 'playing',
      players: [],
    },
    canJoinAsPlayer: false,
    isAdminView: false,
  }
}

describe('Spectator route dispatch for Sketch & Guess (#1033)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchWithGuest.mockResolvedValue(okResponse(buildSpectateResponse()))
  })

  it('mounts the dedicated Sketch & Guess page for a spectator instead of the no-view fallback', async () => {
    render(<SpectatorLobbyPage />)

    await waitFor(() => {
      expect(screen.getByTestId('sketch-and-guess-dedicated-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('sketch-and-guess-dedicated-page').textContent).toBe('dedicated:ABCD:spectator')

    // Would still be true before the fix: sketch_and_guess fell through to the
    // generic fallback board's "no spectator view for this game" placeholder.
    expect(screen.queryByText('spectate.noViewForGame')).toBeNull()
  })
})
