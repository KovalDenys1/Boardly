import { YahtzeeBot } from './yahtzee-bot'
import { YahtzeeGame } from './games/yahtzee-game'
import { Move } from './game-engine'
import { YahtzeeCategory } from './yahtzee'

/**
 * Bot move executor for Yahtzee game
 * Handles automatic bot decision-making and move execution
 */

export interface BotActionEvent {
  type: 'thinking' | 'roll' | 'hold' | 'score'
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
    console.log(`🤖 [BOT-TURN] ============================================`)
    console.log(`🤖 [BOT-TURN] Starting turn for bot: ${botUserId}`)
    console.log(`🤖 [BOT-TURN] Current game state:`, JSON.stringify(gameEngine.getState(), null, 2))

    const gameState = gameEngine.getState()
    const botPlayer = gameEngine.getPlayers().find(p => p.id === botUserId)

    if (!botPlayer) {
      console.error('🤖 [BOT-TURN] ERROR: Bot player not found in game!')
      console.error('🤖 [BOT-TURN] Looking for bot ID:', botUserId)
      console.error('🤖 [BOT-TURN] Available players:', gameEngine.getPlayers().map(p => ({ id: p.id, name: p.name })))
      return
    }
    
    console.log(`🤖 [BOT-TURN] Bot player found: ${botPlayer.name}`)

    // Get bot's scorecard
    const botScorecard = gameEngine.getScorecard(botUserId) || {}

    // Emit thinking event
    onBotAction?.({
      type: 'thinking',
      message: 'Bot is thinking...',
    })
    await this.delay(800)

    // Initial roll (always roll first)
    await this.delay(500)
    onBotAction?.({
      type: 'roll',
      data: { rollNumber: 1 },
      message: 'Bot is rolling dice...',
    })
    
    const rollMove: Move = {
      playerId: botUserId,
      type: 'roll',
      data: {},
      timestamp: new Date(),
    }
    await onMove(rollMove)
    console.log('🤖 Bot rolled dice (roll 1)')

    // Show result
    let currentDice = gameEngine.getDice()
    onBotAction?.({
      type: 'roll',
      data: { 
        dice: currentDice,
        rollNumber: 1
      },
      message: `Bot rolled: ${currentDice.join(', ')}`,
    })
    await this.delay(1000)

    // Get updated state after roll
    let currentHeld = gameEngine.getHeld()
    let rollsLeft = gameEngine.getRollsLeft()

    // Roll up to 2 more times if needed
    for (let rollNum = 2; rollNum <= 3 && rollsLeft > 0; rollNum++) {
      // Decide whether to roll again or score now
      if (this.shouldStopRolling(currentDice, botScorecard)) {
        console.log('🤖 Bot decided to stop rolling and score')
        onBotAction?.({
          type: 'thinking',
          message: 'Bot is satisfied with this roll!',
        })
        await this.delay(800)
        break
      }

      // Decide which dice to hold
      onBotAction?.({
        type: 'thinking',
        message: 'Bot is deciding which dice to hold...',
      })
      await this.delay(800)
      
      const diceToHold = YahtzeeBot.decideDiceToHold(
        currentDice,
        currentHeld,
        rollsLeft,
        botScorecard
      )

      console.log(`🤖 Bot holding dice at indices: ${diceToHold}`)

      // Show hold decision
      onBotAction?.({
        type: 'hold',
        data: {
          dice: currentDice,
          held: diceToHold,
        },
        message: diceToHold.length > 0 
          ? `Bot is holding ${diceToHold.length} ${diceToHold.length === 1 ? 'die' : 'dice'}`
          : 'Bot is not holding any dice',
      })
      await this.delay(1000)

      // Apply holds
      for (let i = 0; i < currentHeld.length; i++) {
        const shouldHold = diceToHold.includes(i)
        if (currentHeld[i] !== shouldHold) {
          const holdMove: Move = {
            playerId: botUserId,
            type: 'hold',
            data: { diceIndex: i },
            timestamp: new Date(),
          }
          await onMove(holdMove)
        }
      }

      // Roll again
      onBotAction?.({
        type: 'roll',
        data: { rollNumber: rollNum },
        message: `Bot is rolling again (roll ${rollNum})...`,
      })
      await this.delay(1000)
      
      const nextRollMove: Move = {
        playerId: botUserId,
        type: 'roll',
        data: {},
        timestamp: new Date(),
      }
      await onMove(nextRollMove)
      console.log(`🤖 Bot rolled dice (roll ${rollNum})`)

      // Update state
      currentDice = gameEngine.getDice()
      onBotAction?.({
        type: 'roll',
        data: { 
          dice: currentDice,
          rollNumber: rollNum
        },
        message: `Bot rolled: ${currentDice.join(', ')}`,
      })
      await this.delay(1000)
      
      currentHeld = gameEngine.getHeld()
      rollsLeft = gameEngine.getRollsLeft()
    }

    // Select category to score
    onBotAction?.({
      type: 'thinking',
      message: 'Bot is choosing a category...',
    })
    await this.delay(1200) // Final decision time
    
    console.log('🤖 [BOT-TURN] Bot analyzing best category to score...')
    console.log('🤖 [BOT-TURN] Final dice:', currentDice)
    console.log('🤖 [BOT-TURN] Bot scorecard:', botScorecard)
    
    const category = YahtzeeBot.selectCategory(currentDice, botScorecard)
    console.log(`🤖 [BOT-TURN] Bot chose category: ${category}`)

    // Calculate score for this category
    const { calculateScore } = require('./yahtzee')
    const score = calculateScore(currentDice, category)
    console.log(`🤖 [BOT-TURN] Expected score: ${score}`)

    // Show category selection
    onBotAction?.({
      type: 'score',
      data: {
        category,
        score,
      },
      message: `Bot selected category: ${category}`,
    })
    await this.delay(1500)

    const scoreMove: Move = {
      playerId: botUserId,
      type: 'score',
      data: { category },
      timestamp: new Date(),
    }
    
    console.log('🤖 [BOT-TURN] Submitting score move to game engine...')
    await onMove(scoreMove)
    console.log('🤖 [BOT-TURN] Score move submitted successfully')
    console.log('🤖 [BOT-TURN] Bot turn completed!')
    console.log(`🤖 [BOT-TURN] ============================================`)
  }

  /**
   * Check if bot should stop rolling based on current dice
   */
  private static shouldStopRolling(dice: number[], scorecard: any): boolean {
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
  static isBot(player: any): boolean {
    return player?.user?.isBot === true
  }
}
