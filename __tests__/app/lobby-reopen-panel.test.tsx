import React, { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * Opening the link of a table that has closed (#1594). The route state is the lobby read the
 * page routes by; the panel replaces both the redirect and the stale finished board.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }
const mockRefresh = jest.fn()
const mockSetGuestMode = jest.fn(async () => undefined)
const probe = { dedicatedMounted: 0 }

let mockSession: { status: string; data: unknown } = { status: 'unauthenticated', data: null }
let mockGuest = { isGuest: false, guestToken: null as string | null, guestId: null as string | null, guestName: null as string | null }
let mockRouteState: Record<string, unknown>

jest.mock('next/navigation', () => ({
  useParams: () => ({ code: '4821' }),
  useRouter: () => mockRouter,
  usePathname: () => '/lobby/4821',
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('next-auth/react', () => ({ useSession: () => mockSession }))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ ...mockGuest, setGuestMode: mockSetGuestMode }),
}))
jest.mock('@/app/(site)/lobby/[code]/hooks/useLobbyRouteState', () => ({
  useLobbyRouteState: () => mockRouteState,
}))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    i18n: { language: 'en' },
  }),
}))
jest.mock('@/lib/i18n-toast', () => ({
  showToast: { info: jest.fn(), error: jest.fn(), success: jest.fn(), errorFrom: jest.fn() },
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/analytics', () => new Proxy({}, { get: (_t, k) => (k === '__esModule' ? true : jest.fn()) }))
jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }))
jest.mock('@/hooks/useSoundConsumer', () => ({ useSoundConsumer: jest.fn() }))
jest.mock('next/dynamic', () => () => {
  const Stub = () => {
    useEffect(() => {
      probe.dedicatedMounted += 1
    }, [])
    return <div data-testid="dedicated-stub" />
  }
  return Stub
})

const { fetchWithGuest } = require('@/lib/fetch-with-guest') as { fetchWithGuest: jest.Mock }
const { showToast } = require('@/lib/i18n-toast') as { showToast: { info: jest.Mock } }

function closedLobby(overrides: Record<string, unknown> = {}) {
  return {
    code: '4821',
    name: 'Friday table',
    gameType: 'connect_four',
    isActive: false,
    isPrivate: false,
    createdAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    pseudonymisedAt: null,
    ...overrides,
  }
}

const finishedGame = {
  status: 'finished',
  players: [
    { userId: 'a', isWinner: true, user: { username: 'Ada' } },
    { userId: 'b', isWinner: false, user: { username: 'Ben' } },
  ],
}

function routeState(lobby: Record<string, unknown>, lastGame: Record<string, unknown> | null = finishedGame) {
  return {
    gameType: lobby.gameType,
    gameStatus: lastGame?.status ?? null,
    lobby,
    lastGame,
    loading: false,
    handleGameStarted: jest.fn(),
    handleGameReset: jest.fn(),
    refresh: mockRefresh,
  }
}

function respond(status: number, body: Record<string, unknown>) {
  fetchWithGuest.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body } as Response)
}

async function renderLobbyPage() {
  const LobbyPage = require('@/app/(site)/lobby/[code]/LobbyPageClient').default
  await act(async () => {
    render(<LobbyPage />)
  })
}

const reopenButton = () => screen.getByRole('button', { name: /lobby\.reopen\.reopen/ })

beforeEach(() => {
  jest.clearAllMocks()
  probe.dedicatedMounted = 0
  mockSession = { status: 'unauthenticated', data: null }
  mockGuest = { isGuest: false, guestToken: null, guestId: null, guestName: null }
  mockRouteState = routeState(closedLobby())
})

