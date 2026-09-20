import {
  MOVE_APPLY_TARGET_MS,
  toAnalyticsGameType,
  trackDiscordCta,
  trackInviteCopied,
  trackInviteOpened,
  trackLobbyLeaveRedirect,
  trackMoveSubmitApplied,
  trackStartAloneAutoBotResult,
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

  it('tracks start alone auto bot flow result', () => {
    trackStartAloneAutoBotResult({
      gameType: 'yahtzee',
      success: true,
      reason: 'started',
      isGuest: true,
    })

    expect(mockTrack).toHaveBeenCalledWith('start_alone_auto_bot_result', {
      game_type: 'yahtzee',
      success: true,
      reason: 'started',
      is_guest: true,
    })
  })

  it('tracks leave-to-redirect telemetry with navigation and API outcome metadata', () => {
    trackLobbyLeaveRedirect({
      durationMs: 188.2,
      isGuest: false,
      source: 'lobby_page',
      navigation: 'window_assign_fallback',
      apiOutcome: 'timeout',
      statusCode: 504,
      gameType: 'yahtzee',
    })

    expect(mockTrack).toHaveBeenCalledWith('lobby_leave_redirect', {
      latency_ms: 188,
      is_guest: false,
      source: 'lobby_page',
      navigation: 'window_assign_fallback',
      api_outcome: 'timeout',
      status_code: 504,
      game_type: 'yahtzee',
    })
  })
})

describe('invite loop events (#920)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('names the surface, the method and the lobby code', () => {
    trackInviteCopied('lobby_code_chip', 'AB12', 'clipboard')
    trackInviteCopied('result_overlay', 'AB12', 'web_share')

    expect(mockTrack).toHaveBeenNthCalledWith(1, 'invite_copied', {
      source: 'lobby_code_chip',
      lobby_code: 'AB12',
      method: 'clipboard',
    })
    expect(mockTrack).toHaveBeenNthCalledWith(2, 'invite_copied', {
      source: 'result_overlay',
      lobby_code: 'AB12',
      method: 'web_share',
    })
  })

  it('records the attribution an invite was opened with', () => {
    trackInviteOpened({ via: 'share_link' }, 'AB12')
    trackInviteOpened({ via: 'external_referrer', referrerHost: 'discord.com' }, 'AB12')

    expect(mockTrack).toHaveBeenNthCalledWith(1, 'invite_opened', {
      source: 'share_link',
      lobby_code: 'AB12',
    })
    expect(mockTrack).toHaveBeenNthCalledWith(2, 'invite_opened', {
      source: 'external_referrer',
      lobby_code: 'AB12',
      referrer_host: 'discord.com',
    })
  })
})

describe('Discord CTA (#982)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('names the surface and the game it was offered on', () => {
    trackDiscordCta('after_game', 'yahtzee')
    trackDiscordCta('waiting_room', 'guess_the_spy')

    expect(mockTrack).toHaveBeenNthCalledWith(1, 'feature_used', {
      feature: 'discord_cta',
      source: 'after_game',
      game_type: 'yahtzee',
    })
    expect(mockTrack).toHaveBeenNthCalledWith(2, 'feature_used', {
      feature: 'discord_cta',
      source: 'waiting_room',
      game_type: 'guess_the_spy',
    })
  })

  it('omits game_type rather than sending an empty one', () => {
    trackDiscordCta('waiting_room')

    expect(mockTrack).toHaveBeenCalledWith('feature_used', {
      feature: 'discord_cta',
      source: 'waiting_room',
    })
  })

  it('narrows a loose lobby.gameType and drops anything analytics does not know', () => {
    expect(toAnalyticsGameType('connect_four')).toBe('connect_four')
    expect(toAnalyticsGameType('sketch_and_guess')).toBe('sketch_and_guess')
    expect(toAnalyticsGameType('chess')).toBeUndefined()
    expect(toAnalyticsGameType(undefined)).toBeUndefined()
    expect(toAnalyticsGameType(7)).toBeUndefined()
  })
})
