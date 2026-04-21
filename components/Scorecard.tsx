'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { YahtzeeScorecard, YahtzeeCategory, calculateScore } from '@/lib/yahtzee'
import { sounds } from '@/lib/sounds'

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
  onePair: '🎭',
  twoPairs: '🃏',
  threeOfKind: '🔺',
  fourOfKind: '💎',
  fullHouse: '🏠',
  smallStraight: '📈',
  largeStraight: '🚀',
  yahtzee: '🎯',
  chance: '🌀',
}

type CategoryState = 'high-value' | 'low-value' | 'sacrifice' | 'filled' | 'disabled'

function getCategoryState(
  category: YahtzeeCategory,
  scorecard: YahtzeeScorecard,
  currentDice: number[],
  canSelectCategory: boolean,
  isCurrentPlayer: boolean
): { state: CategoryState; potentialScore: number | null } {
  if (scorecard[category] !== undefined) return { state: 'filled', potentialScore: null }
  if (!canSelectCategory || !isCurrentPlayer) return { state: 'disabled', potentialScore: null }

  const potentialScore = currentDice.length > 0 ? calculateScore(currentDice, category) : null
  if (potentialScore === null) return { state: 'disabled', potentialScore: null }
  if (potentialScore === 0) return { state: 'sacrifice', potentialScore: 0 }
  if (potentialScore >= 20) return { state: 'high-value', potentialScore }
  return { state: 'low-value', potentialScore }
}

const rowBase =
  'group w-full flex items-center gap-2 px-2.5 sm:px-3 rounded-xl border-l-[3px] min-h-[44px] sm:min-h-[40px] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none'

