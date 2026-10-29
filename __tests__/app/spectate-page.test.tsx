// @ts-nocheck
import { act, render, screen, waitFor } from '@testing-library/react'
import SpectatorLobbyPage from '@/app/(site)/lobby/[code]/spectate/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { playCue } from '@/lib/sound-engine'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'

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
jest.mock('@/app/(site)/lobby/[code]/sketch-and-guess-page', () => ({
  __esModule: true,
  default: ({ code, isSpectator }: { code: string; isSpectator?: boolean }) => (
    <div data-testid="sketch-and-guess-dedicated-page">
      dedicated:{code}:{isSpectator ? 'spectator' : 'player'}
    </div>
  ),
}))

jest.mock('@/lib/sound-engine', () => ({
  ...jest.requireActual('@/lib/sound-engine'),
  playCue: jest.fn(() => true),
}))

const lobbyEvents: { current: Record<string, (payload?: unknown) => void> } = { current: {} }
jest.mock('@/lib/lobby-channel-registry', () => ({
  acquireLobbyChannel: jest.fn((_topic: string, options: { events: Record<string, (payload?: unknown) => void> }) => {
    lobbyEvents.current = options.events
    return { release: jest.fn() }
  }),
}))

// The spectate route mounts the real board for Memory; here it only has to say which state it was given.
jest.mock('@/app/(site)/lobby/[code]/components/MemoryGameBoard', () => ({
  __esModule: true,
  default: ({ state, gameId }: { state: { status?: string } | null; gameId: string }) => (
    <div data-testid="memory-board">{gameId || 'no-game'}:{state?.status ?? 'no-state'}</div>
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

describe('a spectator keeps the final board of the game they watched (#1464)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const memoryResponse = (game: { id: string; status: string } | null) => ({
    lobby: { id: 'lobby-1', code: 'ABCD', name: 'Memory', gameType: 'memory', maxPlayers: 4, spectatorCount: 0 },
    activeGame: game ? { ...game, players: [], state: JSON.stringify({ status: game.status, data: {} }) } : null,
    canJoinAsPlayer: false,
    isAdminView: false,
    realtimeTopic: 'lobby:ABCD:secret',
  })
  /** The route as it answers: finished games only when asked for them. */
  const routeWith = (games: Array<{ id: string; status: string }>) => async (url: string) => {
    const includeFinished = url.includes('includeFinished=true')
    const visible = games.filter((game) => game.status !== 'finished' || includeFinished)
    return okResponse(memoryResponse(visible[0] ?? null))
  }
  const requestedUrls = () => mockFetchWithGuest.mock.calls.map(([url]) => String(url))

  beforeEach(() => {
    jest.clearAllMocks()
    lobbyEvents.current = {}
  })

  it('asks for the finished game after a game-update and shows its final state', async () => {
    mockFetchWithGuest.mockImplementation(routeWith([{ id: 'game-1', status: 'playing' }]) as never)
    render(<SpectatorLobbyPage />)
    await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('game-1:playing'))
    expect(requestedUrls()[0]).not.toContain('includeFinished')

    mockFetchWithGuest.mockImplementation(routeWith([{ id: 'game-1', status: 'finished' }]) as never)
    await act(async () => {
      lobbyEvents.current['game-update']?.()
    })

    await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('game-1:finished'))
    expect(requestedUrls().at(-1)).toContain('includeFinished=true')
  })

  it('opens on no game, not on an old finished one, when nothing is running', async () => {
    mockFetchWithGuest.mockImplementation(routeWith([{ id: 'game-0', status: 'finished' }]) as never)
    render(<SpectatorLobbyPage />)

    await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('no-game:no-state'))
    expect(requestedUrls().every((url) => !url.includes('includeFinished'))).toBe(true)
  })

  it('drops a finished game that is not the one being watched', async () => {
    mockFetchWithGuest.mockImplementation(routeWith([{ id: 'game-1', status: 'playing' }]) as never)
    render(<SpectatorLobbyPage />)
    await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('game-1:playing'))

    mockFetchWithGuest.mockImplementation(routeWith([{ id: 'game-0', status: 'finished' }]) as never)
    await act(async () => {
      lobbyEvents.current['game-update']?.()
    })

    await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('no-game:no-state'))
  })

  // #1528: every update is answered with a read, and two of them can land out of order.
  it('keeps the newer board when a read that left earlier lands after it', async () => {
    mockFetchWithGuest.mockImplementation(routeWith([{ id: 'game-1', status: 'playing' }]) as never)
    render(<SpectatorLobbyPage />)
    await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('game-1:playing'))

    const reads: Array<(r: Response) => void> = []
    mockFetchWithGuest.mockImplementation((() => new Promise<Response>((resolve) => { reads.push(resolve) })) as never)
    await act(async () => {
      lobbyEvents.current['game-update']?.()
      lobbyEvents.current['game-update']?.()
    })
    await waitFor(() => expect(reads.length).toBe(2))

    await act(async () => reads[1](okResponse(memoryResponse({ id: 'game-1', status: 'finished' }))))
    await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('game-1:finished'))
    await act(async () => reads[0](okResponse(memoryResponse({ id: 'game-1', status: 'playing' }))))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

    expect(screen.getByTestId('memory-board').textContent).toBe('game-1:finished')
  })
})

