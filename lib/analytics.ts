import { track } from '@vercel/analytics'
import { clientLogger } from './client-logger'
import type { OperationalEventName } from './operational-events'
import type { InviteAttribution } from './invite-attribution'
import type { InviteShareMethod } from './invite-share'
import type { PremiumPlan } from './premium-plans'
import type { AnalyticsGameType } from './analytics-game-types'

/**
 * Analytics wrapper for tracking game events
 * Uses Vercel Analytics for production, logs to console in development
 */

type AnalyticsPropertyValue = string | number | boolean | null

// The union, the list behind it and the narrowing live in their own module so that
// mocking this one does not take the narrowing with it (#1044). Re-exported so every
// existing `from '@/lib/analytics'` import keeps working.
export { ANALYTICS_GAME_TYPES, toAnalyticsGameType, type AnalyticsGameType } from './analytics-game-types'
type GameType = AnalyticsGameType

type ReconnectFailureReason = 'reconnect_failed' | 'authentication_failed' | 'rejoin_timeout'
type ReliabilityAlertEvent = 'rejoin_timeout' | 'auth_refresh_failed' | 'move_apply_timeout'

const REALTIME_TELEMETRY_SAMPLE_RATE = 0.25
export const MOVE_APPLY_TARGET_MS = 800
export const LOBBY_READY_TARGET_MS = 2500
const OPERATIONAL_EVENT_ENDPOINT = '/api/ops/events'

interface LobbyEvent {
  lobbyCode: string
  gameType: GameType
  isPrivate: boolean
  maxPlayers: number
}

interface GameStartEvent extends LobbyEvent {
  playerCount: number
  hasBot: boolean
  botCount: number
}

interface GameEndEvent {
  gameType: GameType
  duration: number // minutes
  playerCount: number
  winner: string
  wasBot: boolean
  finalScores: Array<{ playerName: string; score: number }>
}

interface PlayerActionEvent {
  actionType: string
  gameType: GameType
  playerCount: number
  isBot: boolean  // Keep for backwards compatibility with analytics
  metadata?: Record<string, unknown>
}

interface AuthEvent {
  event: 'login' | 'register' | 'logout'
  method: 'email' | 'google' | 'guest'
  success: boolean
  userId?: string
}

interface ErrorEvent {
  errorType: string
  errorMessage: string
  component: string
  severity?: 'low' | 'medium' | 'high'
  context?: Record<string, unknown>
}

interface MoveSubmitAppliedEvent {
  gameType: GameType
  moveType: string
  durationMs: number
  isGuest: boolean
  success: boolean
  applied: boolean
  statusCode?: number
  isAutoAction?: boolean
  source?: 'yahtzee_hook' | 'tic_tac_toe_page' | 'rock_paper_scissors_page' | 'memory_board' | 'alias_page' | 'liars_party_page' | 'connect_four_page' | 'sketch_and_guess_page'
}

interface LobbyCreateLatencyEvent {
  gameType: GameType
  durationMs: number
  isGuest: boolean
  success: boolean
  statusCode?: number
}

interface LobbyCreateReadyEvent {
  gameType: GameType
  durationMs: number
  isGuest: boolean
}

interface StartAloneAutoBotResultEvent {
  gameType: GameType
  success: boolean
  reason: 'started' | 'bot_add_failed' | 'insufficient_players' | 'start_failed'
  isGuest: boolean
}

interface LobbyLeaveRedirectEvent {
  durationMs: number
  isGuest: boolean
  source: 'lobby_page' | 'tic_tac_toe_page' | 'rock_paper_scissors_page' | 'connect_four_page' | 'sketch_and_guess_page'
  navigation: 'router_replace' | 'window_assign_fallback'
  apiOutcome: 'pending' | 'ok' | 'non_ok' | 'timeout' | 'error'
  statusCode?: number
  gameType?: string
}

function normalizeDurationMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

function emitOperationalEvent(
  eventName: OperationalEventName,
  payload: Record<string, AnalyticsPropertyValue>
): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
    return
  }

  const body = JSON.stringify({
    eventName,
    payload,
    eventAt: Date.now(),
  })

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      const sent = navigator.sendBeacon(OPERATIONAL_EVENT_ENDPOINT, blob)
      if (sent) {
        return
      }
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch(OPERATIONAL_EVENT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch(() => undefined)
}

