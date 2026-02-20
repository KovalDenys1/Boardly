import {
  MOVE_APPLY_TARGET_MS,
  trackMoveSubmitApplied,
  trackSocketAuthRefreshFailed,
  trackSocketReconnectFailedFinal,
} from '@/lib/analytics'
import { track } from '@vercel/analytics'

jest.mock('@vercel/analytics', () => ({
  track: jest.fn(),
}))

const mockTrack = track as jest.MockedFunction<typeof track>

describe('analytics reliability alerts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('always emits auth_refresh_failed alert signal even when realtime sampling drops event', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(1)

    trackSocketAuthRefreshFailed({
      stage: 'token_fetch',
      status: 500,
      isGuest: false,
    })

    randomSpy.mockRestore()

    expect(mockTrack).toHaveBeenCalledTimes(1)
    expect(mockTrack).toHaveBeenCalledWith('auth_refresh_failed', {
      stage: 'token_fetch',
      status: 500,
      is_guest: false,
    })
  })

  it('emits dedicated rejoin_timeout alert signal for final reconnect failures', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(1)

    trackSocketReconnectFailedFinal({
      attemptsTotal: 4,
      reason: 'rejoin_timeout',
      isGuest: true,
    })

    randomSpy.mockRestore()

    expect(mockTrack).toHaveBeenCalledTimes(1)
    expect(mockTrack).toHaveBeenCalledWith('rejoin_timeout', {
      attempts_total: 4,
      is_guest: true,
    })
  })

  it('emits move_apply_timeout when move apply latency exceeds SLO target', () => {
    trackMoveSubmitApplied({
      gameType: 'tic_tac_toe',
      moveType: 'move',
      durationMs: MOVE_APPLY_TARGET_MS + 250,
      isGuest: false,
      success: true,
      applied: true,
      source: 'tic_tac_toe_page',
    })

    expect(mockTrack).toHaveBeenCalledWith('move_submit_applied', {
      game_type: 'tic_tac_toe',
      move_type: 'move',
      latency_ms: MOVE_APPLY_TARGET_MS + 250,
      is_guest: false,
      success: true,
      applied: true,
      source: 'tic_tac_toe_page',
    })

    expect(mockTrack).toHaveBeenCalledWith('move_apply_timeout', {
      game_type: 'tic_tac_toe',
      move_type: 'move',
      latency_ms: MOVE_APPLY_TARGET_MS + 250,
      target_ms: MOVE_APPLY_TARGET_MS,
      is_guest: false,
      source: 'tic_tac_toe_page',
    })
  })
})
