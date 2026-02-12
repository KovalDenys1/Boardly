import { track } from '@vercel/analytics'
import { clientLogger } from './client-logger'

/**
 * Analytics wrapper for tracking game events
 * Uses Vercel Analytics for production, logs to console in development
 */

type GameType = 'yahtzee' | 'tic_tac_toe' | 'rock_paper_scissors' | 'guess_the_spy'

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

/**
 * Track lobby creation
 */
export function trackLobbyCreated(event: LobbyEvent): void {
  track('lobby_created', {
    game_type: event.gameType,
    is_private: event.isPrivate,
    max_players: event.maxPlayers,
  })
  
  clientLogger.log('📊 Analytics: Lobby created', event)
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
  
  clientLogger.log('📊 Analytics: Lobby joined', event)
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
  
  clientLogger.log('📊 Analytics: Game started', event)
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
  
  clientLogger.log('📊 Analytics: Game completed', event)
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
  
  clientLogger.log('📊 Analytics: Auth event', event)
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
  
  clientLogger.error('📊 Analytics: Error tracked', event)
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
  
  clientLogger.log('📊 Analytics: Bot performance', data)
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(feature: string, metadata?: Record<string, unknown>): void {
  track('feature_used', {
    feature,
    ...(metadata && metadata),
  })
  
  clientLogger.log('📊 Analytics: Feature used', { feature, metadata })
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
 * Conversion funnel tracking
 */
export function trackFunnelStep(step: 'landing' | 'signup' | 'register' | 'guest-join' | 'create_lobby' | 'join_lobby' | 'game_start' | 'game_complete'): void {
  track('funnel_step', {
    step,
    timestamp: Date.now(),
  })
  
  clientLogger.log('📊 Analytics: Funnel step', step)
}
