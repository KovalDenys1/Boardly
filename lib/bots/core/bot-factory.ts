/**
 * Bot factory - creates appropriate bot instances based on game type
 * and dispatches bot turn execution to the correct executor.
 */

import { GameEngine, Move } from '@/lib/game-engine'
import { BaseBot } from './base-bot'
import { BotDifficulty, MoveCallback } from './bot-types'
import { YahtzeeBot } from '../yahtzee/yahtzee-bot'
import { YahtzeeBotExecutor } from '../yahtzee/yahtzee-bot-executor'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import type { RegisteredGameType } from '@/lib/game-registry'
// Future imports:
// import { SpyBot } from '../spy/spy-bot'

/**
 * Create a bot instance for the specified game type
 */
export function createBot<T extends GameEngine>(
    gameType: RegisteredGameType,
    gameEngine: T,
    difficulty: BotDifficulty = 'medium'
): BaseBot<T, any> {
    switch (gameType) {
        case 'yahtzee':
            return new YahtzeeBot(gameEngine as any, difficulty) as any

        // Future game bots:
        // case 'guess_the_spy':
        //   return new SpyBot(gameEngine as any, difficulty) as any

        default:
            throw new Error(`Bot not implemented for game type: ${gameType}`)
    }
}

/**
 * Execute a full bot turn for the given game type.
 * Dispatches to the game-specific executor (e.g. YahtzeeBotExecutor).
 */
export async function executeBotTurn(
    gameType: RegisteredGameType,
    gameEngine: GameEngine,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: any) => void,
): Promise<void> {
    switch (gameType) {
        case 'yahtzee': {
            if (!(gameEngine instanceof YahtzeeGame)) {
                throw new Error('Expected YahtzeeGame engine for yahtzee bot turn')
            }
            await YahtzeeBotExecutor.executeBotTurn(
                gameEngine,
                botUserId,
                difficulty,
                onMove,
                onBotAction,
            )
            return
        }
        // Future game bots:
        // case 'tic_tac_toe': { ... }

        default:
            throw new Error(`No bot executor for game type: ${gameType}`)
    }
}

/**
 * Get available bot difficulties for a game type
 */
export function getAvailableDifficulties(gameType: RegisteredGameType): BotDifficulty[] {
    // All games support these difficulties by default
    // Can be customized per game if needed
    return ['easy', 'medium', 'hard']
}
