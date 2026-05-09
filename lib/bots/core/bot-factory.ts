/**
 * Bot factory - creates appropriate bot instances based on game type
 * and dispatches bot turn execution to the correct executor.
 */

import { GameEngine } from '@/lib/game-engine'
import { BaseBot } from './base-bot'
import { BotDifficulty, BotActionCallback, MoveCallback } from './bot-types'
import { YahtzeeBot } from '../yahtzee/yahtzee-bot'
import { YahtzeeBotExecutor } from '../yahtzee/yahtzee-bot-executor'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { MemoryGame } from '@/lib/games/memory-game'
import { TicTacToeBot } from '../tic-tac-toe/tic-tac-toe-bot'
import { TicTacToeBotExecutor } from '../tic-tac-toe/tic-tac-toe-bot-executor'
import { RockPaperScissorsBot } from '../rock-paper-scissors/rock-paper-scissors-bot'
import { RockPaperScissorsBotExecutor } from '../rock-paper-scissors/rock-paper-scissors-bot-executor'
import { MemoryBot } from '../memory/memory-bot'
import { MemoryBotExecutor } from '../memory/memory-bot-executor'
import { ConnectFourGame } from '@/lib/games/connect-four-game'
import { ConnectFourBot } from '../connect-four/connect-four-bot'
import { ConnectFourBotExecutor } from '../connect-four/connect-four-bot-executor'
import type { RegisteredGameType } from '@/lib/game-registry'

export function createBot(gameType: 'yahtzee', gameEngine: YahtzeeGame, difficulty?: BotDifficulty): YahtzeeBot
export function createBot(gameType: 'tic_tac_toe', gameEngine: TicTacToeGame, difficulty?: BotDifficulty): TicTacToeBot
export function createBot(gameType: 'rock_paper_scissors', gameEngine: RockPaperScissorsGame, difficulty?: BotDifficulty): RockPaperScissorsBot
export function createBot(gameType: 'memory', gameEngine: MemoryGame, difficulty?: BotDifficulty): MemoryBot
export function createBot(gameType: 'connect_four', gameEngine: ConnectFourGame, difficulty?: BotDifficulty): ConnectFourBot
export function createBot(gameType: RegisteredGameType, gameEngine: GameEngine, difficulty?: BotDifficulty): BaseBot<GameEngine, unknown>
export function createBot(
    gameType: RegisteredGameType,
    gameEngine: GameEngine,
    difficulty: BotDifficulty = 'medium'
): BaseBot<GameEngine, unknown> {
    switch (gameType) {
        case 'yahtzee':
            if (!(gameEngine instanceof YahtzeeGame)) throw new Error('Expected YahtzeeGame for yahtzee bot')
            return new YahtzeeBot(gameEngine, difficulty)

        case 'tic_tac_toe':
            if (!(gameEngine instanceof TicTacToeGame)) throw new Error('Expected TicTacToeGame for tic_tac_toe bot')
            return new TicTacToeBot(gameEngine, difficulty)

        case 'rock_paper_scissors':
            if (!(gameEngine instanceof RockPaperScissorsGame)) throw new Error('Expected RockPaperScissorsGame for rock_paper_scissors bot')
            return new RockPaperScissorsBot(gameEngine, difficulty)

        case 'memory':
            if (!(gameEngine instanceof MemoryGame)) throw new Error('Expected MemoryGame for memory bot')
            return new MemoryBot(gameEngine, difficulty)

        case 'connect_four':
            if (!(gameEngine instanceof ConnectFourGame)) throw new Error('Expected ConnectFourGame for connect_four bot')
            return new ConnectFourBot(gameEngine, difficulty)

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
    onBotAction?: BotActionCallback,
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

        case 'memory': {
            if (!(gameEngine instanceof MemoryGame)) {
                throw new Error('Expected MemoryGame engine for memory bot turn')
            }
            await MemoryBotExecutor.executeBotTurn(
                gameEngine,
                botUserId,
                difficulty,
                onMove,
                onBotAction,
            )
            return
        }

        case 'connect_four': {
            if (!(gameEngine instanceof ConnectFourGame)) {
                throw new Error('Expected ConnectFourGame engine for connect_four bot turn')
            }
            await ConnectFourBotExecutor.executeBotTurn(
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
