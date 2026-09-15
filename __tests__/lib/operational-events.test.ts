import {
  buildOperationalEventRecord,
  OPERATIONAL_EVENT_NAMES,
  SERVER_OPERATIONAL_EVENT_NAMES,
} from '@/lib/operational-events'

describe('buildOperationalEventRecord', () => {
  it('normalizes move_submit_applied payload', () => {
    const event = buildOperationalEventRecord({
      eventName: 'move_submit_applied',
      payload: {
        game_type: 'tic_tac_toe',
        is_guest: false,
        success: true,
        applied: true,
        latency_ms: 123.7,
        status_code: 200,
      },
    })

    expect(event).toMatchObject({
      eventName: 'move_submit_applied',
      metricType: 'latency',
      gameType: 'tic_tac_toe',
      isGuest: false,
      success: true,
      applied: true,
      latencyMs: 124,
      statusCode: 200,
    })
  })

  it('normalizes auth_refresh_failed payload', () => {
    const event = buildOperationalEventRecord({
      eventName: 'auth_refresh_failed',
      payload: {
        stage: 'token_fetch',
        status: 503,
        is_guest: true,
      },
    })

    expect(event).toMatchObject({
      eventName: 'auth_refresh_failed',
      metricType: 'alert_signal',
      stage: 'token_fetch',
      statusCode: 503,
      isGuest: true,
    })
  })

  it('normalizes start_alone_auto_bot_result payload', () => {
    const event = buildOperationalEventRecord({
      eventName: 'start_alone_auto_bot_result',
      payload: {
        game_type: 'yahtzee',
        success: false,
        reason: 'bot_add_failed',
        is_guest: false,
      },
    })

    expect(event).toMatchObject({
      eventName: 'start_alone_auto_bot_result',
      metricType: 'flow',
      gameType: 'yahtzee',
      success: false,
      reason: 'bot_add_failed',
      isGuest: false,
    })
  })

  it('normalizes the invite events as flow events with the surface in source and the lobby code in the payload (#920)', () => {
    const copied = buildOperationalEventRecord({
      eventName: 'invite_copied',
      payload: { source: 'lobby_code_chip', lobby_code: 'AB12' },
    })
    expect(copied).toMatchObject({
      eventName: 'invite_copied',
      metricType: 'flow',
      source: 'lobby_code_chip',
      payload: { source: 'lobby_code_chip', lobby_code: 'AB12' },
    })

    const opened = buildOperationalEventRecord({
      eventName: 'invite_opened',
      payload: { source: 'share_link', lobby_code: 'AB12' },
    })
    expect(opened).toMatchObject({
      eventName: 'invite_opened',
      metricType: 'flow',
      source: 'share_link',
      payload: { lobby_code: 'AB12' },
    })
  })

  it('keeps second_human_joined off the public beacon enum (#920)', () => {
    expect(SERVER_OPERATIONAL_EVENT_NAMES).toContain('second_human_joined')
    expect(OPERATIONAL_EVENT_NAMES as readonly string[]).not.toContain('second_human_joined')
    expect(OPERATIONAL_EVENT_NAMES).toEqual(expect.arrayContaining(['invite_copied', 'invite_opened']))
  })
})
