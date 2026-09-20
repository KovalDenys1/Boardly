import {
  MOVE_APPLY_TARGET_MS,
  toAnalyticsGameType,
  trackDiscordCta,
  trackInviteCopied,
  trackInviteOpened,
  trackLobbyLeaveRedirect,
  trackMoveSubmitApplied,
  trackPushPrompt,
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

describe('push opt-in prompt (#984)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('carries the action, the surface and the game', () => {
    trackPushPrompt('shown', 'after_game', 'yahtzee')
    trackPushPrompt('accepted', 'after_game', 'yahtzee')

    expect(mockTrack).toHaveBeenNthCalledWith(1, 'push_prompt', {
      action: 'shown',
      source: 'after_game',
      game_type: 'yahtzee',
    })
    expect(mockTrack).toHaveBeenNthCalledWith(2, 'push_prompt', {
      action: 'accepted',
      source: 'after_game',
      game_type: 'yahtzee',
    })
  })

  it('keeps a browser-level denial distinct from a dismissal - only one of them may be re-asked', () => {
    trackPushPrompt('denied', 'profile')
    trackPushPrompt('dismissed', 'profile')

    expect(mockTrack).toHaveBeenNthCalledWith(1, 'push_prompt', { action: 'denied', source: 'profile' })
    expect(mockTrack).toHaveBeenNthCalledWith(2, 'push_prompt', { action: 'dismissed', source: 'profile' })
  })

  it('separates an accept whose preference write failed from one that landed', () => {
    trackPushPrompt('failed', 'after_game', 'memory')

    expect(mockTrack).toHaveBeenCalledWith('push_prompt', {
      action: 'failed',
      source: 'after_game',
      game_type: 'memory',
    })
  })

  /**
   * The Vercel `track` call and the operational beacon are two different wires, and only the
   * first one was covered: `emitOperationalEvent` returns early on NODE_ENV === 'test', so
   * deleting the call from trackPushPrompt left all 19 analytics and operational tests green
   * while no push_prompt row would ever reach the Control Panel. The stored `shown` count is
   * the denominator the whole design rests on, so the wire itself has to be asserted - which
   * means running this one case with NODE_ENV out of the way.
   */
  it('posts every push_prompt action to the operational beacon, not only to Vercel', () => {
    const posted: { url: string; eventName: string; payload: unknown }[] = []
    const originalSendBeacon = (navigator as { sendBeacon?: unknown }).sendBeacon
    const originalFetch = global.fetch
    const originalNodeEnv = process.env.NODE_ENV

    // Returning false makes emitOperationalEvent fall through to its fetch path, where the
    // body is a plain string this test can read - a jsdom Blob has no synchronous reader.
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => false })
    global.fetch = jest.fn((url: string, init: { body: string }) => {
      const parsed = JSON.parse(init.body)
      posted.push({ url, eventName: parsed.eventName, payload: parsed.payload })
      return Promise.resolve({ ok: true })
    }) as unknown as typeof fetch
    Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: 'production' })

    try {
      trackPushPrompt('shown', 'after_game', 'memory')
      trackPushPrompt('failed', 'after_game', 'memory')
      trackPushPrompt('dismissed', 'profile')
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: originalNodeEnv })
      Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: originalSendBeacon })
      global.fetch = originalFetch
    }

    expect(posted).toEqual([
      {
        url: '/api/ops/events',
        eventName: 'push_prompt_shown',
        payload: { source: 'after_game', game_type: 'memory' },
      },
      {
        url: '/api/ops/events',
        eventName: 'push_prompt_failed',
        payload: { source: 'after_game', game_type: 'memory' },
      },
      { url: '/api/ops/events', eventName: 'push_prompt_dismissed', payload: { source: 'profile' } },
    ])
  })
})
