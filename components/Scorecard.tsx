'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import { YahtzeeScorecard, YahtzeeCategory, calculateScore } from '@/lib/yahtzee'

interface ScorecardProps {
  scorecard: YahtzeeScorecard
  currentDice: number[]
  onSelectCategory: (category: YahtzeeCategory) => void
  canSelectCategory: boolean
  isCurrentPlayer: boolean
  isLoading?: boolean
  playerName?: string
  onBackToMyCards?: () => void
  showBackButton?: boolean
  onGoToCurrentTurn?: () => void
  showCurrentTurnButton?: boolean
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
    container: 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-900/30 dark:hover:to-emerald-900/30 border-l-4 border-green-500 cursor-pointer transform hover:scale-[1.02] transition-all duration-200',
    score: 'text-green-600 dark:text-green-400 font-bold text-base',
    icon: '⭐'
  },
  'low-value': {
    container: 'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/10 dark:to-cyan-900/10 hover:from-blue-100 hover:to-cyan-100 dark:hover:from-blue-900/20 dark:hover:to-cyan-900/20 border-l-4 border-blue-400 cursor-pointer transform hover:scale-[1.02] transition-all duration-200',
    score: 'text-blue-600 dark:text-blue-400 font-semibold',
    icon: null
  },
  'sacrifice': {
    container: 'bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/10 dark:to-slate-900/10 hover:from-gray-100 hover:to-slate-100 dark:hover:from-gray-900/20 dark:hover:to-slate-900/20 border-l-4 border-gray-400 cursor-pointer transform hover:scale-[1.02] transition-all duration-200',
    score: 'text-gray-600 dark:text-gray-400 font-semibold',
    icon: null
  },
  'filled': {
    container: 'bg-gradient-to-r from-gray-100 to-slate-100 dark:from-gray-800 dark:to-slate-800 border-l-4 border-gray-300 dark:border-gray-600 cursor-default opacity-80',
    score: 'text-green-600 dark:text-green-400 font-bold',
    icon: '✓'
  },
  'disabled': {
    container: 'bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed opacity-40',
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
  isLoading = false,
  playerName,
  onBackToMyCards,
  showBackButton = false,
  onGoToCurrentTurn,
  showCurrentTurnButton = false
}: ScorecardProps) {
  const { t } = useTranslation()
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
        className={`group relative w-full px-3 py-1.5 flex items-center justify-between rounded-xl transition-all ${styles.container} ${isLoading ? 'opacity-50 cursor-wait' : ''} focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none shadow-md hover:shadow-lg`}
      >
        <span className="font-semibold text-xs flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-sm shrink-0">{categoryLabels[category].split(' ')[0]}</span>
          <span className="truncate">{categoryLabels[category].split(' ').slice(1).join(' ')}</span>
        </span>
        
        <div className="flex items-center gap-2.5 shrink-0 ml-3">
          {isLoading ? (
            <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : state === 'filled' ? (
            <>
              <span className="text-xs opacity-75">{styles.icon}</span>
              <span className={`${styles.score} text-base font-bold`}>{filledScore}</span>
            </>
          ) : state !== 'disabled' && potentialScore !== null ? (
            <>
              <span className={`${styles.score} group-hover:scale-110 transition-all text-base font-bold`}>
                +{potentialScore}
              </span>
              {category === 'yahtzee' && potentialScore === 50 && (
                <span className="text-xl animate-bounce">🎯</span>
              )}
            </>
          ) : (
            <span className={`${styles.score} text-base opacity-50`}>—</span>
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
    <div className={`h-full flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${
      !isCurrentPlayer ? 'opacity-90' : ''
    }`}>
      {/* TWO COLUMN LAYOUT - ADAPTIVE WITH SCROLL */}
      <div className="flex-1 overflow-hidden p-3 sm:p-4">
        <div className="h-full grid grid-cols-2 gap-2 sm:gap-4">
          {/* LEFT COLUMN: Upper Section */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5 flex-shrink-0 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg">🎯</span>
                <h3 className="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400">
                  Upper Section
                </h3>
              </div>
              {/* Bonus inline */}
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-300 dark:border-yellow-700">
                <span className="text-[10px]">🎁</span>
                <span className="text-[9px] font-semibold text-yellow-800 dark:text-yellow-300">
                  {bonus > 0 ? `+${bonus}` : `${upperTotal}/63`}
                </span>
                {bonus > 0 && <span className="text-xs text-green-500">✓</span>}
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Categories - full height */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-0 flex flex-col justify-evenly space-y-1">
                {upperSection.map(renderCategory)}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Lower Section */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5 flex-shrink-0 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg">🎲</span>
                <h3 className="text-[10px] sm:text-xs font-bold text-purple-600 dark:text-purple-400">
                  Lower Section
                </h3>
              </div>
              {/* Back to My Cards button */}
              {showBackButton && onBackToMyCards && (
                <button
                  onClick={onBackToMyCards}
                  className="text-[9px] px-2 py-0.5 bg-purple-500 hover:bg-purple-600 text-white rounded-md transition-colors font-semibold"
                >
                  ← My Cards
                </button>
              )}
              {/* Current Turn button */}
              {showCurrentTurnButton && onGoToCurrentTurn && (
                <button
                  onClick={onGoToCurrentTurn}
                  className="text-[9px] px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors font-semibold"
                >
                  Current Turn →
                </button>
              )}
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Categories - full height */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-0 flex flex-col justify-evenly space-y-1">
                {lowerSection.map(renderCategory)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export default Scorecard
