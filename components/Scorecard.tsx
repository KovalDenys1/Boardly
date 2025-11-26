'use client'

import React from 'react'
import { YahtzeeScorecard, YahtzeeCategory, calculateScore } from '@/lib/yahtzee'

interface ScorecardProps {
  scorecard: YahtzeeScorecard
  currentDice: number[]
  onSelectCategory: (category: YahtzeeCategory) => void
  canSelectCategory: boolean
  isCurrentPlayer: boolean
  isLoading?: boolean
}

const categoryLabels: Record<YahtzeeCategory, string> = {
  ones: '⚀ Ones',
  twos: '⚁ Twos',
  threes: '⚂ Threes',
  fours: '⚃ Fours',
  fives: '⚄ Fives',
  sixes: '⚅ Sixes',
  threeOfKind: '🎲 Three of a Kind',
  fourOfKind: '🎲🎲 Four of a Kind',
  fullHouse: '🏠 Full House',
  smallStraight: '📈 Small Straight',
  largeStraight: '📊 Large Straight',
  yahtzee: '🎯 YAHTZEE!',
  chance: '🎲 Chance',
}

const categoryDescriptions: Record<YahtzeeCategory, string> = {
  ones: 'Sum of all ones',
  twos: 'Sum of all twos',
  threes: 'Sum of all threes',
  fours: 'Sum of all fours',
  fives: 'Sum of all fives',
  sixes: 'Sum of all sixes',
  threeOfKind: 'Sum of all dice (3+ same)',
  fourOfKind: 'Sum of all dice (4+ same)',
  fullHouse: '25 points',
  smallStraight: '30 points',
  largeStraight: '40 points',
  yahtzee: '50 points!',
  chance: 'Sum of all dice',
}

// Category state classification for enhanced visual feedback
type CategoryState = 'high-value' | 'low-value' | 'sacrifice' | 'filled' | 'disabled'

interface CategoryStateInfo {
  state: CategoryState
  potentialScore: number | null
}

function getCategoryState(
  category: YahtzeeCategory,
  scorecard: YahtzeeScorecard,
  currentDice: number[],
  canSelectCategory: boolean,
  isCurrentPlayer: boolean
): CategoryStateInfo {
  const isFilled = scorecard[category] !== undefined
  
  if (isFilled) {
    return { state: 'filled', potentialScore: null }
  }
  
  if (!canSelectCategory || !isCurrentPlayer) {
    return { state: 'disabled', potentialScore: null }
  }
  
  const potentialScore = currentDice.length > 0 
    ? calculateScore(currentDice, category) 
    : null
  
  if (potentialScore === null) {
    return { state: 'disabled', potentialScore: null }
  }
  
  if (potentialScore === 0) {
    return { state: 'sacrifice', potentialScore: 0 }
  }
  
  if (potentialScore >= 20) {
    return { state: 'high-value', potentialScore }
  }
  
  return { state: 'low-value', potentialScore }
}

// Styling configuration for each category state
const stateStyles: Record<CategoryState, { container: string; score: string; icon: string | null }> = {
  'high-value': {
    container: 'border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 cursor-pointer shadow-md transition-all duration-200',
    score: 'text-green-600 dark:text-green-400 font-bold text-xl',
    icon: '⭐'
  },
  'low-value': {
    container: 'border-2 border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 cursor-pointer transition-all duration-200',
    score: 'text-blue-600 dark:text-blue-400 font-semibold text-lg',
    icon: null
  },
  'sacrifice': {
    container: 'border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/10 hover:bg-gray-100 dark:hover:bg-gray-900/20 cursor-pointer transition-all duration-200',
    score: 'text-gray-600 dark:text-gray-400 font-semibold text-lg',
    icon: null
  },
  'filled': {
    container: 'bg-gray-100 dark:bg-gray-800 cursor-default opacity-80',
    score: 'text-green-600 dark:text-green-400 font-bold text-lg',
    icon: '✓'
  },
  'disabled': {
    container: 'bg-gray-50 dark:bg-gray-900 cursor-not-allowed opacity-40',
    score: 'text-gray-400',
    icon: null
  }
}

