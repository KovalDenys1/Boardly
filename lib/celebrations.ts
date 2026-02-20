export interface CelebrationEvent {
  type: 'yahtzee' | 'largeStraight' | 'fullHouse' | 'highScore' | 'perfectRoll'
  title: string
  emoji: string
  score: number
  category?: string
}

/**
 * Detect if a dice roll or score deserves a celebration
 */
export function detectCelebration(
  dice: number[],
  category?: string,
  score?: number
): CelebrationEvent | null {
  // Check for specific patterns in dice
  const counts = Array(7).fill(0)
  dice.forEach(die => counts[die]++)

  // Yahtzee - 5 of a kind (most exciting!)
  if (counts.some(c => c === 5)) {
    return {
      type: 'yahtzee',
      title: 'YAHTZEE!',
      emoji: '🎉',
      score: score || 50,
      category,
    }
  }

  // Large Straight - 5 consecutive
  const uniqueSorted = [...new Set(dice)].sort((a, b) => a - b)
  if (uniqueSorted.length === 5) {
    const isConsecutive = uniqueSorted.every((val, idx) => {
      if (idx === 0) return true
      return val === uniqueSorted[idx - 1] + 1
    })
    if (isConsecutive) {
      return {
        type: 'largeStraight',
        title: 'Large Straight!',
        emoji: '📏',
        score: score || 40,
        category,
      }
    }
  }

  // Full House - 3 of one + 2 of another
  const nonZeroCounts = counts.filter(c => c > 0)
  if (
    nonZeroCounts.length === 2 &&
    nonZeroCounts.includes(3) &&
    nonZeroCounts.includes(2)
  ) {
    return {
      type: 'fullHouse',
      title: 'Full House!',
      emoji: '🏠',
      score: score || 25,
      category,
    }
  }

  // High score (only if we have both category and score)
  if (category && score !== undefined && score >= 30) {
    // Don't double-celebrate if we already caught it above
    if (category !== 'yahtzee' && category !== 'largeStraight' && category !== 'fullHouse') {
      return {
        type: 'highScore',
        title: 'Great Score!',
        emoji: '⭐',
        score,
        category,
      }
    }
  }

  return null
}

/**
 * Detect celebration-worthy patterns just from dice (before scoring)
 * Used to show excitement during rolls
 */
export function detectPatternOnRoll(dice: number[]): CelebrationEvent | null {
  const counts = Array(7).fill(0)
  dice.forEach(die => counts[die]++)

  // Yahtzee
  if (counts.some(c => c === 5)) {
    return {
      type: 'yahtzee',
      title: 'YAHTZEE!',
      emoji: '🎉',
      score: 50,
    }
  }

  // Large Straight
  const uniqueSorted = [...new Set(dice)].sort((a, b) => a - b)
  if (uniqueSorted.length === 5) {
    const isConsecutive = uniqueSorted.every((val, idx) => {
      if (idx === 0) return true
      return val === uniqueSorted[idx - 1] + 1
    })
    if (isConsecutive) {
      return {
        type: 'largeStraight',
        title: 'Large Straight!',
        emoji: '📏',
        score: 40,
      }
    }
  }

  // Full House
  const nonZeroCounts = counts.filter(c => c > 0)
  if (
    nonZeroCounts.length === 2 &&
    nonZeroCounts.includes(3) &&
    nonZeroCounts.includes(2)
  ) {
    return {
      type: 'fullHouse',
      title: 'Full House!',
      emoji: '🏠',
      score: 25,
    }
  }

  // Four of a kind (worth noting)
  if (counts.some(c => c === 4)) {
    return {
      type: 'perfectRoll',
      title: 'Four of a Kind!',
      emoji: '🎲',
      score: dice.reduce((a, b) => a + b, 0),
    }
  }

  return null
}

/**
 * Get a friendly display name for a category
 */
export function getCategoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    ones: 'Ones',
    twos: 'Twos',
    threes: 'Threes',
    fours: 'Fours',
    fives: 'Fives',
    sixes: 'Sixes',
    threeOfKind: 'Three of a Kind',
    fourOfKind: 'Four of a Kind',
    fullHouse: 'Full House',
    smallStraight: 'Small Straight',
    largeStraight: 'Large Straight',
    yahtzee: 'Yahtzee',
    chance: 'Chance',
  }
  return names[category] || category
}