const rowVariants: Record<CategoryState, string> = {
  'high-value':
    'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 hover:shadow-md hover:shadow-emerald-100 dark:hover:shadow-emerald-950 cursor-pointer',
  'low-value':
    'border-blue-400 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:shadow-sm cursor-pointer',
  sacrifice:
    'border-amber-400 bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 hover:shadow-sm cursor-pointer',
  filled:
    'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 cursor-default',
  disabled:
    'border-transparent bg-transparent opacity-30 cursor-not-allowed',
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
  showCurrentTurnButton = false,
}: ScorecardProps) {
  const { t } = useTranslation()

  const upperSection: YahtzeeCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
  const lowerSection: YahtzeeCategory[] = [
    'onePair',
    'twoPairs',
    'threeOfKind',
    'fourOfKind',
    'fullHouse',
    'smallStraight',
    'largeStraight',
    'yahtzee',
    'chance',
  ]

  const upperTotal = upperSection.reduce((sum, cat) => sum + (scorecard[cat] ?? 0), 0)
  const bonus = upperTotal >= 63 ? 35 : 0
  const lowerTotal = lowerSection.reduce((sum, cat) => sum + (scorecard[cat] ?? 0), 0)
  const total = upperTotal + bonus + lowerTotal
  const bonusProgress = Math.min(100, (upperTotal / 63) * 100)

  const renderCategory = (category: YahtzeeCategory) => {
    const { state, potentialScore } = getCategoryState(
      category,
      scorecard,
      currentDice,
      canSelectCategory,
      isCurrentPlayer
    )
    const filledScore = scorecard[category]
    const label = t(`yahtzee.categories.${category}`)
    const icon = categoryIcons[category]
    const isYahtzeePerfect = category === 'yahtzee' && potentialScore === 50

    const handleClick = () => {
      if (state === 'filled' || state === 'disabled' || isLoading) return
      sounds.play('click', { force: true })
      onSelectCategory(category)
    }

    return (
      <button
        key={category}
        onClick={handleClick}
        disabled={state === 'filled' || state === 'disabled' || isLoading}
        aria-label={`${label}: ${
          state === 'filled'
            ? `${t('yahtzee.ui.scored')} ${filledScore}`
            : potentialScore !== null
            ? `+${potentialScore}`
            : t('yahtzee.ui.notAvailable')
        }`}
        className={`${rowBase} ${rowVariants[state]} ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
      >
        {/* Icon */}
        <span className="text-base sm:text-lg shrink-0 leading-none">{icon}</span>

        {/* Label */}
        <span className="flex-1 text-left text-xs sm:text-[11.5px] font-medium text-gray-700 dark:text-gray-200 truncate leading-tight">
          {label}
        </span>

        {/* Score indicator */}
        <div className="shrink-0 ml-1 flex items-center">
          {isLoading ? (
            <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
          ) : state === 'filled' ? (
            <span className="flex items-center gap-1">
              <span className="text-[10px] text-emerald-500 font-bold">✓</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 min-w-[1.5rem] text-right">
                {filledScore}
              </span>
            </span>
          ) : state === 'high-value' ? (
            <span
              className={`flex items-center gap-0.5 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm transition-shadow group-hover:shadow-md group-hover:shadow-emerald-200 dark:group-hover:shadow-emerald-900 ${
                isYahtzeePerfect ? 'animate-pulse bg-gradient-to-r from-emerald-500 to-cyan-500' : ''
              }`}
            >
              {isYahtzeePerfect && <span className="mr-0.5">🎯</span>}
              +{potentialScore}
            </span>
          ) : state === 'low-value' ? (
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 min-w-[1.5rem] text-right">
              +{potentialScore}
            </span>
          ) : state === 'sacrifice' ? (
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded-md">
              0
            </span>
          ) : (
            <span className="text-gray-300 dark:text-gray-600 text-sm w-5 text-center">—</span>
          )}
        </div>
      </button>
    )
  }

  const hasHeader = playerName || showBackButton || showCurrentTurnButton

  return (
    <div
      className={`h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${
        !isCurrentPlayer ? 'opacity-90' : ''
      }`}
    >
      {/* Player / navigation header */}
      {hasHeader && (
        <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50 gap-2">
          {playerName && (
            <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-100 truncate flex-1 min-w-0">
              {playerName}
            </span>
          )}
          {showBackButton && onBackToMyCards && (
            <button
              onClick={() => {
                sounds.play('click', { force: true })
                onBackToMyCards()
              }}
              className="ml-auto shrink-0 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
            >
              ← {t('yahtzee.actions.myCards')}
            </button>
          )}
          {showCurrentTurnButton && onGoToCurrentTurn && (
            <button
              onClick={() => {
                sounds.play('click', { force: true })
                onGoToCurrentTurn()
              }}
              className="ml-auto shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              {t('yahtzee.actions.currentTurn')} →
            </button>
          )}
        </div>
      )}

      {/* Two-column body — each column scrolls independently on small viewports */}
      <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 overflow-y-auto sm:overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800">
        {/* ── Upper section ── */}
        <div className="flex flex-col min-h-0 px-2.5 sm:px-3 pt-2.5 pb-2 sm:overflow-y-auto">
          {/* Section header */}
          <div className="flex-shrink-0 flex items-center gap-2 mb-2">
            <span className="text-sm">🎯</span>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
              {t('yahtzee.categories.upperSection')}
            </h3>
          </div>

          {/* Bonus progress */}
          <div className="flex-shrink-0 mb-2.5 px-0.5">
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                {t('yahtzee.ui.bonusProgress', { current: upperTotal, target: 63 })}
              </span>
              <span
                className={`text-[10px] font-bold shrink-0 transition-colors ${
                  bonus > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {bonus > 0 ? `+35 🎁` : `${63 - upperTotal} to go`}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  bonus > 0
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                    : bonusProgress > 60
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                    : 'bg-gradient-to-r from-blue-400 to-cyan-400'
                }`}
                style={{ width: `${bonusProgress}%` }}
              />
            </div>
          </div>

          {/* Upper categories */}
          <div className="flex flex-col gap-1 sm:justify-evenly sm:flex-1">
            {upperSection.map(renderCategory)}
          </div>

          {/* Upper subtotal */}
          <div className="flex-shrink-0 flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Subtotal
            </span>
            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">
              {upperTotal}
              {bonus > 0 && (
                <span className="ml-1 text-xs text-emerald-500 font-semibold">+35</span>
              )}
            </span>
          </div>
        </div>

        {/* ── Lower section ── */}
        <div className="flex flex-col min-h-0 px-2.5 sm:px-3 pt-2.5 pb-2 sm:overflow-y-auto">
          {/* Section header */}
          <div className="flex-shrink-0 flex items-center gap-2 mb-2">
            <span className="text-sm">🎲</span>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">
              {t('yahtzee.categories.lowerSection')}
            </h3>
          </div>

          {/* Lower categories */}
          <div className="flex flex-col gap-1 sm:justify-evenly sm:flex-1">
            {lowerSection.map(renderCategory)}
          </div>

          {/* Lower subtotal */}
          <div className="flex-shrink-0 flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Subtotal
            </span>
            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{lowerTotal}</span>
          </div>
        </div>
      </div>

      {/* Total score footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/40 dark:to-purple-950/40">
        <span className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Total
        </span>
        <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
          {total}
        </span>
      </div>
    </div>
  )
})

export default Scorecard
