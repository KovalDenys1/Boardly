export type OperationalPayloadValue = string | number | boolean | null

export const OPERATIONAL_EVENT_NAMES = [
  'rejoin_timeout',
  'auth_refresh_failed',
  'move_apply_timeout',
  'move_submit_applied',
  'lobby_create_ready',
  'socket_reconnect_recovered',
  'socket_reconnect_failed_final',
  'start_alone_auto_bot_result',
  // The funnel the Revenue Plan defines. These were Vercel Analytics custom events, and the
  // Hobby plan drops every one, so not a single row of the funnel had ever been stored.
  // OperationalEvents already takes unsampled client beacons, so the funnel can exist here
  // without waiting for Pro.
  'signup_prompt_shown',
  'signup_prompt_clicked',
  'signup_prompt_dismissed',
  'premium_cta_clicked',
  'checkout_started',
  // The invite loop (#920). Both carry `lobby_code` in the payload so they join
  // `second_human_joined` and LobbyParticipations; `source` names the button or the
  // attribution that fired them.
  'invite_copied',
  'invite_opened',
] as const

/**
 * Names only the server may write.
 *
 * Deliberately NOT in OPERATIONAL_EVENT_NAMES: that array is the zod enum on the public
 * `/api/ops/events` beacon, so anything listed there can be posted by anyone. A cron
 * heartbeat that a client can forge is worse than no heartbeat, because it would read as
 * proof that a job ran.
 */
export const SERVER_OPERATIONAL_EVENT_NAMES = [
  'cron_run',
  // Written by lib/lobby-participation.ts when a lobby reaches its second non-bot
  // participant. A rate anyone could post with any lobby code is worse than none.
  'second_human_joined',
] as const

export type ServerOperationalEventName = (typeof SERVER_OPERATIONAL_EVENT_NAMES)[number]

export type OperationalEventName = (typeof OPERATIONAL_EVENT_NAMES)[number]

export type OperationalMetricType = 'alert_signal' | 'latency' | 'reliability' | 'flow'

export interface OperationalEventPayload {
  [key: string]: OperationalPayloadValue
}

export interface OperationalEventRecord {
  eventName: OperationalEventName
  metricType: OperationalMetricType
  gameType?: string
  isGuest?: boolean
  success?: boolean
  applied?: boolean
  latencyMs?: number
  targetMs?: number
  attemptsTotal?: number
  reason?: string
  stage?: string
  statusCode?: number
  source?: string
  payload: OperationalEventPayload
}

function readString(payload: OperationalEventPayload, key: string): string | undefined {
  const value = payload[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBoolean(payload: OperationalEventPayload, key: string): boolean | undefined {
  const value = payload[key]
  return typeof value === 'boolean' ? value : undefined
}

function readInt(payload: OperationalEventPayload, key: string): number | undefined {
  const value = payload[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(value)
}

function readNonNegativeInt(payload: OperationalEventPayload, key: string): number | undefined {
  const value = readInt(payload, key)
  if (typeof value !== 'number') return undefined
  return value < 0 ? 0 : value
}

export function buildOperationalEventRecord(input: {
  eventName: OperationalEventName
  payload: OperationalEventPayload
}): OperationalEventRecord {
  const { eventName, payload } = input

  switch (eventName) {
    case 'rejoin_timeout':
      return {
        eventName,
        metricType: 'alert_signal',
        isGuest: readBoolean(payload, 'is_guest'),
        attemptsTotal: readNonNegativeInt(payload, 'attempts_total'),
        payload,
      }

    case 'auth_refresh_failed':
      return {
        eventName,
        metricType: 'alert_signal',
        isGuest: readBoolean(payload, 'is_guest'),
        stage: readString(payload, 'stage'),
        statusCode: readInt(payload, 'status'),
        payload,
      }

    case 'move_apply_timeout':
      return {
        eventName,
        metricType: 'alert_signal',
        gameType: readString(payload, 'game_type'),
        isGuest: readBoolean(payload, 'is_guest'),
        latencyMs: readNonNegativeInt(payload, 'latency_ms'),
        targetMs: readNonNegativeInt(payload, 'target_ms'),
        source: readString(payload, 'source'),
        payload,
      }

    case 'move_submit_applied':
      return {
        eventName,
        metricType: 'latency',
        gameType: readString(payload, 'game_type'),
        isGuest: readBoolean(payload, 'is_guest'),
        success: readBoolean(payload, 'success'),
        applied: readBoolean(payload, 'applied'),
        latencyMs: readNonNegativeInt(payload, 'latency_ms'),
        statusCode: readInt(payload, 'status_code'),
        source: readString(payload, 'source'),
        payload,
      }

    case 'lobby_create_ready':
      return {
        eventName,
        metricType: 'latency',
        gameType: readString(payload, 'game_type'),
        isGuest: readBoolean(payload, 'is_guest'),
        latencyMs: readNonNegativeInt(payload, 'latency_ms'),
        targetMs: readNonNegativeInt(payload, 'target_ms'),
        payload,
      }

    case 'socket_reconnect_recovered':
      return {
        eventName,
        metricType: 'reliability',
        isGuest: readBoolean(payload, 'is_guest'),
        latencyMs: readNonNegativeInt(payload, 'time_to_recover_ms'),
        attemptsTotal: readNonNegativeInt(payload, 'attempts_total'),
        payload,
      }

    case 'socket_reconnect_failed_final':
      return {
        eventName,
        metricType: 'reliability',
        isGuest: readBoolean(payload, 'is_guest'),
        attemptsTotal: readNonNegativeInt(payload, 'attempts_total'),
        reason: readString(payload, 'reason'),
        payload,
      }

    case 'signup_prompt_shown':
    case 'signup_prompt_clicked':
    case 'signup_prompt_dismissed':
    case 'premium_cta_clicked':
    case 'checkout_started':
    case 'invite_copied':
    case 'invite_opened':
      // `source` carries the button or surface; the lobby code stays in the payload.
      return {
        eventName,
        metricType: 'flow',
        gameType: readString(payload, 'game_type'),
        isGuest: readBoolean(payload, 'is_guest'),
        source: readString(payload, 'source'),
        reason: readString(payload, 'reason'),
        payload,
      }

    case 'start_alone_auto_bot_result':
      return {
        eventName,
        metricType: 'flow',
        gameType: readString(payload, 'game_type'),
        isGuest: readBoolean(payload, 'is_guest'),
        success: readBoolean(payload, 'success'),
        reason: readString(payload, 'reason'),
        payload,
      }
  }
}
