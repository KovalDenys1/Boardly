import { ConnectFourGame } from '@/lib/games/connect-four-game'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { ConnectFourBot } from './connect-four-bot'
import { clientLogger } from '@/lib/client-logger'
import { botDelay } from '../core/bot-ux-timing'

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

    // Search first, so the hard bot's search is spent inside the pause, not after it.
    const thinkingStartedAt = Date.now()
    const decision = await bot.makeDecision()
    const move = bot.decisionToMove(decision)
    await botDelay(difficulty, 150, Date.now() - thinkingStartedAt)

    await onMove(move)

    onBotAction?.({
      type: 'drop',
      botName: botPlayer.name,
      message: `${botPlayer.name} dropped a disc`,
      data: { col: decision.col },
    })

    clientLogger.debug('🤖 [C4-BOT] Move executed', { botUserId, col: decision.col })
  }
}
