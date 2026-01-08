import { YahtzeeBot } from './yahtzee-bot'
import { YahtzeeGame } from './games/yahtzee-game'
import { Move } from './game-engine'
import { YahtzeeCategory } from './yahtzee'
import { clientLogger } from './client-logger'
import { getCategoryDisplayName } from './celebrations'

/**
 * Bot move executor for Yahtzee game
 * Handles automatic bot decision-making and move execution
 */

export interface BotActionEvent {
  type: 'thinking' | 'roll' | 'hold' | 'score'
  botName?: string
  data?: {
    dice?: number[]
    held?: number[]
    category?: YahtzeeCategory
    score?: number
    rollNumber?: number
  }
  message: string
}

export class BotMoveExecutor {
  /**
   * Execute a bot's turn with realistic delays
   * Returns a promise that resolves when the bot has completed its turn
   */
  static async executeBotTurn(
    gameEngine: YahtzeeGame,
    botUserId: string,
    onMove: (move: Move) => Promise<void>,
    onBotAction?: (event: BotActionEvent) => void
  ): Promise<void> {
    try {
      clientLogger.log(`🤖 [BOT-TURN] ============================================`)
      clientLogger.log(`🤖 [BOT-TURN] Starting turn for bot: ${botUserId}`)
      clientLogger.log(`🤖 [BOT-TURN] Current game state:`, JSON.stringify(gameEngine.getState(), null, 2))

      const gameState = gameEngine.getState()
      const botPlayer = gameEngine.getPlayers().find(p => p.id === botUserId)

      if (!botPlayer) {
        clientLogger.error('Bot player not found in game', {
          botUserId,
          availablePlayers: gameEngine.getPlayers().map(p => ({ id: p.id, name: p.name }))
        })
        throw new Error(`Bot player ${botUserId} not found in game`)
      }
      
      clientLogger.log(`🤖 [BOT-TURN] Bot player found: ${botPlayer.name}`)

      // Get bot's scorecard (will return empty object if not initialized yet)
      const botScorecard = gameEngine.getScorecard(botUserId)

      // Emit thinking event
      onBotAction?.({
        type: 'thinking',
        botName: botPlayer.name,
        message: `${botPlayer.name} is thinking...`,
      })
      await this.delay(300) // Reduced from 800ms for faster gameplay

    // Initial roll (always roll first)
    await this.delay(200) // Reduced from 500ms for faster gameplay
    onBotAction?.({
      type: 'roll',
      botName: botPlayer.name,
      data: { rollNumber: 1 },
      message: `${botPlayer.name} is rolling dice...`,
    })
    
    const rollMove: Move = {
      playerId: botUserId,
      type: 'roll',
      data: { held: [false, false, false, false, false] }, // Initial roll - no dice held
      timestamp: new Date(),
    }
    await onMove(rollMove)
    clientLogger.log('🤖 Bot rolled dice (roll 1)')
    
    // Show result
    let currentDice = gameEngine.getDice()
    let currentHeld = gameEngine.getHeld()
    onBotAction?.({
      type: 'roll',
      botName: botPlayer.name,
      data: { 
        dice: currentDice,
        rollNumber: 1,
        held: currentHeld.map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1) // Convert to indices
      },
      message: `${botPlayer.name} rolled: ${currentDice.join(', ')}`,
    })
    await this.delay(400) // Reduced from 1000ms for faster gameplay

    // Get updated state after roll
    let rollsLeft = gameEngine.getRollsLeft()

    // Roll up to 2 more times if needed
    for (let rollNum = 2; rollNum <= 3 && rollsLeft > 0; rollNum++) {
      // Decide whether to roll again or score now
      if (this.shouldStopRolling(currentDice, botScorecard as Record<string, number>)) {
        clientLogger.log('🤖 Bot decided to stop rolling and score')
        onBotAction?.({
          type: 'thinking',
          botName: botPlayer.name,
          message: `${botPlayer.name} is satisfied with this roll!`,
        })
        await this.delay(300) // Reduced from 800ms for faster gameplay
        break
      }

      // Decide which dice to hold
      onBotAction?.({
        type: 'thinking',
        botName: botPlayer.name,
        message: `${botPlayer.name} is deciding which dice to hold...`,
      })
      await this.delay(300) // Reduced from 800ms for faster gameplay
      
      const diceToHold = YahtzeeBot.decideDiceToHold(
        currentDice,
        currentHeld,
        rollsLeft,
        botScorecard
      )

      clientLogger.log(`🤖 Bot holding dice at indices: ${diceToHold}`)

      // Build the new held array based on bot decision
      const newHeld = currentDice.map((_, index) => diceToHold.includes(index))

      // Show hold decision
      onBotAction?.({
        type: 'hold',
        botName: botPlayer.name,
        data: {
          dice: currentDice,
          held: diceToHold,
        },
        message: diceToHold.length > 0 
          ? `${botPlayer.name} is holding ${diceToHold.length} ${diceToHold.length === 1 ? 'die' : 'dice'}`
          : `${botPlayer.name} is not holding any dice`,
      })
      await this.delay(400) // Reduced from 1000ms for faster gameplay

      // Apply all holds at once using the held array format
      const holdMove: Move = {
        playerId: botUserId,
        type: 'hold',
        data: { held: newHeld },
        timestamp: new Date(),
      }
      await onMove(holdMove)

      // Update held state for next roll
      currentHeld = newHeld

      // Roll again with current held state
      onBotAction?.({
        type: 'roll',
        botName: botPlayer.name,
        data: { rollNumber: rollNum },
        message: `${botPlayer.name} is rolling again (roll ${rollNum})...`,
      })
      await this.delay(400) // Reduced from 1000ms for faster gameplay
      
      const nextRollMove: Move = {
        playerId: botUserId,
        type: 'roll',
        data: { held: currentHeld }, // Send held array with roll
        timestamp: new Date(),
      }
      await onMove(nextRollMove)
      clientLogger.log(`🤖 Bot rolled dice (roll ${rollNum})`)

      // Update state
      currentDice = gameEngine.getDice()
      currentHeld = gameEngine.getHeld()
      onBotAction?.({
        type: 'roll',
        botName: botPlayer.name,
        data: { 
          dice: currentDice,
          rollNumber: rollNum,
          held: currentHeld.map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1) // Convert to indices
        },
        message: `${botPlayer.name} rolled: ${currentDice.join(', ')}`,
      })
      await this.delay(400) // Reduced from 1000ms for faster gameplay
      
      rollsLeft = gameEngine.getRollsLeft()
    }

