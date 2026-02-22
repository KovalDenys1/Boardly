import { buildOperationalEventRecord } from '@/lib/operational-events'

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
})
