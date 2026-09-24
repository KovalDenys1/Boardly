import { LudoGame } from '@/lib/games/ludo-game'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { LudoBot } from './ludo-bot'
import { clientLogger } from '@/lib/client-logger'
import { botDelay } from '../core/bot-ux-timing'

export interface LudoBotActionEvent {
  type: 'thinking' | 'roll' | 'move'
  botName?: string
  message: string
  data?: { token?: number; dice?: number | null }
}

/** Base pauses, in bot-ux-timing milliseconds. bot-turn-pace.ts declares the longest. */
export const LUDO_BOT_ROLL_PAUSE_BASE = 300
export const LUDO_BOT_MOVE_PAUSE_BASE = 400

/**
 * One bot turn is several commits: a roll, usually a token move, and again for
 * every six. Each goes through `onMove`, which persists and broadcasts it, so
 * the table sees the die land before the token moves. The loop ends when the
 * turn passes, the game ends, or the safety cap is hit (three sixes forfeit a
 * turn, so a real turn has at most six commits).
 */
const MAX_COMMITS_PER_TURN = 8

export class LudoBotExecutor {
  static async executeBotTurn(
    gameEngine: LudoGame,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: LudoBotActionEvent) => void,
  ): Promise<void> {
    const bot = new LudoBot(gameEngine, difficulty, botUserId)
    const botPlayer = gameEngine.getPlayers().find((player) => player.id === botUserId)
    if (!botPlayer) throw new Error(`Ludo bot player ${botUserId} not found`)

    onBotAction?.({ type: 'thinking', botName: botPlayer.name, message: `${botPlayer.name} is thinking...` })

    for (let commit = 0; commit < MAX_COMMITS_PER_TURN; commit += 1) {
      const state = gameEngine.getState()
      if (state.status !== 'playing') return
      if (gameEngine.getCurrentPlayer()?.id !== botUserId) return

      const isRoll = gameEngine.getPhase() === 'roll'
      await botDelay(difficulty, isRoll ? LUDO_BOT_ROLL_PAUSE_BASE : LUDO_BOT_MOVE_PAUSE_BASE)

      const decision = await bot.makeDecision()
      await onMove(bot.decisionToMove(decision))

      if (decision.type === 'roll') {
        onBotAction?.({
          type: 'roll',
          botName: botPlayer.name,
          message: `${botPlayer.name} rolled`,
          data: { dice: gameEngine.getData().lastRoll?.value ?? null },
        })
      } else {
        onBotAction?.({
          type: 'move',
          botName: botPlayer.name,
          message: `${botPlayer.name} moved a token`,
          data: { token: decision.token },
        })
      }
    }

    clientLogger.warn('[LUDO-BOT] Turn stopped at the commit cap', { botUserId })
  }
}