const Scorecard = React.memo(function Scorecard({ 
  scorecard, 
  currentDice, 
  onSelectCategory, 
  canSelectCategory,
  isCurrentPlayer,
  isLoading = false
}: ScorecardProps) {
  const upperSection: YahtzeeCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
  const lowerSection: YahtzeeCategory[] = [
    'threeOfKind',
    'fourOfKind',
    'fullHouse',
    'smallStraight',
    'largeStraight',
    'yahtzee',
    'chance',
  ]

  const renderCategory = (category: YahtzeeCategory) => {
    const { state, potentialScore } = getCategoryState(
      category,
      scorecard,
      currentDice,
      canSelectCategory,
      isCurrentPlayer
    )
    
    const styles = stateStyles[state]
    const filledScore = scorecard[category]
    
    return (
      <button
        key={category}
        onClick={() => (state !== 'filled' && state !== 'disabled') && !isLoading && onSelectCategory(category)}
        disabled={state === 'filled' || state === 'disabled' || isLoading}
        aria-label={`${categoryLabels[category]}: ${state === 'filled' ? `Scored ${filledScore} points` : potentialScore !== null ? `Score ${potentialScore} points` : 'Not available'}`}
        aria-disabled={state === 'filled' || state === 'disabled'}
        className={`scorecard-row group relative ${styles.container} ${isLoading ? 'opacity-50 cursor-wait' : ''} focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-medium text-sm md:text-base shrink-0">
            {categoryLabels[category]}
          </span>
          {state !== 'filled' && (
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden lg:inline truncate">
              {categoryDescriptions[category]}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isLoading ? (
            <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : state === 'filled' ? (
            <>
              <span className={styles.score}>{filledScore}</span>
              <span className="text-lg">{styles.icon}</span>
            </>
          ) : state !== 'disabled' && potentialScore !== null ? (
            <>
              {styles.icon && <span className="text-xl animate-pulse">{styles.icon}</span>}
              <span className={`${styles.score} group-hover:scale-110 transition-transform`}>
                {state === 'sacrifice' ? '0' : `+${potentialScore}`}
              </span>
              {category === 'yahtzee' && potentialScore === 50 && (
                <span className="text-xl animate-bounce">🎯</span>
              )}
            </>
          ) : (
            <span className={styles.score}>—</span>
          )}
        </div>
      </button>
    )
  }

  const upperTotal = upperSection.reduce((sum, cat) => sum + (scorecard[cat] ?? 0), 0)
  const bonus = upperTotal >= 63 ? 35 : 0
  const lowerTotal = lowerSection.reduce((sum, cat) => sum + (scorecard[cat] ?? 0), 0)
  const total = upperTotal + bonus + lowerTotal

  return (
    <div className={`card animate-fade-in ${
      !isCurrentPlayer ? 'opacity-90' : ''
    }`}>
      {/* Viewing Overlay for Other Players */}
      {!isCurrentPlayer && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-600 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👀</span>
            <div>
              <p className="font-bold text-yellow-700 dark:text-yellow-300">View Only Mode</p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                You are viewing another player's scorecard. Switch to yours to make selections.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upper Section */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2 text-blue-600 dark:text-blue-400">
          Upper Section
        </h3>
        <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {upperSection.map(renderCategory)}
          <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 border-t-2 border-gray-200 dark:border-gray-600">
            <span className="font-semibold">Subtotal</span>
            <span className="font-bold">{upperTotal}</span>
          </div>
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold">
                Bonus {upperTotal >= 63 ? '✓' : ''}
              </span>
              <span className={`font-bold ${bonus > 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
                {bonus > 0 ? `+${bonus}` : `${upperTotal}/63`}
              </span>
            </div>
            {bonus === 0 && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    upperTotal >= 50 ? 'bg-green-500' : upperTotal >= 30 ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, (upperTotal / 63) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lower Section */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2 text-purple-600 dark:text-purple-400">
          Lower Section
        </h3>
        <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {lowerSection.map(renderCategory)}
        </div>
      </div>

      {/* Total */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-lg shadow-lg">
        <div className="flex justify-between items-center">
          <span className="text-xl font-bold">🏆 Total Score</span>
          <span className="text-3xl font-bold">{total}</span>
        </div>
      </div>
    </div>
  )
})

export default Scorecard
