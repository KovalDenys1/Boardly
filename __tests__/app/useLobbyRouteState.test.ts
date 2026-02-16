import { act, renderHook, waitFor } from '@testing-library/react'
import { useLobbyRouteState } from '@/app/lobby/[code]/hooks/useLobbyRouteState'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { DEFAULT_GAME_TYPE } from '@/lib/game-registry'

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/lobby-snapshot', () => ({
  normalizeLobbySnapshotResponse: jest.fn(),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
  },
}))

const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
const mockNormalizeLobbySnapshotResponse = normalizeLobbySnapshotResponse as jest.MockedFunction<typeof normalizeLobbySnapshotResponse>

describe('useLobbyRouteState', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not fetch while session status is loading', () => {
    const { result } = renderHook(() =>
      useLobbyRouteState({
        code: 'ABCD',
        status: 'loading',
        isGuest: false,
        guestToken: null,
      })
    )

    expect(mockFetchWithGuest).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(true)
  })

  it('loads game type and status from normalized snapshot', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => ({ payload: true }),
    } as Response)
    mockNormalizeLobbySnapshotResponse.mockReturnValue({
      lobby: { gameType: 'rock_paper_scissors' },
      activeGame: { status: 'finished' },
    } as ReturnType<typeof normalizeLobbySnapshotResponse>)

    const { result } = renderHook(() =>
      useLobbyRouteState({
        code: 'ABCD',
        status: 'authenticated',
        isGuest: false,
        guestToken: null,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockFetchWithGuest).toHaveBeenCalledWith('/api/lobby/ABCD?includeFinished=true', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(result.current.gameType).toBe('rock_paper_scissors')
    expect(result.current.gameStatus).toBe('finished')
  })

  it('falls back to default game type when request is not ok', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Nope' }),
    } as Response)

    const { result } = renderHook(() =>
      useLobbyRouteState({
        code: 'ABCD',
        status: 'authenticated',
        isGuest: false,
        guestToken: null,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.gameType).toBe(DEFAULT_GAME_TYPE)
    expect(result.current.gameStatus).toBeNull()
  })

  it('falls back to default game type when request throws', async () => {
    mockFetchWithGuest.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() =>
      useLobbyRouteState({
        code: 'ABCD',
        status: 'authenticated',
        isGuest: false,
        guestToken: null,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.gameType).toBe(DEFAULT_GAME_TYPE)
    expect(result.current.gameStatus).toBeNull()
  })

  it('marks route as playing when dedicated game starts', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)

    const { result } = renderHook(() =>
      useLobbyRouteState({
        code: 'ABCD',
        status: 'authenticated',
        isGuest: false,
        guestToken: null,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.handleGameStarted('tic_tac_toe')
    })

    expect(result.current.gameType).toBe('tic_tac_toe')
    expect(result.current.gameStatus).toBe('playing')
  })
})
