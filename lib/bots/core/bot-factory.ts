/**
 * Bot factory - creates appropriate bot instances based on game type
 */

import { GameEngine } from '@/lib/game-engine'
import { BaseBot } from './base-bot'
import { BotDifficulty } from './bot-types'
import { YahtzeeBot } from '../yahtzee/yahtzee-bot'
// Future imports:
// import { SpyBot } from '../spy/spy-bot'
// import { UnoBot } from '../uno/uno-bot'

export type GameType = 'yahtzee' | 'guess_the_spy' | 'uno' | 'chess' | 'other'

/**
 * Create a bot instance for the specified game type
 */
export function createBot<T extends GameEngine>(
    gameType: GameType,
    gameEngine: T,
    difficulty: BotDifficulty = 'medium'
): BaseBot<T, any> {
    switch (gameType) {
        case 'yahtzee':
            return new YahtzeeBot(gameEngine as any, difficulty) as any

        // Future game bots:
        // case 'guess_the_spy':
        //   return new SpyBot(gameEngine as any, difficulty) as any
        // 
        // case 'uno':
        //   return new UnoBot(gameEngine as any, difficulty) as any

        default:
            throw new Error(`Bot not implemented for game type: ${gameType}`)
    }
}

/**
 * Check if a game type has bot support
 */
export function hasBotSupport(gameType: GameType): boolean {
    return ['yahtzee'].includes(gameType)
    // Future: return ['yahtzee', 'guess_the_spy', 'uno'].includes(gameType)
}

/**
 * Get available bot difficulties for a game type
 */
export function getAvailableDifficulties(gameType: GameType): BotDifficulty[] {
    // All games support these difficulties by default
    // Can be customized per game if needed
    return ['easy', 'medium', 'hard']
}
