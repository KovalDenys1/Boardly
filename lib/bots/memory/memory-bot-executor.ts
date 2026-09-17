import { MemoryGame, MemoryGameData } from '@/lib/games/memory-game'
import { clientLogger } from '@/lib/client-logger'
import { BotDifficulty, MoveCallback } from '../core/bot-types'
import { botDelay } from '../core/bot-ux-timing'
import { MemoryBot, MemoryBotDecision } from './memory-bot'

export interface MemoryBotActionEvent {
  type: 'thinking' | 'flip' | 'match' | 'mismatch' | 'resolve-mismatch'
  botName?: string
  message: string
  data?: {
    cardId?: string
    firstCardId?: string
    secondCardId?: string
    strategy?: MemoryBotDecision['strategy']
  }
}

const MAX_PAIR_ATTEMPTS_PER_TURN = 40

export class MemoryBotExecutor {
  static async executeBotTurn(
    gameEngine: MemoryGame,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: MemoryBotActionEvent) => void,
  ): Promise<void> {
    const bot = new MemoryBot(gameEngine, difficulty, botUserId)
    const botPlayer = gameEngine.getPlayers().find((player) => player.id === botUserId)

    if (!botPlayer) {
      throw new Error(`Memory bot player ${botUserId} not found`)
    }

    let attempts = 0
    while (attempts < MAX_PAIR_ATTEMPTS_PER_TURN && this.isBotActiveTurn(gameEngine, botUserId)) {
      const dataBeforeMove = this.getData(gameEngine)

      if (dataBeforeMove.pendingMismatchCardIds.length === 2) {
        await this.resolveMismatch(bot, botPlayer.name, difficulty, onMove, onBotAction)
        return
      }

      if (!this.hasAvailableFlip(dataBeforeMove)) {
        // #990: never leave without ending the turn. Bailing silently here left
        // the turn parked on the bot forever when a player left mid-pair; the
        // engine turns the stragglers back down and advances on a pass.
        const strandedFaceUp = dataBeforeMove.cards.some((card) => card.isFlipped && !card.isMatched)
        if (strandedFaceUp) {
          await onMove({ type: 'timeout-pass', data: {} } as Parameters<MoveCallback>[0])
        }
        return
      }

      onBotAction?.({
        type: 'thinking',
        botName: botPlayer.name,
        message: `${botPlayer.name} is thinking...`,
      })

      await botDelay(difficulty, 260)

      const decision = await bot.makeDecision()
      await this.executeDecision(decision, bot, botPlayer.name, difficulty, onMove, onBotAction)
      attempts += 1

      const stateAfterPair = gameEngine.getState()
      if (stateAfterPair.status !== 'playing') {
        return
      }

      const dataAfterPair = stateAfterPair.data as MemoryGameData
      if (dataAfterPair.pendingMismatchCardIds.length === 2) {
        onBotAction?.({
          type: 'mismatch',
          botName: botPlayer.name,
          data: {
            firstCardId: dataAfterPair.pendingMismatchCardIds[0],
            secondCardId: dataAfterPair.pendingMismatchCardIds[1],
            strategy: decision.strategy,
          },
          message: `${botPlayer.name} missed a pair`,
        })
        await botDelay(difficulty, 1200)
        await this.resolveMismatch(bot, botPlayer.name, difficulty, onMove, onBotAction)
        return
      }

      onBotAction?.({
        type: 'match',
        botName: botPlayer.name,
        data: {
          firstCardId: decision.firstCardId,
          secondCardId: decision.secondCardId,
          strategy: decision.strategy,
        },
        message: `${botPlayer.name} found a pair`,
      })

      await botDelay(difficulty, 420)
    }

    if (attempts >= MAX_PAIR_ATTEMPTS_PER_TURN) {
      clientLogger.warn('🤖 [MEMORY-BOT] Stopped after safety cap', {
        botUserId,
        attempts,
      })
    }
  }

  private static async executeDecision(
    decision: MemoryBotDecision,
    bot: MemoryBot,
    botName: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: MemoryBotActionEvent) => void,
  ): Promise<void> {
    if (!decision.firstCardAlreadyFlipped) {
      const firstMove = bot.decisionToMove(decision)
      await onMove(firstMove)

      onBotAction?.({
        type: 'flip',
        botName,
        data: {
          cardId: decision.firstCardId,
          strategy: decision.strategy,
        },
        message: `${botName} flipped a card`,
      })

      await botDelay(difficulty, 360)
    }

    const secondMove = bot.decisionToSecondMove(decision)
    await onMove(secondMove)

    onBotAction?.({
      type: 'flip',
      botName,
      data: {
        cardId: decision.secondCardId,
        firstCardId: decision.firstCardId,
        secondCardId: decision.secondCardId,
        strategy: decision.strategy,
      },
      message: `${botName} flipped a second card`,
    })
  }

  private static async resolveMismatch(
    bot: MemoryBot,
    botName: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: MemoryBotActionEvent) => void,
  ): Promise<void> {
    await botDelay(difficulty, 180)
    await onMove(bot.createResolveMismatchMove())

    onBotAction?.({
      type: 'resolve-mismatch',
      botName,
      message: `${botName} ends the turn`,
    })
  }

  private static hasAvailableFlip(data: MemoryGameData): boolean {
    const visibleUnmatchedCount = data.cards.filter((card) => card.isFlipped && !card.isMatched).length
    const hiddenUnmatchedCount = data.cards.filter((card) => !card.isFlipped && !card.isMatched).length

    if (visibleUnmatchedCount === 1) {
      return hiddenUnmatchedCount >= 1
    }

    if (visibleUnmatchedCount > 1) {
      // Two unmatched cards face up normally means a pair is mid-resolution and
      // the engine is about to turn them back. #990: a player leaving mid-pair
      // could leave them face up for good, and returning false here stalled the
      // turn forever. The caller now passes instead of going silent.
      return false
    }

    return hiddenUnmatchedCount >= 2
  }

  private static isBotActiveTurn(gameEngine: MemoryGame, botUserId: string): boolean {
    const state = gameEngine.getState()
    return state.status === 'playing' && gameEngine.getCurrentPlayer()?.id === botUserId
  }

  private static getData(gameEngine: MemoryGame): MemoryGameData {
    return gameEngine.getState().data as MemoryGameData
  }

}
