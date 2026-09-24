import { CheckersGame } from '@/lib/games/checkers-game'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { CheckersBot } from './checkers-bot'
import { clientLogger } from '@/lib/client-logger'
import { botDelay } from '../core/bot-ux-timing'

export interface CheckersBotActionEvent {
  type: 'thinking' | 'move'
  botName?: string
  message: string
  data?: { from?: [number, number]; to?: [number, number] }
}

/** Base pause before the first hop. */
export const CHECKERS_BOT_THINK_BASE_MS = 150
/** Base pause between the hops of a capture chain, so a human can follow it. */
export const CHECKERS_BOT_HOP_BASE_MS = 250

export class CheckersBotExecutor {
  static async executeBotTurn(
    gameEngine: CheckersGame,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: CheckersBotActionEvent) => void,
  ): Promise<void> {
    const bot = new CheckersBot(gameEngine, difficulty, botUserId)
    const botPlayer = gameEngine.getPlayers().find((p) => p.id === botUserId)

    if (!botPlayer) throw new Error(`Checkers bot player ${botUserId} not found`)

    onBotAction?.({ type: 'thinking', botName: botPlayer.name, message: `${botPlayer.name} is thinking...` })

    await botDelay(difficulty, CHECKERS_BOT_THINK_BASE_MS)

    const decision = await bot.makeDecision()

    // One commit per hop: the server validates each, and the turn only passes
    // once the chain is finished.
    for (let index = 0; index < decision.steps.length; index++) {
      if (index > 0) await botDelay(difficulty, CHECKERS_BOT_HOP_BASE_MS)
      await onMove(bot.decisionToMove(decision, index))
    }

    const first = decision.steps[0]
    const last = decision.steps[decision.steps.length - 1]
    onBotAction?.({
      type: 'move',
      botName: botPlayer.name,
      message: `${botPlayer.name} moved`,
      data: { from: first.from, to: last.to },
    })

    clientLogger.debug('[CHECKERS-BOT] Move executed', { botUserId, hops: decision.steps.length })
  }
}
