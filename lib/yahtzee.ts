// Yahtzee scoring categories
export type YahtzeeCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeOfKind' | 'fourOfKind' | 'fullHouse' | 'smallStraight'
  | 'largeStraight' | 'yahtzee' | 'chance'

export interface YahtzeeScorecard {
  ones?: number
  twos?: number
  threes?: number
  fours?: number
  fives?: number
  sixes?: number
  threeOfKind?: number
  fourOfKind?: number
  fullHouse?: number
  smallStraight?: number
  largeStraight?: number
  yahtzee?: number
  chance?: number
}

export interface YahtzeeGameState {
  round: number
  currentPlayerIndex: number
  dice: number[] // 5 dice values (1-6)
  held: boolean[] // which dice are held
  rollsLeft: number
  scores: YahtzeeScorecard[]
  finished: boolean
}

export function rollDice(count: number = 5): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1)
}

export function calculateScore(dice: number[], category: YahtzeeCategory): number {
  const counts = Array(7).fill(0)
  dice.forEach(die => counts[die]++)
  
  const sortedDice = [...dice].sort((a, b) => a - b)
  
  switch (category) {
    case 'ones': return counts[1] * 1
    case 'twos': return counts[2] * 2
    case 'threes': return counts[3] * 3
    case 'fours': return counts[4] * 4
    case 'fives': return counts[5] * 5
    case 'sixes': return counts[6] * 6
    
    case 'threeOfKind':
      return counts.some(c => c >= 3) ? dice.reduce((a, b) => a + b, 0) : 0
    
    case 'fourOfKind':
      return counts.some(c => c >= 4) ? dice.reduce((a, b) => a + b, 0) : 0
    
    case 'fullHouse': {
      // Full House: 3 of one kind + 2 of another kind = 25 points
      // Note: Yahtzee (5 of a kind) also counts as Full House
      const nonZeroCounts = counts.filter(c => c > 0)
      
      // Check for classic Full House: exactly 2 groups (3 and 2)
      if (nonZeroCounts.length === 2 && nonZeroCounts.includes(3) && nonZeroCounts.includes(2)) {
        return 25
      }
      
      // Check for Yahtzee (5 of a kind) - also valid as Full House
      if (counts.some(c => c === 5)) {
        return 25
      }
      
      return 0
    }
    
    case 'smallStraight': {
      // Small Straight: 4 consecutive dice (1-2-3-4, 2-3-4-5, or 3-4-5-6) = 30 points
      const uniqueSorted = [...new Set(sortedDice)].sort((a, b) => a - b)
      
      // Check each possible small straight
      const possibleStraights = [
        [1, 2, 3, 4],
        [2, 3, 4, 5],
        [3, 4, 5, 6]
      ]
      
      for (const straight of possibleStraights) {
        if (straight.every(num => uniqueSorted.includes(num))) {
          return 30
        }
      }
      
      return 0
    }
    
    case 'largeStraight': {
      // Large Straight: 5 consecutive dice (1-2-3-4-5 or 2-3-4-5-6) = 40 points
      const uniqueSorted = [...new Set(sortedDice)].sort((a, b) => a - b)
      
      // Must have exactly 5 unique values
      if (uniqueSorted.length !== 5) {
        return 0
      }
      
      // Check if they form a consecutive sequence
      const isConsecutive = uniqueSorted.every((val, idx) => {
        if (idx === 0) return true
        return val === uniqueSorted[idx - 1] + 1
      })
      
      return isConsecutive ? 40 : 0
    }
    
    case 'yahtzee':
      return counts.some(c => c === 5) ? 50 : 0
    
    case 'chance':
      return dice.reduce((a, b) => a + b, 0)
    
    default:
      return 0
  }
}

export function calculateTotalScore(scorecard: YahtzeeScorecard): number {
  const upperSection = (scorecard.ones || 0) + (scorecard.twos || 0) + 
    (scorecard.threes || 0) + (scorecard.fours || 0) + 
    (scorecard.fives || 0) + (scorecard.sixes || 0)
  
  const upperBonus = upperSection >= 63 ? 35 : 0
  
  const lowerSection = (scorecard.threeOfKind || 0) + (scorecard.fourOfKind || 0) +
    (scorecard.fullHouse || 0) + (scorecard.smallStraight || 0) +
    (scorecard.largeStraight || 0) + (scorecard.yahtzee || 0) +
    (scorecard.chance || 0)
  
  return upperSection + upperBonus + lowerSection
}

export function isGameFinished(scorecard: YahtzeeScorecard): boolean {
  const categories: YahtzeeCategory[] = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'threeOfKind', 'fourOfKind', 'fullHouse', 'smallStraight',
    'largeStraight', 'yahtzee', 'chance'
  ]
  
  return categories.every(cat => scorecard[cat] !== undefined)
}

// All Yahtzee categories in order
export const ALL_CATEGORIES: YahtzeeCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfKind', 'fourOfKind', 'fullHouse', 'smallStraight',
  'largeStraight', 'yahtzee', 'chance'
]

// Priority order for wasting categories when no points available
const WASTE_PRIORITY: YahtzeeCategory[] = [
  // Upper section first (lowest value first)
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  // Lower section (least valuable first)
  'threeOfKind', 'fourOfKind', 'smallStraight', 'fullHouse',
  'largeStraight', 'chance', 'yahtzee'
]

/**
 * Select the best available category to score when timer runs out
 * Priority:
 * 1. Categories that would score the most points with current dice
 * 2. Upper section categories with 0 points (to minimize penalty)
 * 3. Least valuable lower section categories
 * 
 * Examples:
 * - Dice: [5,5,5,5,5] -> Chooses 'yahtzee' (50 points) if available
 * - Dice: [1,2,3,4,5] -> Chooses 'largeStraight' (40 points) if available
 * - Dice: [1,1,2,3,6] -> Chooses 'ones' (2 points) if available
 * - Dice: [2,3,4,5,6] (no scoring options) -> Chooses 'ones' to waste (0 points)
 */
export function selectBestAvailableCategory(
  dice: number[],
  scorecard: YahtzeeScorecard
): YahtzeeCategory {
  // Get available categories
  const availableCategories = ALL_CATEGORIES.filter(
    cat => scorecard[cat] === undefined
  )
  
  if (availableCategories.length === 0) {
    return 'ones' // Fallback (shouldn't happen)
  }
  
  // Calculate score for each available category
  const categoryScores = availableCategories.map(cat => ({
    category: cat,
    score: calculateScore(dice, cat)
  }))
  
  // Find best scoring category
  const bestScoring = categoryScores.reduce((best, current) => 
    current.score > best.score ? current : best
  )
  
  // If we can score points, choose the best
  if (bestScoring.score > 0) {
    return bestScoring.category
  }
  
  // No points available - waste least valuable category
  return WASTE_PRIORITY.find(cat => availableCategories.includes(cat)) || availableCategories[0]
}
