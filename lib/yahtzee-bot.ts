import { YahtzeeCategory, calculateScore, YahtzeeScorecard } from './yahtzee'

/**
 * Yahtzee AI Bot with optimal strategy
 * Implements game theory and probability-based decision making
 */

export interface BotDecision {
  type: 'roll' | 'hold' | 'score'
  diceToHold?: number[] // indices of dice to hold
  category?: YahtzeeCategory
}

export class YahtzeeBot {
  /**
   * Decides which dice to hold based on current roll and available categories
   */
  static decideDiceToHold(
    dice: number[],
    currentHeld: boolean[],
    rollsLeft: number,
    scorecard: YahtzeeScorecard
  ): number[] {
    if (rollsLeft === 0) return []

    const diceCounts = this.countDice(dice)
    const availableCategories = this.getAvailableCategories(scorecard)

    // First roll - aim for high-value patterns
    if (rollsLeft === 3) {
      return this.firstRollStrategy(dice, diceCounts, availableCategories)
    }

    // Second/Third roll - refine strategy
    return this.refineRollStrategy(dice, diceCounts, rollsLeft, availableCategories)
  }

  /**
   * Selects the best category to score based on current dice and scorecard
   */
  static selectCategory(
    dice: number[],
    scorecard: YahtzeeScorecard
  ): YahtzeeCategory {
    const availableCategories = this.getAvailableCategories(scorecard)
    
    // Task 2.1: Graceful fallback if no categories available
    // This should never happen in normal gameplay, but provides safety
    if (availableCategories.length === 0) {
      console.error('⚠️  Bot error: No available categories in scorecard')
      // Fallback: return 'chance' as it's typically filled last
      // If this is called, the game state is corrupted, but we won't crash
      return 'chance'
    }

    // Task 2.3: Endgame strategy when few categories remain
    const isEndgame = availableCategories.length <= 3

    // Calculate expected value for each category
    const categoryScores: Array<{ category: YahtzeeCategory; score: number; priority: number }> = []

    for (const category of availableCategories) {
      const score = calculateScore(dice, category)
      const priority = this.getCategoryPriority(category, score, dice, scorecard, isEndgame)
      categoryScores.push({ category, score, priority })
    }

    // Sort by priority (higher is better), then by score
    categoryScores.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return b.score - a.score
    })

    // Return the best category
    return categoryScores[0].category
  }

  /**
   * First roll strategy - identify and hold promising patterns
   */
  private static firstRollStrategy(
    dice: number[],
    diceCounts: Map<number, number[]>,
    availableCategories: YahtzeeCategory[]
  ): number[] {
    // Check for Yahtzee (5 of a kind)
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 5) {
        return indices // Hold all - we have Yahtzee!
      }
    }

    // Check for 4 of a kind
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 4) {
        return indices // Hold the four
      }
    }

    // Check for 3 of a kind
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 3) {
        // If we need upper section for this number, hold it
        const upperCategory = this.numberToUpperCategory(value)
        if (availableCategories.includes(upperCategory)) {
          return indices
        }
        // Otherwise hold for three of a kind
        if (availableCategories.includes('threeOfKind') || availableCategories.includes('fourOfKind')) {
          return indices
        }
      }
    }

    // Check for pairs (potential full house or straight)
    const pairs: number[] = []
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 2) {
        pairs.push(...indices)
      }
    }

    // Check for straight potential
    const uniqueValues = Array.from(diceCounts.keys()).sort((a, b) => a - b)
    if (this.hasConsecutive(uniqueValues, 4)) {
      // Hold dice that form the straight
      const straightDice = this.getConsecutiveDice(dice, 4)
      if (straightDice.length >= 4) {
        return straightDice
      }
    }

    // Hold high-value dice (5s and 6s) for upper section or chance
    const highValueIndices: number[] = []
    dice.forEach((value, index) => {
      if (value >= 5) {
        highValueIndices.push(index)
      }
    })

    if (highValueIndices.length >= 2) {
      return highValueIndices
    }

    // Default: don't hold anything on first roll if no clear pattern
    return []
  }

  /**
   * Refine strategy for subsequent rolls
   */
  private static refineRollStrategy(
    dice: number[],
    diceCounts: Map<number, number[]>,
    rollsLeft: number,
    availableCategories: YahtzeeCategory[]
  ): number[] {
    // Similar to first roll but more aggressive

    // Yahtzee
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 5) return indices
    }

    // 4 of a kind - try to get 5th
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 4) return indices
    }

    // 3 of a kind - try to get 4th or 5th
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 3) return indices
    }

    // Check for full house (3 + 2)
    let threeOfKind: number[] = []
    let pair: number[] = []
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length === 3) threeOfKind = indices
      if (indices.length === 2) pair = indices
    }
    if (threeOfKind.length === 3 && pair.length === 2 && availableCategories.includes('fullHouse')) {
      return [...threeOfKind, ...pair]
    }

    // Straight strategies
    const uniqueValues = Array.from(diceCounts.keys()).sort((a, b) => a - b)
    
    // Large straight (5 consecutive)
    if (this.hasConsecutive(uniqueValues, 5) && availableCategories.includes('largeStraight')) {
      return this.getConsecutiveDice(dice, 5)
    }

    // Small straight (4 consecutive)
    if (this.hasConsecutive(uniqueValues, 4) && availableCategories.includes('smallStraight')) {
      const straightDice = this.getConsecutiveDice(dice, 4)
      return straightDice
    }

    // Hold any pairs for potential
    const allPairs: number[] = []
    for (const [value, indices] of diceCounts.entries()) {
      if (indices.length >= 2) {
        allPairs.push(...indices)
      }
    }
    if (allPairs.length > 0) return allPairs

    // Hold high values
    const highValueIndices: number[] = []
    dice.forEach((value, index) => {
      if (value >= 4) {
        highValueIndices.push(index)
      }
    })

    return highValueIndices
  }

  /**
   * Calculate priority for a category based on score and game state
   * Task 2.2: Enhanced upper section bonus logic
   * Task 2.3: Endgame strategy considerations
   */
  private static getCategoryPriority(
    category: YahtzeeCategory,
    score: number,
    dice: number[],
    scorecard: YahtzeeScorecard,
    isEndgame: boolean = false
  ): number {
    // Base priority on actual score
    let priority = score

    // Yahtzee bonus
    if (category === 'yahtzee' && score === 50) {
      return 1000 // Highest priority
    }

    // Large straight bonus
    if (category === 'largeStraight' && score === 40) {
      return 500
    }

    // Small straight
    if (category === 'smallStraight' && score === 30) {
      return 400
    }

    // Full house
    if (category === 'fullHouse' && score === 25) {
      return 350
    }

    // Four of a kind with high sum
    if (category === 'fourOfKind' && score >= 20) {
      return 300 + score
    }

    // Three of a kind with high sum
    if (category === 'threeOfKind' && score >= 18) {
      return 200 + score
    }

    // Task 2.2: Improved upper section strategy with bonus consideration
    const upperValueMap = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 } as const
    type UpperCategory = keyof typeof upperValueMap
    const upperCategories: UpperCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
    if (upperCategories.includes(category as UpperCategory)) {
      const upperSum = this.getUpperSectionSum(scorecard)
      const remaining = 63 - upperSum
      const availableUpper = upperCategories.filter(cat => scorecard[cat] === undefined)
      
      // Calculate if bonus is still achievable (max points per category: ones=5, twos=10, threes=15, etc.)
      const maxPossibleFromAvailable = availableUpper.reduce((sum, cat) => {
        const value = upperValueMap[cat]
        return sum + (value * 5) // Max 5 dice of that value
      }, 0)
      const maxPossibleUpper = upperSum + maxPossibleFromAvailable
      const bonusAchievable = maxPossibleUpper >= 63
      
      if (bonusAchievable && remaining > 0) {
        // Strategy: prioritize based on how close we are to bonus
        if (remaining <= 10) {
          // Very close to bonus - strongly prioritize upper section
          priority += 300
          // Prioritize the category that gives us the most points
          if (category === 'fives' || category === 'sixes') {
            priority += 150
          }
          
          // If this exact category can complete the bonus, mega boost
          if (score >= remaining) {
            priority += 300 // CRITICAL: This secures the +35 bonus!
          }
        } else if (remaining <= 20) {
          // Moderately close - increase priority
          priority += 250
          if (category === 'fives' || category === 'sixes') {
            priority += 100
          }
          
          // If this category can complete or nearly complete the bonus
          if (score >= remaining) {
            priority += 250 // Secures bonus
          } else if (score >= remaining - 5) {
            priority += 150
          }
        } else if (remaining <= 35) {
          // Still have room - moderate boost
          priority += 100
          if (category === 'fives' || category === 'sixes') {
            priority += 50
          }
        } else {
          // Early game - slight boost for high-value categories
          if (category === 'fives' || category === 'sixes') {
            priority += 50
          }
        }
        
        // Don't sacrifice high-value combinations for tiny upper section gains
        // If we have a good lower section combo (e.g., Yahtzee, straights), don't force upper
        const hasHighValueCombo = dice.every(d => d === dice[0]) || // Yahtzee
                                   this.isLargeStraight(dice) ||
                                   (category === 'ones' || category === 'twos') && score <= 3
        
        if (hasHighValueCombo && (category === 'ones' || category === 'twos')) {
          // Don't waste excellent combos on 1-3 points in upper section
          priority -= 100
        }
      } else if (!bonusAchievable) {
        // Bonus is mathematically impossible - don't prioritize upper section
        // Just take the score value as-is
        if (category === 'ones' || category === 'twos' || category === 'threes') {
          // Low-value categories become dump targets
          priority -= 50
        }
      }
    }

    // Task 2.3: Endgame strategy
    if (isEndgame) {
      // In endgame, be more conservative and take guaranteed points
      // Avoid risky plays and prioritize actual score over potential
      
      if (score === 0) {
        // In endgame, taking 0 is very bad - try to avoid if possible
        priority = -200
      } else if (score >= 15) {
        // Boost any decent score in endgame
        priority += 50
      }
      
      // Prefer completing upper section if bonus is still achievable
      if (upperCategories.includes(category as UpperCategory)) {
        const upperSum = this.getUpperSectionSum(scorecard)
        const remaining = 63 - upperSum
        if (remaining > 0 && remaining <= 15) {
          // Can still get bonus - strongly prioritize
          priority += 150
        }
      }
    }

    // Deprioritize low scores
    if (score === 0) {
      // Use this slot to dump bad rolls
      priority = -100
      
      // But prefer to zero out low-value categories first
      if (category === 'ones' || category === 'twos') {
        priority = -50
      }
      
      // In endgame, avoid zeros even more
      if (isEndgame) {
        priority -= 100
      }
    }

    // Chance - good for moderate scores when nothing else fits
    if (category === 'chance') {
      if (score >= 20) {
        priority = 150
      } else if (score < 15) {
        priority = -80
      }
      
      // In endgame, chance is often the last resort
      if (isEndgame && score >= 15) {
        priority += 30
      }
    }

    return priority
  }

  /**
   * Helper: Count occurrences of each die value
   */
  private static countDice(dice: number[]): Map<number, number[]> {
    const counts = new Map<number, number[]>()
    dice.forEach((value, index) => {
      if (!counts.has(value)) {
        counts.set(value, [])
      }
      counts.get(value)!.push(index)
    })
    return counts
  }

  /**
   * Helper: Get available categories from scorecard
   */
  private static getAvailableCategories(scorecard: YahtzeeScorecard): YahtzeeCategory[] {
    const allCategories: YahtzeeCategory[] = [
      'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
      'threeOfKind', 'fourOfKind', 'fullHouse', 'smallStraight',
      'largeStraight', 'yahtzee', 'chance'
    ]
    return allCategories.filter(cat => scorecard[cat] === undefined)
  }

  /**
   * Helper: Convert die value to upper section category
   */
  private static numberToUpperCategory(value: number): YahtzeeCategory {
    const map: Record<number, YahtzeeCategory> = {
      1: 'ones',
      2: 'twos',
      3: 'threes',
      4: 'fours',
      5: 'fives',
      6: 'sixes'
    }
    return map[value] || 'chance'
  }

  /**
   * Helper: Check if array has consecutive numbers
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
   * Helper: Get indices of dice that form consecutive sequence
   */
  private static getConsecutiveDice(dice: number[], length: number): number[] {
    const uniqueValues = [...new Set(dice)].sort((a, b) => a - b)
    
    for (let i = 0; i <= uniqueValues.length - length; i++) {
      let consecutive = true
      for (let j = 1; j < length; j++) {
        if (uniqueValues[i + j] !== uniqueValues[i] + j) {
          consecutive = false
          break
        }
      }
      
      if (consecutive) {
        // Return indices of dice that match these values
        const targetValues = uniqueValues.slice(i, i + length)
        const indices: number[] = []
        dice.forEach((value, index) => {
          if (targetValues.includes(value)) {
            indices.push(index)
          }
        })
        return indices.slice(0, length)
      }
    }
    
    return []
  }

  /**
   * Helper: Calculate upper section sum
   */
  private static getUpperSectionSum(scorecard: YahtzeeScorecard): number {
    return (scorecard.ones || 0) +
           (scorecard.twos || 0) +
           (scorecard.threes || 0) +
           (scorecard.fours || 0) +
           (scorecard.fives || 0) +
           (scorecard.sixes || 0)
  }

  /**
   * Helper: Check if dice form a large straight
   */
  private static isLargeStraight(dice: number[]): boolean {
    const uniqueSorted = [...new Set(dice)].sort((a, b) => a - b)
    if (uniqueSorted.length !== 5) return false
    
    return uniqueSorted.every((val, idx) => {
      if (idx === 0) return true
      return val === uniqueSorted[idx - 1] + 1
    })
  }

  /**
   * Execute a full bot turn (for testing purposes)
   */
  static async executeTurn(
    initialDice: number[],
    scorecard: YahtzeeScorecard,
    onRoll?: (dice: number[], held: boolean[]) => void
  ): Promise<{ category: YahtzeeCategory; finalDice: number[] }> {
    let dice = [...initialDice]
    let held = Array(5).fill(false)
    let rollsLeft = 3

    // Roll up to 3 times
    for (let roll = 0; roll < 3; roll++) {
      rollsLeft = 3 - roll

      if (roll > 0) {
        // Decide which dice to hold
        const holdIndices = this.decideDiceToHold(dice, held, rollsLeft, scorecard)
        held = Array(5).fill(false)
        holdIndices.forEach(i => held[i] = true)

        // Roll unheld dice
        dice = dice.map((value, index) => held[index] ? value : Math.floor(Math.random() * 6) + 1)
      }

      if (onRoll) {
        onRoll(dice, held)
      }

      // On last roll or if we have a perfect hand, stop
      if (rollsLeft === 1 || this.shouldStopRolling(dice, scorecard)) {
        break
      }
    }

    // Select best category
    const category = this.selectCategory(dice, scorecard)

    return { category, finalDice: dice }
  }

  /**
   * Decide if bot should stop rolling and score now
   */
  private static shouldStopRolling(dice: number[], scorecard: YahtzeeScorecard): boolean {
    const diceCounts = this.countDice(dice)
    
    // Stop if we have Yahtzee
    for (const indices of diceCounts.values()) {
      if (indices.length === 5) return true
    }

    // Stop if we have large straight
    const uniqueValues = Array.from(diceCounts.keys()).sort((a, b) => a - b)
    if (this.hasConsecutive(uniqueValues, 5)) return true

    // Stop if we have full house
    let hasThree = false
    let hasTwo = false
    for (const indices of diceCounts.values()) {
      if (indices.length === 3) hasThree = true
      if (indices.length === 2) hasTwo = true
    }
    if (hasThree && hasTwo) return true

    return false
  }
}
