import { ConnectFourGame } from '@/lib/games/connect-four-game'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { ConnectFourBot } from './connect-four-bot'
import { clientLogger } from '@/lib/client-logger'
import { resolveBotUxDelayMs } from '../core/bot-ux-timing'

export interface ConnectFourBotActionEvent {
  type: 'thinking' | 'drop'
  botName?: string
  message: string
  data?: { col?: number }
}

export class ConnectFourBotExecutor {
  static async executeBotTurn(
    gameEngine: ConnectFourGame,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: ConnectFourBotActionEvent) => void,
  ): Promise<void> {
    const bot = new ConnectFourBot(gameEngine, difficulty, botUserId)
    const botPlayer = gameEngine.getPlayers().find((p) => p.id === botUserId)

    if (!botPlayer) throw new Error(`Connect Four bot player ${botUserId} not found`)

    onBotAction?.({ type: 'thinking', botName: botPlayer.name, message: `${botPlayer.name} is thinking...` })

    await this.delay(difficulty, 150)

    const decision = await bot.makeDecision()
    const move = bot.decisionToMove(decision)

    await onMove(move)

    onBotAction?.({
      type: 'drop',
      botName: botPlayer.name,
      message: `${botPlayer.name} dropped a disc`,
      data: { col: decision.col },
    })

    clientLogger.debug('🤖 [C4-BOT] Move executed', { botUserId, col: decision.col })
  }

  private static delay(difficulty: BotDifficulty, baseMs: number): Promise<void> {
    const delayMs = resolveBotUxDelayMs(difficulty, baseMs)
    return new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
