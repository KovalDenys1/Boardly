import { markPendingLobbyCreateMetric, finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackLobbyCreateReady } from '@/lib/analytics'

jest.mock('@/lib/analytics', () => ({
  trackLobbyCreateReady: jest.fn(),
}))

describe('lobby-create-metrics', () => {
  beforeEach(() => {
    sessionStorage.clear()
    jest.clearAllMocks()
  })

  it('tracks ready metric and clears pending item when lobby codes match', () => {
    markPendingLobbyCreateMetric({
      lobbyCode: 'ABCD',
      gameType: 'tic_tac_toe',
      startedAt: 1000,
      isGuest: false,
    })

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700)
    const result = finalizePendingLobbyCreateMetric({
      lobbyCode: 'ABCD',
      fallbackGameType: 'tic_tac_toe',
    })
    nowSpy.mockRestore()

    expect(result).toBe(true)
    expect(trackLobbyCreateReady).toHaveBeenCalledWith({
      gameType: 'tic_tac_toe',
      durationMs: 700,
      isGuest: false,
    })
  })

  it('does not track metric when pending lobby code does not match', () => {
    markPendingLobbyCreateMetric({
      lobbyCode: 'ABCD',
      gameType: 'yahtzee',
      startedAt: 1000,
      isGuest: true,
    })

    const result = finalizePendingLobbyCreateMetric({
      lobbyCode: 'WXYZ',
      fallbackGameType: 'yahtzee',
    })

    expect(result).toBe(false)
    expect(trackLobbyCreateReady).not.toHaveBeenCalled()
  })

  it('drops stale pending metric without tracking', () => {
    markPendingLobbyCreateMetric({
      lobbyCode: 'ABCD',
      gameType: 'rock_paper_scissors',
      startedAt: 0,
      isGuest: true,
    })

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(11 * 60 * 1000)
    const result = finalizePendingLobbyCreateMetric({
      lobbyCode: 'ABCD',
      fallbackGameType: 'rock_paper_scissors',
    })
    nowSpy.mockRestore()

    expect(result).toBe(false)
    expect(trackLobbyCreateReady).not.toHaveBeenCalled()
  })
})
