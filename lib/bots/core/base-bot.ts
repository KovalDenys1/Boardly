/**
 * Abstract base class for all game bots
 * Each game should extend this class and implement game-specific AI logic
 */

import { GameEngine, Move, Player } from '@/lib/game-engine'
import { BotConfig, DEFAULT_BOT_CONFIGS, BotDifficulty } from './bot-types'
import { clientLogger } from '@/lib/client-logger'

export abstract class BaseBot<
    TGameEngine extends GameEngine = GameEngine,
    TDecision = unknown
> {
    protected config: BotConfig
    protected gameEngine: TGameEngine

    constructor(
        gameEngine: TGameEngine,
        difficulty: BotDifficulty = 'medium'
    ) {
        this.gameEngine = gameEngine
        this.config = DEFAULT_BOT_CONFIGS[difficulty]
    }

    /**
     * Main decision-making method - must be implemented by each game bot
     * @returns Promise that resolves to a bot decision
     */
    abstract makeDecision(): Promise<TDecision>

    /**
     * Convert bot decision to game move
     * @param decision - The bot's decision
     * @returns Game move that can be executed
     */
    abstract decisionToMove(decision: TDecision): Move

    /**
     * Evaluate current game state (for debugging/logging)
     * @returns Summary of current state
     */
    abstract evaluateState(): string

    /**
     * Check if it's bot's turn
     */
    protected isBotTurn(botUserId: string): boolean {
        const currentPlayer = this.gameEngine.getCurrentPlayer()
        return currentPlayer?.id === botUserId
    }

    /**
     * Get bot player
     */
    protected getBotPlayer(botUserId: string): Player | undefined {
        return this.gameEngine.getPlayers().find(p => p.id === botUserId)
    }

    /**
     * Delay for realistic bot behavior
     */
    protected async delay(ms?: number): Promise<void> {
        const delayTime = ms ?? this.config.thinkingDelay ?? 300
        return new Promise(resolve => setTimeout(resolve, delayTime))
    }

    /**
     * Log bot action
     */
    protected log(message: string, data?: Record<string, unknown>): void {
        clientLogger.log(`🤖 [${this.constructor.name}] ${message}`, data)
    }

    /**
     * Log bot error
     */
    protected logError(message: string, error?: unknown): void {
        clientLogger.error(`🤖 [${this.constructor.name}] ${message}`, error)
    }

    /**
     * Update bot configuration
     */
    setConfig(config: Partial<BotConfig>): void {
        this.config = { ...this.config, ...config }
    }

    /**
     * Get current configuration
     */
    getConfig(): BotConfig {
        return { ...this.config }
    }
}
