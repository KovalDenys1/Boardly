/**
 * Universal bot executor - works with any game bot
 * Handles turn execution, timing, and coordination
 */

import { GameEngine, Move } from '@/lib/game-engine'
import { BaseBot } from './base-bot'
import { BaseBotActionEvent, MoveCallback, BotActionCallback } from './bot-types'
import { clientLogger } from '@/lib/client-logger'
import { isBot } from './bot-helpers'

export class UniversalBotExecutor {
    /**
     * Execute a bot's turn using the provided bot instance
     * @param bot - The bot instance (game-specific)
     * @param botUserId - ID of the bot player
     * @param onMove - Callback to execute moves
     * @param onBotAction - Optional callback for UI updates
     */
    static async executeTurn<TDecision = unknown>(
        bot: BaseBot<any, TDecision>,
        botUserId: string,
        onMove: MoveCallback,
        onBotAction?: BotActionCallback
    ): Promise<void> {
        try {
            clientLogger.log(`🤖 [BOT-EXECUTOR] Starting bot turn for: ${botUserId}`)

            // Emit thinking event
            onBotAction?.({
                type: 'thinking',
                botName: bot['getBotPlayer'](botUserId)?.name,
                message: 'Thinking...',
            })

            await bot['delay']()

            // Bot makes decision
            const decision = await bot.makeDecision()

            // Convert decision to move
            const move = bot.decisionToMove(decision)

            // Execute move
            await onMove(move)

            clientLogger.log(`🤖 [BOT-EXECUTOR] Bot turn completed`)
        } catch (error) {
            clientLogger.error('🤖 [BOT-EXECUTOR] Error during bot turn:', error)
            throw error
        }
    }

    /**
     * Check if a player is a bot (delegates to shared helper)
     */
    static isBot(player: unknown): player is { user: { bot: unknown } } {
        return isBot(player)
    }
}
