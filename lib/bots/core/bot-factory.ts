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
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { TicTacToeBot } from '../tic-tac-toe/tic-tac-toe-bot'
import { TicTacToeBotExecutor } from '../tic-tac-toe/tic-tac-toe-bot-executor'
import { RockPaperScissorsBot } from '../rock-paper-scissors/rock-paper-scissors-bot'
import { RockPaperScissorsBotExecutor } from '../rock-paper-scissors/rock-paper-scissors-bot-executor'
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

        case 'tic_tac_toe':
            return new TicTacToeBot(gameEngine as any, difficulty) as any

        case 'rock_paper_scissors':
            return new RockPaperScissorsBot(gameEngine as any, difficulty) as any

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

        case 'tic_tac_toe': {
            if (!(gameEngine instanceof TicTacToeGame)) {
                throw new Error('Expected TicTacToeGame engine for tic_tac_toe bot turn')
            }
            await TicTacToeBotExecutor.executeBotTurn(
                gameEngine,
                botUserId,
                difficulty,
                onMove,
                onBotAction,
            )
            return
        }

        case 'rock_paper_scissors': {
            if (!(gameEngine instanceof RockPaperScissorsGame)) {
                throw new Error('Expected RockPaperScissorsGame engine for rock_paper_scissors bot turn')
            }
            await RockPaperScissorsBotExecutor.executeBotTurn(
                gameEngine,
                botUserId,
                difficulty,
                onMove,
                onBotAction,
            )
            return
        }

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