describe('a Yahtzee spectator hears the end of the game (#1464)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const resultCues = () => (playCue as jest.Mock).mock.calls.filter(([cue]) => String(cue).startsWith('result.'))
  const yahtzeeResponse = (status: 'playing' | 'finished') => {
    const engine = new YahtzeeGame('game-1')
    engine.addPlayer({ id: 'a', name: 'A' })
    engine.addPlayer({ id: 'b', name: 'B' })
    engine.startGame()
    return {
      lobby: { id: 'lobby-1', code: 'ABCD', name: 'Yahtzee', gameType: 'yahtzee', maxPlayers: 4, spectatorCount: 0 },
      activeGame: { id: 'game-1', status, players: [], state: JSON.stringify({ ...engine.getState(), status }) },
      canJoinAsPlayer: false,
      isAdminView: false,
      realtimeTopic: 'lobby:ABCD:secret',
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    lobbyEvents.current = {}
  })

  it('plays result.over once when the game finishes while they watch, and nothing on a finished load', async () => {
    mockFetchWithGuest.mockResolvedValue(okResponse(yahtzeeResponse('playing')))
    const { unmount } = render(<SpectatorLobbyPage />)
    await waitFor(() => expect(lobbyEvents.current['game-update']).toBeDefined())

    mockFetchWithGuest.mockResolvedValue(okResponse(yahtzeeResponse('finished')))
    await act(async () => {
      lobbyEvents.current['game-update']?.()
    })
    await waitFor(() => expect(resultCues()).toEqual([['result.over', { gameId: 'game-1#end', delayMs: 0 }]]))
    unmount()

    ;(playCue as jest.Mock).mockClear()
    render(<SpectatorLobbyPage />)
    await waitFor(() => expect(lobbyEvents.current['game-update']).toBeDefined())
    expect(resultCues()).toEqual([])
  })
})

// #1528 review 3: the spectate page orders its reads by game-state age first, like the game pages;
// a read sent later but answered before the game finished must not hide the finished board.
describe('a spectator sees the newest board whatever order the reads land in (#1528)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const PLAYING_AT = Date.now() - 20_000
  const memoryResponse = (game: { id: string; status: string; lastMoveAt: number }) => ({
    lobby: { id: 'lobby-1', code: 'ABCD', name: 'Memory', gameType: 'memory', maxPlayers: 4, spectatorCount: 0 },
    activeGame: { id: game.id, status: game.status, players: [], state: JSON.stringify({ status: game.status, data: {}, lastMoveAt: game.lastMoveAt }) },
    canJoinAsPlayer: false,
    isAdminView: false,
    realtimeTopic: 'lobby:ABCD:secret',
  })
  beforeEach(() => {
    jest.clearAllMocks()
    lobbyEvents.current = {}
  })

  for (const order of ['later-sent-first', 'earlier-sent-first'] as const) {
    it(`shows the finished board when the read sent first was answered after the game finished (${order})`, async () => {
      const playing = () => okResponse(memoryResponse({ id: 'game-1', status: 'playing', lastMoveAt: PLAYING_AT }))
      const finished = () => okResponse(memoryResponse({ id: 'game-1', status: 'finished', lastMoveAt: PLAYING_AT + 5_000 }))
      mockFetchWithGuest.mockImplementation((async () => playing()) as never)
      render(<SpectatorLobbyPage />)
      await waitFor(() => expect(screen.getByTestId('memory-board').textContent).toBe('game-1:playing'))
      const reads: Array<(r: Response) => void> = []
      mockFetchWithGuest.mockImplementation((() => new Promise<Response>((resolve) => { reads.push(resolve) })) as never)
      await act(async () => {
        lobbyEvents.current['game-update']?.()
        lobbyEvents.current['game-update']?.()
      })
      await waitFor(() => expect(reads.length).toBe(2))
      if (order === 'later-sent-first') {
        await act(async () => reads[1](playing()))
        await act(async () => reads[0](finished()))
      } else {
        await act(async () => reads[0](finished()))
        await act(async () => reads[1](playing()))
      }
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

      expect(screen.getByTestId('memory-board').textContent).toBe('game-1:finished')
    })
  }
})
