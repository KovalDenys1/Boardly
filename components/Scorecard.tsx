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
  isLoading = false
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
        className={`group relative w-full px-4 py-2.5 flex items-center justify-between rounded-xl transition-all ${styles.container} ${isLoading ? 'opacity-50 cursor-wait' : ''} focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none shadow-md hover:shadow-lg`}
      >
        <span className="font-semibold text-sm flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base shrink-0">{categoryLabels[category].split(' ')[0]}</span>
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
              <span className="text-sm opacity-75">{styles.icon}</span>
              <span className={`${styles.score} text-lg font-bold`}>{filledScore}</span>
            </>
          ) : state !== 'disabled' && potentialScore !== null ? (
            <>
              <span className={`${styles.score} group-hover:scale-110 transition-all text-lg font-bold`}>
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
      {/* Header - only if view-only */}
      {!isCurrentPlayer && (
        <div className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 border-b border-yellow-300 dark:border-yellow-600">
          <p className="text-xs text-yellow-800 dark:text-yellow-300 font-medium flex items-center gap-2">
            <span className="text-sm">👀</span>
            View Only
          </p>
        </div>
      )}

      {/* TWO COLUMN LAYOUT - ADAPTIVE WITH SCROLL */}
      <div className="flex-1 overflow-hidden p-4 sm:p-5">
        <div className="h-full grid grid-cols-2 gap-3 sm:gap-5">
          {/* LEFT COLUMN: Upper Section */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <span className="text-lg sm:text-xl">🎯</span>
              <h3 className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
                Upper Section
              </h3>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Categories with scroll */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-0 flex flex-col justify-evenly">
                {upperSection.map(renderCategory)}
              </div>
              
              {/* Subtotal & Bonus - at bottom */}
              <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2 flex-shrink-0">
                <div className="flex justify-between items-center px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <span className="font-semibold text-xs text-gray-700 dark:text-gray-300">Subtotal</span>
                  <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">{upperTotal}</span>
                </div>
                
                <div className="p-2 sm:p-3 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-xl border-2 border-yellow-300 dark:border-yellow-700 h-[72px]">
                  <div className="flex justify-between items-center mb-1 sm:mb-2">
                    <span className="font-bold text-xs sm:text-sm flex items-center gap-1 sm:gap-1.5 text-yellow-800 dark:text-yellow-300">
                      <span className="text-sm sm:text-base">🎁</span>
                      Bonus {upperTotal >= 63 && <span className="text-green-500">✓</span>}
                    </span>
                    <span className={`font-bold text-sm sm:text-base ${bonus > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {bonus > 0 ? `+${bonus}` : `${upperTotal}/63`}
                    </span>
                  </div>
                  {bonus === 0 && (
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2 overflow-hidden shadow-inner">
                      <div 
                        className={`h-1.5 sm:h-2 rounded-full transition-all duration-500 shadow-sm ${
                          upperTotal >= 50 ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 
                          upperTotal >= 30 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' : 
                          'bg-gradient-to-r from-blue-400 to-cyan-500'
                        }`}
                        style={{ width: `${Math.min(100, (upperTotal / 63) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Lower Section */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <span className="text-lg sm:text-xl">🎲</span>
              <h3 className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400">
                Lower Section
              </h3>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Categories with scroll */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-0 flex flex-col justify-evenly">
                {lowerSection.map(renderCategory)}
              </div>
              
              {/* Empty space to align with Bonus */}
              <div className="mt-2 sm:mt-3 flex-shrink-0 h-[72px]">
                {/* Empty space matching Bonus height */}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Total at Bottom */}
      <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white px-4 sm:px-5 py-2.5 sm:py-3 shadow-lg">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xl sm:text-2xl">🏆</span>
            <span className="text-sm sm:text-base font-bold">Grand Total</span>
          </div>
          <span className="text-2xl sm:text-3xl font-bold tracking-tight">{total}</span>
        </div>
      </div>
    </div>
  )
})

export default Scorecard