function trackRealtimeTelemetry(
  eventName: string,
  payload: Record<string, AnalyticsPropertyValue>
): void {
  if (Math.random() > REALTIME_TELEMETRY_SAMPLE_RATE) {
    return
  }

  track(eventName, payload)
  clientLogger.log('[analytics] Realtime telemetry', {
    eventName,
    ...payload,
    sampleRate: REALTIME_TELEMETRY_SAMPLE_RATE,
  })
}

function trackReliabilityAlert(
  eventName: ReliabilityAlertEvent,
  payload: Record<string, AnalyticsPropertyValue>
): void {
  track(eventName, payload)
  emitOperationalEvent(eventName, payload)
  clientLogger.warn('[analytics] Reliability alert signal emitted', {
    eventName,
    ...payload,
  })
}
/**
 * Track lobby creation
 */
export function trackLobbyCreated(event: LobbyEvent): void {
  track('lobby_created', {
    game_type: event.gameType,
    is_private: event.isPrivate,
    max_players: event.maxPlayers,
  })
  
  clientLogger.log('[analytics] Lobby created', event)
}

/**
 * Track lobby joined
 */
export function trackLobbyJoined(event: Omit<LobbyEvent, 'maxPlayers'>): void {
  track('lobby_joined', {
    lobby_code: event.lobbyCode,
    game_type: event.gameType,
    is_private: event.isPrivate,
  })
  
  clientLogger.log('[analytics] Lobby joined', event)
}

/**
 * Track game start
 */
export function trackGameStarted(event: GameStartEvent): void {
  track('game_started', {
    game_type: event.gameType,
    player_count: event.playerCount,
    has_bot: event.hasBot,
    bot_count: event.botCount,
    is_private: event.isPrivate,
  })
  
  clientLogger.log('[analytics] Game started', event)
}

/**
 * Track game completion
 */
export function trackGameCompleted(event: GameEndEvent): void {
  track('game_completed', {
    game_type: event.gameType,
    duration_minutes: event.duration,
    player_count: event.playerCount,
    winner: event.winner,
    winner_was_bot: event.wasBot,
    final_scores: JSON.stringify(event.finalScores),
  })
  
  clientLogger.log('[analytics] Game completed', event)
}

/**
 * Track player actions (roll, hold, score)
 */
export function trackPlayerAction(event: PlayerActionEvent): void {
  // Only track significant actions to avoid noise
  const significantActions = ['roll', 'score', 'hold']
  
  if (significantActions.includes(event.actionType)) {
    track('player_action', {
      game_type: event.gameType,
      action: event.actionType,
      is_bot: event.isBot,
      player_count: event.playerCount,
      ...(event.metadata && { metadata: JSON.stringify(event.metadata) }),
    })
  }
}

/**
 * Track authentication events
 */
export function trackAuth(event: AuthEvent): void {
  track('auth', {
    method: event.method,
    success: event.success,
  })
  
  clientLogger.log('[analytics] Auth event', event)
}

/**
 * Track errors
 */
export function trackError(event: ErrorEvent): void {
  track('error', {
    error_type: event.errorType,
    error_message: event.errorMessage,
    component: event.component,
    severity: event.severity || 'medium',
    ...(event.context && { context: JSON.stringify(event.context) }),
  })
  
  clientLogger.error('[analytics] Error tracked', event)
}

/**
 * Track page views (automatically handled by Vercel Analytics)
 * This is just for custom page view events if needed
 */
export function trackPageView(page: string): void {
  track('page_view', {
    page,
  })
}

/**
 * Track bot performance (for analyzing bot behavior)
 */
