import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { RockPaperScissorsBot } from './rock-paper-scissors-bot'
import { clientLogger } from '@/lib/client-logger'
import { resolveBotUxDelayMs } from '../core/bot-ux-timing'

export interface RockPaperScissorsBotActionEvent {
  type: 'thinking' | 'choice'
  botName?: string
  message: string
}

export class RockPaperScissorsBotExecutor {
  static async executeBotTurn(
    gameEngine: RockPaperScissorsGame,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: RockPaperScissorsBotActionEvent) => void,
  ): Promise<void> {
    const bot = new RockPaperScissorsBot(gameEngine, difficulty, botUserId)
    const botPlayer = gameEngine.getPlayers().find((player) => player.id === botUserId)

    if (!botPlayer) {
      throw new Error(`Rock-Paper-Scissors bot player ${botUserId} not found`)
    }

    onBotAction?.({
      type: 'thinking',
      botName: botPlayer.name,
      message: `${botPlayer.name} is thinking...`,
    })

    await this.delay(difficulty, 200)

    const decision = await bot.makeDecision()
    const move = bot.decisionToMove(decision)
    await onMove(move)

    onBotAction?.({
      type: 'choice',
      botName: botPlayer.name,
      message: `${botPlayer.name} locked in a choice`,
    })

    clientLogger.debug('🤖 [RPS-BOT] Choice submitted', {
      botUserId,
    })
  }

  private static delay(difficulty: BotDifficulty, baseMs: number): Promise<void> {
    const delayMs = resolveBotUxDelayMs(difficulty, baseMs)
    return new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
