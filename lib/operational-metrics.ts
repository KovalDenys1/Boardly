import { prisma } from '@/lib/db'
import { LOBBY_READY_TARGET_MS, MOVE_APPLY_TARGET_MS } from '@/lib/analytics'

const DEFAULT_GAME_TYPES = ['yahtzee', 'tic_tac_toe', 'rock_paper_scissors', 'guess_the_spy']
const KPI_EVENT_NAMES = [
  'move_submit_applied',
  'lobby_create_ready',
  'socket_reconnect_recovered',
  'socket_reconnect_failed_final',
  'start_alone_auto_bot_result',
] as const

const ALERT_EVENT_NAMES = [
  'rejoin_timeout',
  'auth_refresh_failed',
  'move_apply_timeout',
  'move_submit_applied',
  'socket_reconnect_recovered',
  'socket_reconnect_failed_final',
] as const

export const RECONNECT_SUCCESS_RATIO_TARGET_PCT = 99
export const RECONNECT_RECOVERY_P95_TARGET_MS = 12000
export const START_ALONE_AUTO_BOT_SUCCESS_TARGET_PCT = 99.5
export const AUTH_REFRESH_FAILED_ALERT_THRESHOLD_PCT = 2

type Comparator = 'lte' | 'gte'

interface OperationalEventRow {
  eventName: string
  gameType: string | null
  latencyMs: number | null
  success: boolean | null
  applied: boolean | null
  occurredAt: Date
}

function isMissingOperationalEventsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if (!('code' in error) || (error as { code?: unknown }).code !== 'P2021') return false

  const meta = (error as { meta?: { table?: unknown } }).meta
  return typeof meta?.table === 'string' && meta.table.includes('OperationalEvents')
}

export interface OperationalMetricSnapshot {
  value: number | null
  baseline: number | null
  target: number
  samples: number
  unit: 'ms' | 'percent'
  meetsSlo: boolean | null
}

export interface GameOperationalKpiRow {
  gameType: string
  moveSubmitAppliedP95Ms: OperationalMetricSnapshot
  createLobbyReadyP95Ms: OperationalMetricSnapshot
  startAloneAutoBotSuccessRatioPct: OperationalMetricSnapshot
}

export interface ReconnectOperationalKpi {
  successRatioPct: OperationalMetricSnapshot
  recoveryP95Ms: OperationalMetricSnapshot
  recoveredCount: number
  failedFinalCount: number
}

export interface OperationalKpiDashboard {
  generatedAt: string
  rangeHours: number
  baselineDays: number
  reconnect: ReconnectOperationalKpi
  games: GameOperationalKpiRow[]
  sloTargets: {
    moveSubmitAppliedP95Ms: number
    createLobbyReadyP95Ms: number
    reconnectSuccessRatioPct: number
    reconnectRecoveryP95Ms: number
    startAloneAutoBotSuccessRatioPct: number
  }
}

export interface ReliabilityAlertRuleStatus {
  alertKey: 'rejoin_timeout' | 'auth_refresh_failed' | 'move_apply_timeout'
  breached: boolean
  severity: 'warning' | 'critical'
  currentValue: number | null
  thresholdValue: number
  baselineValue: number | null
  unit: 'count' | 'percent' | 'ms'
  summary: string
  windowMinutes: number
  runbookPath: string
}

export interface ReliabilityAlertEvaluation {
  generatedAt: string
  windowMinutes: number
  baselineDays: number
  rules: ReliabilityAlertRuleStatus[]
}

function clampRangeHours(value: number | undefined): number {
  const fallback = 24
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(168, Math.max(1, Math.floor(value)))
}

function clampBaselineDays(value: number | undefined): number {
  const fallback = 7
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(30, Math.max(3, Math.floor(value)))
}

function clampWindowMinutes(value: number | undefined): number {
  const fallback = 10
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(60, Math.max(5, Math.floor(value)))
}

function toPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Number(((numerator / denominator) * 100).toFixed(2))
}

function toRounded(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Number(value.toFixed(1))
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((left, right) => left - right)
  const index = ((percentileValue / 100) * (sorted.length - 1))
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)

  if (lowerIndex === upperIndex) {
    return toRounded(sorted[lowerIndex])
  }

  const weight = index - lowerIndex
  const interpolated =
    sorted[lowerIndex] * (1 - weight) +
    sorted[upperIndex] * weight

  return toRounded(interpolated)
}

function metricSnapshot(params: {
  value: number | null
  baseline: number | null
  target: number
  samples: number
  unit: 'ms' | 'percent'
  comparator: Comparator
}): OperationalMetricSnapshot {
  const { value, baseline, target, samples, unit, comparator } = params
  const meetsSlo =
    value === null
      ? null
      : comparator === 'lte'
        ? value <= target
        : value >= target

  return {
    value,
    baseline,
    target,
    samples,
    unit,
    meetsSlo,
  }
}

