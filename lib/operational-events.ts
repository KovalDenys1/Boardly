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
] as const

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
