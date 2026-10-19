import type { IconName } from '@/components/icons/names'
import type { GameOutcome } from '@/components/game-chrome/GameStatusBanner'

import { viewerOutcome } from './game-outcome'
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
  /** 0 is first; a shared total shares its rank, and the next one skips (0, 0, 2). */
  rank: number
}

export interface Achievement {
  type: 'yahtzee' | 'large-straight' | 'small-straight' | 'full-house' | 'high-score' | 'perfect-upper'
  label: string
  icon: IconName
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
  
  // Lower section: pair categories through chance
  const lower = (
    (scorecard.onePair || 0) +
    (scorecard.twoPairs || 0) +
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
      icon: 'target',
      score: 50
    })
  }
  
  // Large Straight achievement (40 points)
  if (scorecard.largeStraight === 40) {
    achievements.push({
      type: 'large-straight',
      label: 'Large Straight',
      icon: 'chart',
      score: 40
    })
  }
  
  // Small Straight achievement (30 points)
  if (scorecard.smallStraight === 30) {
    achievements.push({
      type: 'small-straight',
      label: 'Small Straight',
      icon: 'rocket',
      score: 30
    })
  }
  
  // Full House achievement (25 points)
  if (scorecard.fullHouse === 25) {
    achievements.push({
      type: 'full-house',
      label: 'Full House',
      icon: 'home',
      score: 25
    })
  }
  
  // Upper section bonus achievement (achieved 63+)
  if (upperScore >= 63) {
    achievements.push({
      type: 'perfect-upper',
      label: 'Upper Bonus',
      icon: 'gem',
      score: 35
    })
  }
  
  // High score achievement (300+)
  if (totalScore >= 300) {
    achievements.push({
      type: 'high-score',
      label: 'High Score',
      icon: 'star',
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
  getScorecard: (id: string) => YahtzeeScorecard
): PlayerResults[] {
  const results: PlayerResults[] = []
  
  // Calculate detailed stats for each player
  for (const player of players) {
    const scorecard = getScorecard(player.id)
    
    // Check if scorecard is empty (shouldn't happen in finished game)
    const isEmptyScorecard = Object.keys(scorecard).length === 0
    
    if (isEmptyScorecard) {
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

  for (const result of results) {
    result.rank = results.filter((other) => other.totalScore > result.totalScore).length
  }

  return results
}

/** The players sharing first place: more than one is a tie. */
export function leadersOf(results: PlayerResults[]): PlayerResults[] {
  return results.filter((result) => result.rank === 0)
}

/** The finished game as the viewer's seat sees it: a shared top total is a draw for those on it and a loss below. */
export function yahtzeeViewerOutcome(
  results: PlayerResults[],
  viewerId: string | null | undefined,
  { isSpectator, isSeated }: { isSpectator: boolean; isSeated: boolean },
): GameOutcome | undefined {
  const leaders = leadersOf(results)
  return viewerOutcome({
    isFinished: results.length > 0,
    isDraw: leaders.length > 1,
    isSpectator,
    isSeated,
    isViewerWinner: leaders.length === 1 ? leaders[0].playerId === viewerId : null,
    isViewerAtTop: leaders.some((leader) => leader.playerId === viewerId),
  })
}