function splitCurrentAndBaseline(
  events: OperationalEventRow[],
  currentStart: Date
): {
  current: OperationalEventRow[]
  baseline: OperationalEventRow[]
} {
  const current: OperationalEventRow[] = []
  const baseline: OperationalEventRow[] = []

  for (const event of events) {
    if (event.occurredAt >= currentStart) {
      current.push(event)
    } else {
      baseline.push(event)
    }
  }

  return { current, baseline }
}

function getLatencyValues(
  events: OperationalEventRow[],
  eventName: string,
  gameType?: string,
  options?: { requireSuccess?: boolean; requireApplied?: boolean }
): number[] {
  return events
    .filter((event) => {
      if (event.eventName !== eventName) return false
      if (typeof gameType === 'string' && event.gameType !== gameType) return false
      if (options?.requireSuccess && event.success !== true) return false
      if (options?.requireApplied && event.applied !== true) return false
      return typeof event.latencyMs === 'number' && Number.isFinite(event.latencyMs)
    })
    .map((event) => event.latencyMs as number)
}

function getFlowRatio(
  events: OperationalEventRow[],
  eventName: string,
  gameType?: string
): {
  ratioPct: number | null
  total: number
} {
  const matching = events.filter((event) => {
    if (event.eventName !== eventName) return false
    if (typeof gameType === 'string' && event.gameType !== gameType) return false
    return true
  })
  const total = matching.length
  const success = matching.filter((event) => event.success === true).length
  return {
    ratioPct: toPercent(success, total),
    total,
  }
}

export async function getOperationalKpiDashboard(
  rawRangeHours?: number,
  rawBaselineDays?: number
): Promise<OperationalKpiDashboard> {
  const rangeHours = clampRangeHours(rawRangeHours)
  const baselineDays = clampBaselineDays(rawBaselineDays)
  const now = new Date()
  const currentStart = new Date(now.getTime() - rangeHours * 60 * 60 * 1000)
  const baselineStart = new Date(
    currentStart.getTime() - baselineDays * 24 * 60 * 60 * 1000
  )

  let events: OperationalEventRow[] = []
  try {
    events = await prisma.operationalEvents.findMany({
      where: {
        eventName: {
          in: [...KPI_EVENT_NAMES],
        },
        occurredAt: {
          gte: baselineStart,
          lte: now,
        },
      },
      select: {
        eventName: true,
        gameType: true,
        latencyMs: true,
        success: true,
        applied: true,
        occurredAt: true,
      },
    })
  } catch (error) {
    if (!isMissingOperationalEventsTableError(error)) {
      throw error
    }
  }

  const { current, baseline } = splitCurrentAndBaseline(events, currentStart)

  const gameTypes = new Set<string>(DEFAULT_GAME_TYPES)
  for (const event of events) {
    if (typeof event.gameType === 'string' && event.gameType.length > 0) {
      gameTypes.add(event.gameType)
    }
  }

  const games = Array.from(gameTypes.values())
    .map((gameType) => {
      const currentMoveLatencies = getLatencyValues(current, 'move_submit_applied', gameType, {
        requireSuccess: true,
        requireApplied: true,
      })
      const baselineMoveLatencies = getLatencyValues(
        baseline,
        'move_submit_applied',
        gameType,
        {
          requireSuccess: true,
          requireApplied: true,
        }
      )

      const currentLobbyReadyLatencies = getLatencyValues(
        current,
        'lobby_create_ready',
        gameType
      )
      const baselineLobbyReadyLatencies = getLatencyValues(
        baseline,
        'lobby_create_ready',
        gameType
      )

      const currentAutoBot = getFlowRatio(current, 'start_alone_auto_bot_result', gameType)
      const baselineAutoBot = getFlowRatio(baseline, 'start_alone_auto_bot_result', gameType)

      return {
        gameType,
        moveSubmitAppliedP95Ms: metricSnapshot({
          value: percentile(currentMoveLatencies, 95),
          baseline: percentile(baselineMoveLatencies, 95),
          target: MOVE_APPLY_TARGET_MS,
          samples: currentMoveLatencies.length,
          unit: 'ms',
          comparator: 'lte',
        }),
        createLobbyReadyP95Ms: metricSnapshot({
          value: percentile(currentLobbyReadyLatencies, 95),
          baseline: percentile(baselineLobbyReadyLatencies, 95),
          target: LOBBY_READY_TARGET_MS,
          samples: currentLobbyReadyLatencies.length,
          unit: 'ms',
          comparator: 'lte',
        }),
        startAloneAutoBotSuccessRatioPct: metricSnapshot({
          value: currentAutoBot.ratioPct,
          baseline: baselineAutoBot.ratioPct,
          target: START_ALONE_AUTO_BOT_SUCCESS_TARGET_PCT,
          samples: currentAutoBot.total,
          unit: 'percent',
          comparator: 'gte',
        }),
      }
    })
    .sort((left, right) => left.gameType.localeCompare(right.gameType))

  const currentRecovered = current.filter(
    (event) => event.eventName === 'socket_reconnect_recovered'
  )
  const currentFailed = current.filter(
    (event) => event.eventName === 'socket_reconnect_failed_final'
  )
  const baselineRecovered = baseline.filter(
    (event) => event.eventName === 'socket_reconnect_recovered'
  )
  const baselineFailed = baseline.filter(
    (event) => event.eventName === 'socket_reconnect_failed_final'
  )

  const currentRecoveryP95 = percentile(
    currentRecovered
      .map((event) => event.latencyMs)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    95
  )
  const baselineRecoveryP95 = percentile(
    baselineRecovered
      .map((event) => event.latencyMs)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    95
  )

  const currentReconnectCycles = currentRecovered.length + currentFailed.length
  const baselineReconnectCycles = baselineRecovered.length + baselineFailed.length

  const reconnect: ReconnectOperationalKpi = {
    successRatioPct: metricSnapshot({
      value: toPercent(currentRecovered.length, currentReconnectCycles),
      baseline: toPercent(baselineRecovered.length, baselineReconnectCycles),
      target: RECONNECT_SUCCESS_RATIO_TARGET_PCT,
      samples: currentReconnectCycles,
      unit: 'percent',
      comparator: 'gte',
    }),
    recoveryP95Ms: metricSnapshot({
      value: currentRecoveryP95,
      baseline: baselineRecoveryP95,
      target: RECONNECT_RECOVERY_P95_TARGET_MS,
      samples: currentRecovered.length,
      unit: 'ms',
      comparator: 'lte',
    }),
    recoveredCount: currentRecovered.length,
    failedFinalCount: currentFailed.length,
  }

  return {
    generatedAt: now.toISOString(),
    rangeHours,
    baselineDays,
    reconnect,
    games,
    sloTargets: {
      moveSubmitAppliedP95Ms: MOVE_APPLY_TARGET_MS,
      createLobbyReadyP95Ms: LOBBY_READY_TARGET_MS,
      reconnectSuccessRatioPct: RECONNECT_SUCCESS_RATIO_TARGET_PCT,
      reconnectRecoveryP95Ms: RECONNECT_RECOVERY_P95_TARGET_MS,
      startAloneAutoBotSuccessRatioPct: START_ALONE_AUTO_BOT_SUCCESS_TARGET_PCT,
    },
  }
}

