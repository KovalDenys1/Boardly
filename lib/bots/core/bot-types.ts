/**
 * Core bot types and interfaces shared across all game bots
 * All games should extend these base types
 */

import { Move, GameEngine } from '@/lib/game-engine'

/**
 * Base bot action event - extend for game-specific events
 */
export interface BaseBotActionEvent {
    type: string
    botName?: string
    message: string
    data?: Record<string, unknown>
}

/**
 * Base bot decision - games should define their specific decision types
 */
export interface BaseBotDecision {
    type: string
    [key: string]: unknown
}

/**
 * Bot difficulty levels (common across all games)
 */
export type BotDifficulty = 'easy' | 'medium' | 'hard'

/**
 * Bot configuration
 */
export interface BotConfig {
    difficulty: BotDifficulty
    thinkingDelay?: number      // ms before making decision
    actionDelay?: number         // ms between actions
    visualFeedback?: boolean     // whether to show visual feedback
}

/**
 * Default bot configurations by difficulty
 */
export const DEFAULT_BOT_CONFIGS: Record<BotDifficulty, BotConfig> = {
    easy: {
        difficulty: 'easy',
        thinkingDelay: 500,
        actionDelay: 400,
        visualFeedback: true,
    },
    medium: {
        difficulty: 'medium',
        thinkingDelay: 300,
        actionDelay: 300,
        visualFeedback: true,
    },
    hard: {
        difficulty: 'hard',
        thinkingDelay: 200,
        actionDelay: 200,
        visualFeedback: true,
    },
}

/**
 * Callback for bot actions (for UI updates)
 */
export type BotActionCallback<T extends BaseBotActionEvent = BaseBotActionEvent> = (
    event: T
) => void

/**
 * Callback for move execution
 */
export type MoveCallback = (move: Move) => Promise<void>