    // Select category to score
    onBotAction?.({
      type: 'thinking',
      botName: botPlayer.name,
      message: `${botPlayer.name} is choosing a category...`,
    })
    await this.delay(500) // Reduced from 1200ms for faster gameplay
    
    clientLogger.log('🤖 [BOT-TURN] Bot analyzing best category to score...', {
      dice: currentDice,
      scorecard: botScorecard
    })
    
    const category = YahtzeeBot.selectCategory(currentDice, botScorecard)
    clientLogger.log(`🤖 [BOT-TURN] Bot chose category: ${category}`)

    // Calculate score for this category
    const { calculateScore } = require('./yahtzee')
    const score = calculateScore(currentDice, category)
    clientLogger.log(`🤖 [BOT-TURN] Expected score: ${score}`)

    // Show category selection
    onBotAction?.({
      type: 'score',
      botName: botPlayer.name,
      data: {
        category,
        score,
      },
      message: `${botPlayer.name} selected ${getCategoryDisplayName(category)} • +${score} pts`,
    })
    await this.delay(600) // Reduced from 1500ms for faster gameplay

    const scoreMove: Move = {
      playerId: botUserId,
      type: 'score',
      data: { category },
      timestamp: new Date(),
    }
    
    clientLogger.log('🤖 [BOT-TURN] Submitting score move to game engine...')
    await onMove(scoreMove)
    clientLogger.log('🤖 [BOT-TURN] Score move submitted successfully')
    clientLogger.log('🤖 [BOT-TURN] Bot turn completed!')
    clientLogger.log(`🤖 [BOT-TURN] ============================================`)
    } catch (error) {
      clientLogger.error('🤖 [BOT-TURN] Error during bot turn execution:', error)
      throw error // Re-throw to propagate to caller
    }
  }

  /**
   * Check if bot should stop rolling based on current dice
   */
  private static shouldStopRolling(dice: number[], scorecard: Record<string, number>): boolean {
    // Count dice values
    const counts = new Map<number, number>()
    dice.forEach(d => counts.set(d, (counts.get(d) || 0) + 1))

    // Stop if we have Yahtzee (5 of a kind)
    if (Array.from(counts.values()).some(c => c === 5)) {
      return true
    }

    // Stop if we have large straight (5 consecutive)
    const sortedUnique = Array.from(counts.keys()).sort((a, b) => a - b)
    if (this.hasConsecutive(sortedUnique, 5)) {
      return true
    }

    // Stop if we have full house (3 + 2)
    const countValues = Array.from(counts.values()).sort((a, b) => b - a)
    if (countValues.length === 2 && countValues[0] === 3 && countValues[1] === 2) {
      return true
    }

    // Stop if we have 4 of a kind with high sum
    if (Array.from(counts.values()).some(c => c === 4)) {
      const sum = dice.reduce((a, b) => a + b, 0)
      if (sum >= 24) return true
    }

    return false
  }

  /**
   * Check for consecutive numbers
   */
  private static hasConsecutive(values: number[], length: number): boolean {
    if (values.length < length) return false

    for (let i = 0; i <= values.length - length; i++) {
      let consecutive = true
      for (let j = 1; j < length; j++) {
        if (values[i + j] !== values[i] + j) {
          consecutive = false
          break
        }
      }
      if (consecutive) return true
    }
    return false
  }

  /**
   * Delay helper for realistic bot behavior
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Check if a player is a bot
   */
  static isBot(player: unknown): player is { user: { isBot: true } } {
    return (
      typeof player === 'object' &&
      player !== null &&
      'user' in player &&
      typeof player.user === 'object' &&
      player.user !== null &&
      'isBot' in player.user &&
      player.user.isBot === true
    )
  }
}
