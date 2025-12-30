import { YahtzeeCategory } from './yahtzee'
import { clientLogger } from './client-logger'

// Bot visualization types
interface BotPlayer {
  userId: string
  user?: {
    isBot?: boolean
    username?: string
  }
}

interface BotVisualizationStep {
  dice?: number[]
  heldDice?: number[]
  category?: string
  message?: string
}

export interface BotMoveStep {
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

/**
 * Create a simplified visualization of what the bot did
 * Based on the final game state after bot's turn
 */
export function createBotMoveVisualization(
  botName: string,
  finalDice: number[],
  selectedCategory: YahtzeeCategory,
  score: number
): BotMoveStep[] {
  const steps: BotMoveStep[] = []

  // Step 1: Thinking
  steps.push({
    type: 'thinking',
    message: `${botName} is thinking...`,
  })

  // Step 2: Show final dice
  steps.push({
    type: 'roll',
    data: {
      dice: finalDice,
      rollNumber: 3, // We don't know exact roll count, so assume last roll
    },
    message: `${botName} rolled: ${finalDice.join(', ')}`,
  })

  // Step 3: Category selection
  steps.push({
    type: 'score',
    data: {
      category: selectedCategory,
      score,
    },
    message: `${botName} selected a category`,
  })

  return steps
}

/**
 * Detect if the game state change was caused by a bot
 * Returns bot player info if it was a bot move, null otherwise
 */
export function detectBotMove(
  previousPlayers: BotPlayer[],
  currentPlayers: BotPlayer[],
  previousCurrentPlayerIndex: number,
  currentCurrentPlayerIndex: number
): { botId: string; botName: string } | null {
  // Check if turn changed
  if (previousCurrentPlayerIndex === currentCurrentPlayerIndex) {
    return null
  }

  // Get the player who just finished their turn
  const playerWhoMoved = previousPlayers[previousCurrentPlayerIndex]
  
  if (!playerWhoMoved) {
    return null
  }

  // Check if it was a bot
  if (playerWhoMoved.user?.isBot || playerWhoMoved.userId?.startsWith('bot_')) {
    return {
      botId: playerWhoMoved.userId,
      botName: playerWhoMoved.user?.username || 'Bot',
    }
  }

  return null
}

/**
 * Find which category was just filled by comparing scorecards
 */
export function findFilledCategory(
  previousScorecard: Record<YahtzeeCategory, number | undefined>,
  currentScorecard: Record<YahtzeeCategory, number | undefined>
): { category: YahtzeeCategory; score: number } | null {
  const categories: YahtzeeCategory[] = [
    'ones',
    'twos',
    'threes',
    'fours',
    'fives',
    'sixes',
    'threeOfKind',
    'fourOfKind',
    'fullHouse',
    'smallStraight',
    'largeStraight',
    'yahtzee',
    'chance',
  ]

  for (const category of categories) {
    const prevScore = previousScorecard[category]
    const currScore = currentScorecard[category]

    // Found a category that was just filled
    if (prevScore === undefined && currScore !== undefined) {
      return { category, score: currScore }
    }
  }

  return null
}
