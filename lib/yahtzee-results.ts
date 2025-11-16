import { YahtzeeScorecard, YahtzeeCategory } from './yahtzee'

export interface PlayerResults {
  playerId: string
  playerName: string
  totalScore: number
  upperSectionScore: number
  lowerSectionScore: number
  bonusAchieved: boolean
  bonusPoints: number
  achievements: Achievement[]
  rank: number
}

export interface Achievement {
  type: 'yahtzee' | 'large-straight' | 'small-straight' | 'full-house' | 'high-score' | 'perfect-upper'
  label: string
  icon: string
  score?: number
}

/**
 * Calculate upper and lower section scores with bonus
 */
function calculateSectionScores(scorecard: YahtzeeScorecard): {
  upper: number
  lower: number
  bonus: number
} {
  // Upper section: ones through sixes
  const upper = (
    (scorecard.ones || 0) +
    (scorecard.twos || 0) +
    (scorecard.threes || 0) +
    (scorecard.fours || 0) +
    (scorecard.fives || 0) +
    (scorecard.sixes || 0)
  )
  
  // Bonus: 35 points if upper section >= 63
  const bonus = upper >= 63 ? 35 : 0
  
  // Lower section: three of kind through chance
  const lower = (
    (scorecard.threeOfKind || 0) +
    (scorecard.fourOfKind || 0) +
    (scorecard.fullHouse || 0) +
    (scorecard.smallStraight || 0) +
    (scorecard.largeStraight || 0) +
    (scorecard.yahtzee || 0) +
    (scorecard.chance || 0)
  )
  
  return { upper, lower, bonus }
}

/**
 * Detect achievements from scorecard
 */
function detectAchievements(scorecard: YahtzeeScorecard, totalScore: number, upperScore: number): Achievement[] {
  const achievements: Achievement[] = []
  
  // Yahtzee achievement (50 points)
  if (scorecard.yahtzee === 50) {
    achievements.push({
      type: 'yahtzee',
      label: 'Yahtzee!',
      icon: '🎯',
      score: 50
    })
  }
  
  // Large Straight achievement (40 points)
  if (scorecard.largeStraight === 40) {
    achievements.push({
      type: 'large-straight',
      label: 'Large Straight',
      icon: '📊',
      score: 40
    })
  }
  
  // Small Straight achievement (30 points)
  if (scorecard.smallStraight === 30) {
    achievements.push({
      type: 'small-straight',
      label: 'Small Straight',
      icon: '📈',
      score: 30
    })
  }
  
  // Full House achievement (25 points)
  if (scorecard.fullHouse === 25) {
    achievements.push({
      type: 'full-house',
      label: 'Full House',
      icon: '🏠',
      score: 25
    })
  }
  
  // Upper section bonus achievement (achieved 63+)
  if (upperScore >= 63) {
    achievements.push({
      type: 'perfect-upper',
      label: 'Upper Bonus',
      icon: '💎',
      score: 35
    })
  }
  
  // High score achievement (300+)
  if (totalScore >= 300) {
    achievements.push({
      type: 'high-score',
      label: 'High Score',
      icon: '⭐',
      score: totalScore
    })
  }
  
  return achievements
}

/**
 * Analyze game results and prepare data for display
 */
export function analyzeResults(
  players: Array<{ id: string; name: string; score: number }>,
  getScorecard: (id: string) => YahtzeeScorecard | null
): PlayerResults[] {
  const results: PlayerResults[] = []
  
  // Calculate detailed stats for each player
  for (const player of players) {
    const scorecard = getScorecard(player.id)
    
    if (!scorecard) {
      // Fallback for missing scorecard (shouldn't happen in finished game)
      results.push({
        playerId: player.id,
        playerName: player.name,
        totalScore: player.score || 0,
        upperSectionScore: 0,
        lowerSectionScore: 0,
        bonusAchieved: false,
        bonusPoints: 0,
        achievements: [],
        rank: 0 // Will be set after sorting
      })
      continue
    }
    
    const sections = calculateSectionScores(scorecard)
    const achievements = detectAchievements(scorecard, player.score || 0, sections.upper)
    
    results.push({
      playerId: player.id,
      playerName: player.name,
      totalScore: player.score || 0,
      upperSectionScore: sections.upper,
      lowerSectionScore: sections.lower,
      bonusAchieved: sections.bonus > 0,
      bonusPoints: sections.bonus,
      achievements,
      rank: 0 // Will be set after sorting
    })
  }
  
  // Sort by total score (descending)
  results.sort((a, b) => b.totalScore - a.totalScore)
  
  // Assign ranks
  results.forEach((result, index) => {
    result.rank = index
  })
  
  return results
}