describe('opening the link of a closed table', () => {
  it('shows the reopen panel with the game and the last result instead of the old board', async () => {
    await renderLobbyPage()

    expect(screen.getByRole('heading', { name: 'lobby.reopen.title' })).toBeTruthy()
    expect(screen.getByText(/lobby\.reopen\.lastGameWinner.*Ada/)).toBeTruthy()
    expect(screen.getByText('Ben')).toBeTruthy()
    expect(probe.dedicatedMounted).toBe(0)
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('makes an anonymous visitor a guest by the name they type, then reopens and reads the lobby again', async () => {
    respond(200, { success: true, gameId: 'g-2' })
    await renderLobbyPage()

    expect(reopenButton().hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('guest.namePlaceholder'), { target: { value: 'Ben' } })
    await act(async () => {
      fireEvent.click(reopenButton())
    })

    expect(mockSetGuestMode).toHaveBeenCalledWith('Ben')
    expect(fetchWithGuest).toHaveBeenCalledWith(
      '/api/lobby/4821/reopen',
      expect.objectContaining({ method: 'POST' })
    )
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('sends the password of a private table', async () => {
    mockGuest = { isGuest: true, guestToken: 'tok', guestId: 'b', guestName: 'Ben' }
    mockRouteState = routeState(closedLobby({ isPrivate: true }))
    respond(200, { success: true, gameId: 'g-2' })
    await renderLobbyPage()

    fireEvent.change(screen.getByPlaceholderText('lobby.joinSection.passwordPlaceholder'), { target: { value: 'secret' } })
    await act(async () => {
      fireEvent.click(reopenButton())
    })

    expect(mockSetGuestMode).not.toHaveBeenCalled()
    const [, init] = fetchWithGuest.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ password: 'secret' })
  })

  it('says a wrong password in the join wording', async () => {
    mockGuest = { isGuest: true, guestToken: 'tok', guestId: 'b', guestName: 'Ben' }
    mockRouteState = routeState(closedLobby({ isPrivate: true }))
    respond(403, { code: 'INVALID_PASSWORD' })
    await renderLobbyPage()

    fireEvent.change(screen.getByPlaceholderText('lobby.joinSection.passwordPlaceholder'), { target: { value: 'nope' } })
    await act(async () => {
      fireEvent.click(reopenButton())
    })

    expect(screen.getByText('lobby.joinSection.wrongPassword')).toBeTruthy()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('says the opener is going too fast in the generic words, not lobby creation\'s', async () => {
    mockGuest = { isGuest: true, guestToken: 'tok', guestId: 'b', guestName: 'Ben' }
    respond(429, { error: 'Too many requests. Please slow down.', retryAfter: 120 })
    await renderLobbyPage()

    await act(async () => {
      fireEvent.click(reopenButton())
    })

    expect(screen.getByText('errors.tooManyRequests')).toBeTruthy()
  })

  it('reads the lobby again when someone else reopened it first, so the visitor joins as usual', async () => {
    mockGuest = { isGuest: true, guestToken: 'tok', guestId: 'b', guestName: 'Ben' }
    respond(409, { code: 'LOBBY_NOT_CLOSED' })
    await renderLobbyPage()

    await act(async () => {
      fireEvent.click(reopenButton())
    })

    expect(mockRefresh).toHaveBeenCalled()
  })

  it('sends a table past its 30 days to the game page with a "Start a new table" toast', async () => {
    mockRouteState = routeState(closedLobby({ createdAt: new Date(Date.now() - 31 * DAY).toISOString() }))
    await renderLobbyPage()

    expect(mockRouter.replace).toHaveBeenCalledWith('/games/connect-four')
    expect(showToast.info).toHaveBeenCalledWith('lobby.reopen.tooOld', undefined, undefined, expect.anything())
    expect(screen.queryByRole('heading', { name: 'lobby.reopen.title' })).toBeNull()
    expect(probe.dedicatedMounted).toBe(0)
  })

  it('sends a table whose game is not available any more to the games list with the same toast', async () => {
    mockRouteState = routeState(closedLobby({ gameType: 'telephone_doodle' }))
    await renderLobbyPage()

    expect(mockRouter.replace).toHaveBeenCalledWith('/games')
    expect(showToast.info).toHaveBeenCalledWith('lobby.reopen.tooOld', undefined, undefined, expect.anything())
    expect(screen.queryByRole('heading', { name: 'lobby.reopen.title' })).toBeNull()
  })

  it('leaves for a new table when the server says the game is not available', async () => {
    mockGuest = { isGuest: true, guestToken: 'tok', guestId: 'b', guestName: 'Ben' }
    respond(410, { code: 'GAME_TYPE_UNAVAILABLE' })
    await renderLobbyPage()

    await act(async () => {
      fireEvent.click(reopenButton())
    })

    expect(mockRouter.replace).toHaveBeenCalledWith('/games/connect-four')
    expect(showToast.info).toHaveBeenCalledWith('lobby.reopen.tooOld', undefined, undefined, expect.anything())
  })

  it('routes a lobby whose game is still playing exactly as before', async () => {
    mockRouteState = routeState(closedLobby({ isActive: false }), { status: 'playing', players: [] })
    await renderLobbyPage()

    expect(probe.dedicatedMounted).toBe(1)
    expect(screen.queryByRole('heading', { name: 'lobby.reopen.title' })).toBeNull()
  })
})
