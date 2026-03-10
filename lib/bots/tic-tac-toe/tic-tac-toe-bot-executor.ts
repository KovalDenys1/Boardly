import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { TicTacToeBot } from './tic-tac-toe-bot'
import { clientLogger } from '@/lib/client-logger'
import { resolveBotUxDelayMs } from '../core/bot-ux-timing'

export interface TicTacToeBotActionEvent {
  type: 'thinking' | 'place'
  botName?: string
  message: string
  data?: {
    row?: number
    col?: number
  }
}

export class TicTacToeBotExecutor {
  static async executeBotTurn(
    gameEngine: TicTacToeGame,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: TicTacToeBotActionEvent) => void,
  ): Promise<void> {
    const bot = new TicTacToeBot(gameEngine, difficulty, botUserId)
    const botPlayer = gameEngine.getPlayers().find((player) => player.id === botUserId)

    if (!botPlayer) {
      throw new Error(`Tic-Tac-Toe bot player ${botUserId} not found`)
    }

    onBotAction?.({
      type: 'thinking',
      botName: botPlayer.name,
      message: `${botPlayer.name} is thinking...`,
    })

    // Keep Tic-Tac-Toe bot turns snappy because each move is a single action.
    await this.delay(difficulty, 120)

    const decision = await bot.makeDecision()
    const move = bot.decisionToMove(decision)

    await onMove(move)

    onBotAction?.({
      type: 'place',
      botName: botPlayer.name,
      message: `${botPlayer.name} made a move`,
      data: {
        row: decision.row,
        col: decision.col,
      },
    })

    clientLogger.debug('🤖 [TTT-BOT] Move executed', {
      botUserId,
      row: decision.row,
      col: decision.col,
    })
  }

  private static delay(difficulty: BotDifficulty, baseMs: number): Promise<void> {
    const delayMs = resolveBotUxDelayMs(difficulty, baseMs)
    return new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