export async function evaluateReliabilityAlerts(
  rawWindowMinutes?: number,
  rawBaselineDays?: number
): Promise<ReliabilityAlertEvaluation> {
  const windowMinutes = clampWindowMinutes(rawWindowMinutes)
  const baselineDays = clampBaselineDays(rawBaselineDays)
  const now = new Date()
  const currentStart = new Date(now.getTime() - windowMinutes * 60 * 1000)
  const baselineStart = new Date(
    currentStart.getTime() - baselineDays * 24 * 60 * 60 * 1000
  )
  const baselineWindowCount = (baselineDays * 24 * 60) / windowMinutes

  let events: OperationalEventRow[] = []
  try {
    events = await prisma.operationalEvents.findMany({
      where: {
        eventName: {
          in: [...ALERT_EVENT_NAMES],
        },
        occurredAt: {
          gte: baselineStart,
          lte: now,
        },
      },
      select: {
        eventName: true,
        gameType: true,
        latencyMs: true,
        success: true,
        applied: true,
        occurredAt: true,
      },
    })
  } catch (error) {
    if (!isMissingOperationalEventsTableError(error)) {
      throw error
    }
  }

  const { current, baseline } = splitCurrentAndBaseline(events, currentStart)

  const currentRejoinTimeout = current.filter((event) => event.eventName === 'rejoin_timeout').length
  const baselineRejoinTimeout = baseline.filter((event) => event.eventName === 'rejoin_timeout').length
  const baselineRejoinPerWindow =
    baselineWindowCount > 0 ? baselineRejoinTimeout / baselineWindowCount : 0
  const rejoinThreshold = Math.max(2, baselineRejoinPerWindow * 3)
  const rejoinBreached = currentRejoinTimeout >= rejoinThreshold

  const currentAuthRefreshFailed = current.filter(
    (event) => event.eventName === 'auth_refresh_failed'
  ).length
  const baselineAuthRefreshFailed = baseline.filter(
    (event) => event.eventName === 'auth_refresh_failed'
  ).length
  const currentReconnectCycles =
    current.filter((event) => event.eventName === 'socket_reconnect_recovered').length +
    current.filter((event) => event.eventName === 'socket_reconnect_failed_final').length
  const baselineReconnectCycles =
    baseline.filter((event) => event.eventName === 'socket_reconnect_recovered').length +
    baseline.filter((event) => event.eventName === 'socket_reconnect_failed_final').length
  const currentAuthRatio = toPercent(currentAuthRefreshFailed, currentReconnectCycles)
  const baselineAuthRatio = toPercent(baselineAuthRefreshFailed, baselineReconnectCycles)
  const authRatioBreached =
    currentReconnectCycles >= 5 &&
    currentAuthRatio !== null &&
    currentAuthRatio >= AUTH_REFRESH_FAILED_ALERT_THRESHOLD_PCT

  const currentMoveTimeoutCount = current.filter(
    (event) => event.eventName === 'move_apply_timeout'
  ).length
  const baselineMoveTimeoutCount = baseline.filter(
    (event) => event.eventName === 'move_apply_timeout'
  ).length
  const baselineMoveTimeoutPerWindow =
    baselineWindowCount > 0 ? baselineMoveTimeoutCount / baselineWindowCount : 0
  const moveTimeoutCountThreshold = Math.max(3, baselineMoveTimeoutPerWindow * 3)
  const currentMoveAppliedP95 = percentile(
    getLatencyValues(current, 'move_submit_applied', undefined, {
      requireSuccess: true,
      requireApplied: true,
    }),
    95
  )
  const moveTimeoutBreachedByCount = currentMoveTimeoutCount >= moveTimeoutCountThreshold
  const moveTimeoutBreachedByLatency =
    currentMoveAppliedP95 !== null && currentMoveAppliedP95 > MOVE_APPLY_TARGET_MS
  const moveTimeoutBreached = moveTimeoutBreachedByCount || moveTimeoutBreachedByLatency

  return {
    generatedAt: now.toISOString(),
    windowMinutes,
    baselineDays,
    rules: [
      {
        alertKey: 'rejoin_timeout',
        breached: rejoinBreached,
        severity: 'critical',
        currentValue: currentRejoinTimeout,
        thresholdValue: Number(rejoinThreshold.toFixed(2)),
        baselineValue: Number(baselineRejoinPerWindow.toFixed(2)),
        unit: 'count',
        summary: `rejoin_timeout count=${currentRejoinTimeout}, threshold=${rejoinThreshold.toFixed(2)} per ${windowMinutes}m window`,
        windowMinutes,
        runbookPath: 'docs/REALTIME_TELEMETRY.md#runbook-rejoin-timeout',
      },
      {
        alertKey: 'auth_refresh_failed',
        breached: authRatioBreached,
        severity: 'warning',
        currentValue: currentAuthRatio,
        thresholdValue: AUTH_REFRESH_FAILED_ALERT_THRESHOLD_PCT,
        baselineValue: baselineAuthRatio,
        unit: 'percent',
        summary:
          currentReconnectCycles > 0
            ? `auth_refresh_failed ratio=${(currentAuthRatio ?? 0).toFixed(2)}%, cycles=${currentReconnectCycles}`
            : `auth_refresh_failed has no reconnect cycles in the last ${windowMinutes}m`,
        windowMinutes,
        runbookPath: 'docs/REALTIME_TELEMETRY.md#runbook-auth-refresh-failed',
      },
      {
        alertKey: 'move_apply_timeout',
        breached: moveTimeoutBreached,
        severity: moveTimeoutBreachedByLatency ? 'critical' : 'warning',
        currentValue: moveTimeoutBreachedByLatency ? currentMoveAppliedP95 : currentMoveTimeoutCount,
        thresholdValue: moveTimeoutBreachedByLatency
          ? MOVE_APPLY_TARGET_MS
          : Number(moveTimeoutCountThreshold.toFixed(2)),
        baselineValue: moveTimeoutBreachedByLatency
          ? null
          : Number(baselineMoveTimeoutPerWindow.toFixed(2)),
        unit: moveTimeoutBreachedByLatency ? 'ms' : 'count',
        summary: moveTimeoutBreachedByLatency
          ? `move_submit_applied p95=${(currentMoveAppliedP95 ?? 0).toFixed(1)}ms (target ${MOVE_APPLY_TARGET_MS}ms)`
          : `move_apply_timeout count=${currentMoveTimeoutCount}, threshold=${moveTimeoutCountThreshold.toFixed(2)} per ${windowMinutes}m window`,
        windowMinutes,
        runbookPath: 'docs/REALTIME_TELEMETRY.md#runbook-move-apply-timeout',
      },
    ],
  }
}
