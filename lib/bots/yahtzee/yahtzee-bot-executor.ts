/**
 * Yahtzee Bot Executor - specialized executor for Yahtzee game
 * Handles turn-by-turn execution with visual feedback
 */

import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { YahtzeeBot, YahtzeeBotDecision } from './yahtzee-bot'
import { Move } from '@/lib/game-engine'
import { YahtzeeCategory, calculateScore } from '@/lib/yahtzee'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { clientLogger } from '@/lib/client-logger'
import { getCategoryDisplayName } from '@/lib/celebrations'
import { resolveBotUxDelayMs } from '../core/bot-ux-timing'

export interface YahtzeeBotActionEvent {
    type: 'thinking' | 'roll' | 'hold' | 'score'
    botName?: string
    data?: {
        dice?: number[]
        held?: number[]
        category?: YahtzeeCategory
        score?: number
        rollNumber?: number
    }
    message: string
}

export class YahtzeeBotExecutor {
    /**
     * Execute a complete Yahtzee bot turn with realistic timing and visual feedback
     */
    static async executeBotTurn(
        gameEngine: YahtzeeGame,
        botUserId: string,
        difficulty: BotDifficulty,
        onMove: MoveCallback,
        onBotAction?: (event: YahtzeeBotActionEvent) => void
    ): Promise<void> {
        try {
            clientLogger.log(`🤖 [YAHTZEE-BOT] ============================================`)
            clientLogger.log(`🤖 [YAHTZEE-BOT] Starting turn for bot: ${botUserId}`)

            const bot = new YahtzeeBot(gameEngine, difficulty)
            const botPlayer = bot['getBotPlayer'](botUserId)

            if (!botPlayer) {
                throw new Error(`Bot player ${botUserId} not found`)
            }

            clientLogger.log(`🤖 [YAHTZEE-BOT] Bot player: ${botPlayer.name}`)

            // Emit thinking event
            onBotAction?.({
                type: 'thinking',
                botName: botPlayer.name,
                message: `${botPlayer.name} is thinking...`,
            })
            await this.delay(difficulty, 300)

            // Execute turn step by step
            let rollNumber = 0
            let rollsLeft = gameEngine.getRollsLeft()

            while (rollsLeft > 0) {
                rollNumber++

                // Bot makes decision
                const decision = await bot.makeDecision()

                if (decision.type === 'score') {
                    // Bot decided to score (end turn)
                    await this.executeScore(
                        decision,
                        bot,
                        botPlayer.name,
                        difficulty,
                        gameEngine,
                        onMove,
                        onBotAction
                    )
                    break
                }

                if (decision.type === 'roll') {
                    // Bot decided to roll
                    await this.executeRoll(
                        decision,
                        bot,
                        botPlayer.name,
                        rollNumber,
                        difficulty,
                        gameEngine,
                        onMove,
                        onBotAction
                    )
                    rollsLeft = gameEngine.getRollsLeft()
                }
            }

            // If all rolls used, must score
            if (rollsLeft === 0) {
                const decision = await bot.makeDecision()
                await this.executeScore(
                    decision,
                    bot,
                    botPlayer.name,
                    difficulty,
                    gameEngine,
                    onMove,
                    onBotAction
                )
            }

            clientLogger.log('🤖 [YAHTZEE-BOT] Turn completed!')
            clientLogger.log(`🤖 [YAHTZEE-BOT] ============================================`)
        } catch (error) {
            clientLogger.error('🤖 [YAHTZEE-BOT] Error during bot turn:', error)
            throw error
        }
    }

    /**
     * Execute a roll action
     */
    private static async executeRoll(
        decision: YahtzeeBotDecision,
        bot: YahtzeeBot,
        botName: string,
        rollNumber: number,
        difficulty: BotDifficulty,
        gameEngine: YahtzeeGame,
        onMove: MoveCallback,
        onBotAction?: (event: YahtzeeBotActionEvent) => void
    ): Promise<void> {
        await this.delay(difficulty, 200)

        onBotAction?.({
            type: 'roll',
            botName,
            data: { rollNumber },
            message: `${botName} is rolling dice...`,
        })

        const move = bot.decisionToMove(decision)
        await onMove(move)

        // Show result
        const dice = gameEngine.getDice()
        const held = gameEngine.getHeld()
        const heldIndices = held.map((isHeld, idx) => (isHeld ? idx : -1)).filter(idx => idx !== -1)

        onBotAction?.({
            type: 'roll',
            botName,
            data: {
                dice,
                rollNumber,
                held: heldIndices,
            },
            message: `${botName} rolled: ${dice.join(', ')}`,
        })

        if (heldIndices.length > 0) {
            await this.delay(difficulty, 150)
            onBotAction?.({
                type: 'hold',
                botName,
                data: {
                    dice,
                    held: heldIndices,
                    rollNumber,
                },
                message: `${botName} holds ${heldIndices.length} dice`,
            })
        }

        await this.delay(difficulty, 400)
    }

    /**
     * Execute a score action
     */
    private static async executeScore(
        decision: YahtzeeBotDecision,
        bot: YahtzeeBot,
        botName: string,
        difficulty: BotDifficulty,
        gameEngine: YahtzeeGame,
        onMove: MoveCallback,
        onBotAction?: (event: YahtzeeBotActionEvent) => void
    ): Promise<void> {
        if (!decision.category) {
            throw new Error('Category required for scoring')
        }

        const dice = gameEngine.getDice()
        const score = calculateScore(dice, decision.category)

        await this.delay(difficulty, 300)

        const categoryName = getCategoryDisplayName(decision.category)
        onBotAction?.({
            type: 'score',
            botName,
            data: {
                category: decision.category,
                score,
                dice,
            },
            message: `${botName} scores ${score} in ${categoryName}`,
        })

        await this.delay(difficulty, 200)

        const move = bot.decisionToMove(decision)
        await onMove(move)

        clientLogger.log('🤖 [YAHTZEE-BOT] Score submitted successfully')
    }

    /**
     * Delay helper
     */
    private static delay(difficulty: BotDifficulty, baseMs: number): Promise<void> {
        const delayMs = resolveBotUxDelayMs(difficulty, baseMs)
        return new Promise(resolve => setTimeout(resolve, delayMs))
    }
}
