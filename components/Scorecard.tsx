'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
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

const categoryIcons: Record<YahtzeeCategory, string> = {
  ones: '⚀',
  twos: '⚁',
  threes: '⚂',
  fours: '⚃',
  fives: '⚄',
  sixes: '⚅',
  threeOfKind: '🎲',
  fourOfKind: '🎲🎲',
  fullHouse: '🏠',
  onePair: '🎲',
  twoPairs: '🎴',
  smallStraight: '📈',
  largeStraight: '📊',
  yahtzee: '🎯',
  chance: '🎲',
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
    'onePair',
    'twoPairs',
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
      const categoryLabel = t(`yahtzee.categories.${category}`)
      const icon = categoryIcons[category]
    
    return (
      <button
        key={category}
        onClick={() => (state !== 'filled' && state !== 'disabled') && !isLoading && onSelectCategory(category)}
        disabled={state === 'filled' || state === 'disabled' || isLoading}
        aria-label={`${categoryLabel}: ${state === 'filled' ? `Scored ${filledScore} points` : potentialScore !== null ? `Score ${potentialScore} points` : 'Not available'}`}
        aria-disabled={state === 'filled' || state === 'disabled'}
        className={`group relative w-full flex items-center justify-between transition-all ${styles.container} ${isLoading ? 'opacity-50 cursor-wait' : ''} focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none shadow-md hover:shadow-lg`}
        style={{ padding: 'clamp(6px, 0.6vh, 12px) clamp(10px, 1vw, 16px)', borderRadius: 'clamp(10px, 1vw, 16px)' }}
      >
        <span className="font-semibold flex items-center flex-1 min-w-0" style={{ fontSize: 'clamp(11px, 0.85vw, 14px)', gap: 'clamp(4px, 0.4vw, 8px)' }}>
          <span className="shrink-0" style={{ fontSize: 'clamp(12px, 0.95vw, 16px)' }}>{icon}</span>
          <span className="truncate">{categoryLabel}</span>
        </span>
        
        <div className="flex items-center shrink-0" style={{ gap: 'clamp(8px, 0.8vw, 14px)', marginLeft: 'clamp(10px, 1vw, 16px)' }}>
          {isLoading ? (
            <svg className="animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ width: 'clamp(14px, 1.2vw, 20px)', height: 'clamp(14px, 1.2vw, 20px)' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : state === 'filled' ? (
            <>
              <span className="opacity-75" style={{ fontSize: 'clamp(11px, 0.85vw, 14px)' }}>{styles.icon}</span>
              <span className={`${styles.score} font-bold`} style={{ fontSize: 'clamp(14px, 1.1vw, 18px)' }}>{filledScore}</span>
            </>
          ) : state !== 'disabled' && potentialScore !== null ? (
            <>
              <span className={`${styles.score} group-hover:scale-110 transition-all font-bold`} style={{ fontSize: 'clamp(14px, 1.1vw, 18px)' }}>
                +{potentialScore}
              </span>
              {category === 'yahtzee' && potentialScore === 50 && (
                <span className="animate-bounce" style={{ fontSize: 'clamp(16px, 1.3vw, 24px)' }}>🎯</span>
              )}
            </>
          ) : (
            <span className={`${styles.score} opacity-50`} style={{ fontSize: 'clamp(14px, 1.1vw, 18px)' }}>—</span>
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
    <div className={`h-full flex flex-col bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${
      !isCurrentPlayer ? 'opacity-90' : ''
    }`} style={{ borderRadius: 'clamp(12px, 1.2vw, 24px)' }}>
      {/* TWO COLUMN LAYOUT - ADAPTIVE WITH SCROLL - Single column on mobile */}
      <div className="flex-1 overflow-hidden" style={{ padding: 'clamp(10px, 1vw, 20px)' }}>
        <div className="h-full grid grid-cols-1 sm:grid-cols-2 scorecard-columns" style={{ gap: 'clamp(8px, 0.8vw, 20px)' }}>
          {/* LEFT COLUMN: Upper Section */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between flex-shrink-0" style={{ marginBottom: 'clamp(6px, 0.6vh, 10px)', gap: 'clamp(6px, 0.6vw, 12px)' }}>
              <div className="flex items-center" style={{ gap: 'clamp(4px, 0.4vw, 8px)' }}>
                <span style={{ fontSize: 'clamp(14px, 1.1vw, 20px)' }}>🎯</span>
                <h3 className="font-bold text-blue-600 dark:text-blue-400" style={{ fontSize: 'clamp(10px, 0.8vw, 13px)' }}>
                  {t('yahtzee.categories.upperSection')}
                </h3>
              </div>
              {/* Bonus inline */}
              <div className="flex items-center bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-300 dark:border-yellow-700" style={{ gap: 'clamp(3px, 0.3vw, 6px)', padding: 'clamp(3px, 0.3vh, 6px) clamp(5px, 0.5vw, 9px)' }}>
                <span style={{ fontSize: 'clamp(9px, 0.7vw, 12px)' }}>🎁</span>
                <span className="font-semibold text-yellow-800 dark:text-yellow-300" style={{ fontSize: 'clamp(9px, 0.7vw, 11px)' }}>
                  {bonus > 0 ? `+${bonus}` : `${upperTotal}/63`}
                </span>
                {bonus > 0 && <span className="text-green-500" style={{ fontSize: 'clamp(10px, 0.8vw, 14px)' }}>✓</span>}
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Categories - full height */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-0 flex flex-col justify-evenly" style={{ gap: 'clamp(4px, 0.4vh, 8px)' }}>
                {upperSection.map(renderCategory)}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Lower Section */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between flex-shrink-0" style={{ marginBottom: 'clamp(6px, 0.6vh, 10px)', gap: 'clamp(6px, 0.6vw, 12px)' }}>
              <div className="flex items-center" style={{ gap: 'clamp(4px, 0.4vw, 8px)' }}>
                <span style={{ fontSize: 'clamp(14px, 1.1vw, 20px)' }}>🎲</span>
                <h3 className="font-bold text-purple-600 dark:text-purple-400" style={{ fontSize: 'clamp(10px, 0.8vw, 13px)' }}>
                  {t('yahtzee.categories.lowerSection')}
                </h3>
              </div>
              {/* Back to My Cards button */}
              {showBackButton && onBackToMyCards && (
                <button
                  onClick={onBackToMyCards}
                  className="bg-purple-500 hover:bg-purple-600 text-white rounded-md transition-colors font-semibold"
                  style={{ fontSize: 'clamp(9px, 0.7vw, 11px)', padding: 'clamp(3px, 0.3vh, 6px) clamp(6px, 0.6vw, 10px)' }}
                >
                  ← {t('yahtzee.actions.myCards')}
                </button>
              )}
              {/* Current Turn button */}
              {showCurrentTurnButton && onGoToCurrentTurn && (
                <button
                  onClick={onGoToCurrentTurn}
                  className="bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors font-semibold"
                  style={{ fontSize: 'clamp(9px, 0.7vw, 11px)', padding: 'clamp(3px, 0.3vh, 6px) clamp(6px, 0.6vw, 10px)' }}
                >
                  {t('yahtzee.actions.currentTurn')} →
                </button>
              )}
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              {/* Categories - full height */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-0 flex flex-col justify-evenly" style={{ gap: 'clamp(4px, 0.4vh, 8px)' }}>
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