export function trackBotPerformance(data: {
  gameType: GameType
  difficulty: 'easy' | 'medium' | 'hard'
  finalScore: number
  playerRank: number
  totalPlayers: number
}): void {
  track('bot_performance', {
    game_type: data.gameType,
    difficulty: data.difficulty,
    final_score: data.finalScore,
    rank: data.playerRank,
    total_players: data.totalPlayers,
  })
  
  clientLogger.log('[analytics] Bot performance', data)
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(feature: string, metadata?: Record<string, unknown>): void {
  track('feature_used', {
    feature,
    ...(metadata && metadata),
  })
  
  clientLogger.log('[analytics] Feature used', { feature, metadata })
}

/**
 * Track move latency from submit to UI authoritative apply.
 */
export function trackMoveSubmitApplied(event: MoveSubmitAppliedEvent): void {
  const durationMs = normalizeDurationMs(event.durationMs)

  const payload = {
    game_type: event.gameType,
    move_type: event.moveType,
    latency_ms: durationMs,
    is_guest: event.isGuest,
    success: event.success,
    applied: event.applied,
    ...(typeof event.statusCode === 'number' ? { status_code: event.statusCode } : {}),
    ...(event.isAutoAction ? { is_auto_action: true } : {}),
    ...(event.source ? { source: event.source } : {}),
  } satisfies Record<string, AnalyticsPropertyValue>

  track('move_submit_applied', payload)
  emitOperationalEvent('move_submit_applied', payload)

  if (event.applied && durationMs > MOVE_APPLY_TARGET_MS) {
    trackReliabilityAlert('move_apply_timeout', {
      game_type: event.gameType,
      move_type: event.moveType,
      latency_ms: durationMs,
      target_ms: MOVE_APPLY_TARGET_MS,
      is_guest: event.isGuest,
      ...(event.source ? { source: event.source } : {}),
    })
  }
}

/**
 * Track lobby create API request latency.
 */
export function trackLobbyCreateRequest(event: LobbyCreateLatencyEvent): void {
  const durationMs = normalizeDurationMs(event.durationMs)

  track('lobby_create_request', {
    game_type: event.gameType,
    latency_ms: durationMs,
    is_guest: event.isGuest,
    success: event.success,
    ...(typeof event.statusCode === 'number' ? { status_code: event.statusCode } : {}),
  })
}

/**
 * Track end-to-end latency from create submit to lobby page being ready.
 */
export function trackLobbyCreateReady(event: LobbyCreateReadyEvent): void {
  const durationMs = normalizeDurationMs(event.durationMs)

  const payload = {
    game_type: event.gameType,
    latency_ms: durationMs,
    target_ms: LOBBY_READY_TARGET_MS,
    is_guest: event.isGuest,
  } satisfies Record<string, AnalyticsPropertyValue>

  track('lobby_create_ready', payload)
  emitOperationalEvent('lobby_create_ready', payload)

  if (durationMs > LOBBY_READY_TARGET_MS) {
    track('lobby_create_ready_slow', {
      game_type: event.gameType,
      latency_ms: durationMs,
      target_ms: LOBBY_READY_TARGET_MS,
      is_guest: event.isGuest,
    })
  }
}

export function trackLobbyLeaveRedirect(event: LobbyLeaveRedirectEvent): void {
  const durationMs = normalizeDurationMs(event.durationMs)

  track('lobby_leave_redirect', {
    latency_ms: durationMs,
    is_guest: event.isGuest,
    source: event.source,
    navigation: event.navigation,
    api_outcome: event.apiOutcome,
    ...(typeof event.statusCode === 'number' ? { status_code: event.statusCode } : {}),
    ...(event.gameType ? { game_type: event.gameType } : {}),
  })

  clientLogger.log('[analytics] Lobby leave redirect', {
    latencyMs: durationMs,
    ...event,
  })
}

/**
 * Realtime reliability telemetry
 */
export function trackSocketReconnectAttempt(event: {
  attempt: number
  backoffMs: number
  isGuest: boolean
  transport?: string
  reason?: string
}): void {
  trackRealtimeTelemetry('socket_reconnect_attempt', {
    attempt: event.attempt,
    backoff_ms: event.backoffMs,
    is_guest: event.isGuest,
    ...(event.transport ? { transport: event.transport } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
  })
}

export function trackLobbyJoinRetry(event: {
  attempt: number
  delayMs: number
  trigger: string
  isGuest: boolean
}): void {
  trackRealtimeTelemetry('lobby_join_retry', {
    attempt: event.attempt,
    delay_ms: event.delayMs,
    trigger: event.trigger,
    is_guest: event.isGuest,
  })
}

export function trackLobbyJoinAckTimeout(event: {
  attempt: number
  isGuest: boolean
}): void {
  trackRealtimeTelemetry('lobby_join_ack_timeout', {
    attempt: event.attempt,
    is_guest: event.isGuest,
  })
}

export function trackSocketAuthRefreshFailed(event: {
  stage: 'token_fetch' | 'socket_auth_payload'
  status?: number
  isGuest: boolean
}): void {
  trackReliabilityAlert('auth_refresh_failed', {
    stage: event.stage,
    is_guest: event.isGuest,
    ...(typeof event.status === 'number' ? { status: event.status } : {}),
  })

  trackRealtimeTelemetry('socket_auth_refresh_failed', {
    stage: event.stage,
    is_guest: event.isGuest,
    ...(typeof event.status === 'number' ? { status: event.status } : {}),
  })
}

export function trackSocketReconnectRecovered(event: {
  attemptsTotal: number
  timeToRecoverMs: number
  isGuest: boolean
}): void {
  const payload = {
    attempts_total: event.attemptsTotal,
    time_to_recover_ms: event.timeToRecoverMs,
    is_guest: event.isGuest,
  } satisfies Record<string, AnalyticsPropertyValue>

  trackRealtimeTelemetry('socket_reconnect_recovered', payload)
  emitOperationalEvent('socket_reconnect_recovered', payload)
}

export function trackSocketReconnectFailedFinal(event: {
  attemptsTotal: number
  reason: ReconnectFailureReason
  isGuest: boolean
}): void {
  if (event.reason === 'rejoin_timeout') {
    trackReliabilityAlert('rejoin_timeout', {
      attempts_total: event.attemptsTotal,
      is_guest: event.isGuest,
    })
  }

  const payload = {
    attempts_total: event.attemptsTotal,
    reason: event.reason,
    is_guest: event.isGuest,
  } satisfies Record<string, AnalyticsPropertyValue>

  trackRealtimeTelemetry('socket_reconnect_failed_final', payload)
  emitOperationalEvent('socket_reconnect_failed_final', payload)
}

export function trackStartAloneAutoBotResult(event: StartAloneAutoBotResultEvent): void {
  const payload = {
    game_type: event.gameType,
    success: event.success,
    reason: event.reason,
    is_guest: event.isGuest,
  } satisfies Record<string, AnalyticsPropertyValue>

  track('start_alone_auto_bot_result', payload)
  emitOperationalEvent('start_alone_auto_bot_result', payload)
}

/**
 * Batch analytics helper for game sessions
 */
export class GameSessionAnalytics {
  private startTime: number
  private gameType: GameType
  private actions: string[] = []

  constructor(gameType: GameType) {
    this.gameType = gameType
    this.startTime = Date.now()
  }

  logAction(action: string): void {
    this.actions.push(action)
  }

  end(winner: string, wasBot: boolean, playerCount: number, finalScores: Array<{ playerName: string; score: number }>): void {
    const duration = Math.floor((Date.now() - this.startTime) / 60000) // minutes
    
    trackGameCompleted({
      gameType: this.gameType,
      duration,
      winner,
      wasBot,
      playerCount,
      finalScores,
    })

    // Track session summary
    track('session_summary', {
      game_type: this.gameType,
      duration_minutes: duration,
      total_actions: this.actions.length,
      actions_per_minute: duration > 0 ? (this.actions.length / duration).toFixed(2) : '0',
    })
  }
}

/**
 * User retention tracking
 */
export function trackUserRetention(data: {
  daysActive: number
  gamesPlayed: number
  favoriteGame?: GameType
}): void {
  track('user_retention', {
    days_active: data.daysActive,
    games_played: data.gamesPlayed,
    ...(data.favoriteGame && { favorite_game: data.favoriteGame }),
  })
}

/**
 * Guest → account nudge shown on result screens (GuestConversionNudge).
 * Together with `signupSource` on Users this is the guest→registered funnel.
 */
export function trackSignupPrompt(action: 'shown' | 'clicked' | 'dismissed'): void {
  track('signup_prompt', { action })
  // Also to OperationalEvents, because `track` goes to Vercel Analytics and the Hobby plan
  // dropped every custom event until Pro (2026-09-18): the funnel the Revenue Plan defines
  // had never stored a row, and OperationalEvents stays the queryable copy.
  // Note for whoever reads it: `shown` fires per mount and the nudge suppresses itself after
  // a dismissal, so clicked-over-shown is a per-session ratio, not a per-person one.
  emitOperationalEvent(`signup_prompt_${action}`, { is_guest: true })
  clientLogger.log('[analytics] Signup prompt', action)
}

/** Where the push opt-in was offered. The profile toggle is the old surface, kept for comparison. */
export type PushPromptSource = 'after_game' | 'profile'

/**
 * The push opt-in ask (#984).
 *
 * Unlike the Discord line, `shown` is worth storing here: the ask hides itself for anyone
 * already subscribed, already denied, on a build with no VAPID key, or within 30 days of a
 * dismissal, so `shown` is not "a game ended" – it is "somebody was actually asked". Without
 * it `accepted` has no denominator and there is no way to tell a bad prompt from a prompt
 * nobody ever saw, which is exactly how the profile checkbox stayed at zero subscriptions
 * for months without anyone noticing (#983).
 *
 * `denied` is separate from `dismissed` on purpose: a dismissal is ours to re-ask after 30
 * days, a browser-level denial is permanent for that origin and must never be retried.
 *
 * `failed` is separate from `accepted` for the same reason: the player said yes and the
 * browser subscribed, but the preference write did not land, so nothing will be delivered.
 * Counting that as `accepted` is how an opt-in surface reports success while producing no
 * notifications, which is the whole of #983.
 */
export function trackPushPrompt(
  action: 'shown' | 'accepted' | 'dismissed' | 'denied' | 'failed',
  source: PushPromptSource,
  gameType?: GameType
): void {
  const payload = {
    source,
    ...(gameType ? { game_type: gameType } : {}),
  } satisfies Record<string, AnalyticsPropertyValue>
  track('push_prompt', { action, ...payload })
  emitOperationalEvent(`push_prompt_${action}`, payload)
  clientLogger.log('[analytics] Push prompt', action, payload)
}

/** Where an invite link was shared from; the lobby code goes in the payload so it joins. */
export type InviteCopySource =
  | 'lobby_header_button'
  | 'lobby_code_chip'
  | 'result_overlay'
  | 'waiting_room_slot'

/**
 * Someone sent an invite link out of the page (#920, extended by #927).
 *
 * Still one event for every surface: `source` names the affordance and `method` says
 * whether it went through the OS share sheet or the clipboard, so the share sheet does not
 * fork the funnel the invite loop already measures.
 */
export function trackInviteCopied(
  source: InviteCopySource,
  lobbyCode: string,
  method: InviteShareMethod
): void {
  const payload = {
    source,
    lobby_code: lobbyCode,
    method,
  } satisfies Record<string, AnalyticsPropertyValue>
  track('invite_copied', payload)
  emitOperationalEvent('invite_copied', payload)
  clientLogger.log('[analytics] Invite copied', payload)
}

/**
 * A lobby page opened through a shared link or from another site (#920). Fired once per
 * page mount by the lobby page; the parser in lib/invite-attribution.ts decides whether a
 * load counts at all.
 */
export function trackInviteOpened(attribution: InviteAttribution, lobbyCode: string): void {
  const payload = {
    source: attribution.via,
    lobby_code: lobbyCode,
    ...(attribution.via === 'external_referrer' ? { referrer_host: attribution.referrerHost } : {}),
  } satisfies Record<string, AnalyticsPropertyValue>
  track('invite_opened', payload)
  emitOperationalEvent('invite_opened', payload)
  clientLogger.log('[analytics] Invite opened', payload)
}

/**
 * Premium call to action, wherever it is rendered. `source` names the surface;
 * `plan` is passed only where the surface lets someone pick one, so a click on
 * /premium can be read against the checkout it did or did not become (#926).
 */
export function trackPremiumCta(source: string, plan?: PremiumPlan): void {
  const payload = { source, ...(plan ? { plan } : {}) } satisfies Record<string, AnalyticsPropertyValue>
  track('feature_used', { feature: 'premium_cta', ...payload })
  emitOperationalEvent('premium_cta_clicked', payload)
  clientLogger.log('[analytics] Premium CTA', payload)
}

/** Where a Discord invite was offered; both surfaces are moments of need, not decoration. */
export type DiscordCtaSource = 'after_game' | 'waiting_room'

/**
 * Someone took the Discord invite (#982). The server exists and nothing on the site ever
 * invited a player into it at the moment it would help — alone in a waiting room, or a
 * game that has just ended. Only the click is tracked: the line renders on every result
 * screen, so a "shown" event would be noise at the volume of every finished game.
 */
export function trackDiscordCta(source: DiscordCtaSource, gameType?: GameType): void {
  const payload = {
    source,
    ...(gameType ? { game_type: gameType } : {}),
  } satisfies Record<string, AnalyticsPropertyValue>
  track('feature_used', { feature: 'discord_cta', ...payload })
  emitOperationalEvent('discord_cta_clicked', payload)
  clientLogger.log('[analytics] Discord CTA', payload)
}

/**
 * Conversion funnel tracking
 */
export function trackFunnelStep(step: 'landing' | 'signup' | 'register' | 'guest-join' | 'create_lobby' | 'join_lobby' | 'game_start' | 'game_complete'): void {
  track('funnel_step', {
    step,
    timestamp: Date.now(),
  })
  
  clientLogger.log('[analytics] Funnel step', step)
}
