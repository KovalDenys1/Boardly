'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { YahtzeeScorecard, YahtzeeCategory, YahtzeeMode, calculateScore } from '@/lib/yahtzee'
import { sounds } from '@/lib/sounds'
import { Icon, type IconName } from '@/components/icons'
import Die from '@/components/ui/Die'

interface ScorecardProps {
  scorecard: YahtzeeScorecard
  /** 'short' hides the upper section and the 63-bonus UI (#779) */
  mode?: YahtzeeMode
  currentDice: number[]
  rollsLeft?: number
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

/**
 * The upper section counts a face, so it shows that face - Boardly's own die,
 * not the Unicode die characters, which render in the platform's symbol font.
 * The lower section is scored by shape, so each hand gets a chrome icon.
 */
const upperFace: Partial<Record<YahtzeeCategory, number>> = {
  ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
}

const lowerIcons: Partial<Record<YahtzeeCategory, IconName>> = {
  onePair: 'copy',          // two of the same shape
  twoPairs: 'cards',
  threeOfKind: 'star',
  fourOfKind: 'gem',
  fullHouse: 'home',
  smallStraight: 'chart',   // a rising run
  largeStraight: 'rocket',
  yahtzee: 'target',
  chance: 'dice',           // the slot that takes any roll
}

function CategoryGlyph({ category }: { category: YahtzeeCategory }) {
  const face = upperFace[category]
  if (face !== undefined) return <Die value={face} size={22} />
  return <Icon name={lowerIcons[category] ?? 'dice'} size={20} />
}

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
  'group w-full flex items-center gap-2 px-3 rounded-2xl border min-h-[46px] sm:min-h-[44px] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none'

const rowVariants: Record<CategoryState, string> = {
  'high-value':
    'border-emerald-200 bg-[rgba(79,201,166,0.16)] hover:bg-[rgba(79,201,166,0.24)] hover:shadow-md cursor-pointer',
  'low-value':
    'border-[var(--bd-line)] bg-[var(--bd-bg)] hover:bg-[var(--bd-bg2)] hover:shadow-sm cursor-pointer',
  sacrifice:
    'border-amber-200 bg-[rgba(255,196,77,0.16)] hover:bg-[rgba(255,196,77,0.24)] hover:shadow-sm cursor-pointer',
  filled:
    'border-[var(--bd-line)] bg-[var(--bd-card-warm)] cursor-default',
  disabled:
    'border-[var(--bd-line)] bg-[var(--bd-bg)] opacity-60 cursor-not-allowed',
}

const Scorecard = React.memo(function Scorecard({
  scorecard,
  mode = 'classic',
  currentDice,
  rollsLeft = 0,
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

  // Track which category just transitioned from unfilled to filled so its row
  // can get a brief "just scored" flash instead of an instant, silent re-render.
  const [justScoredCategory, setJustScoredCategory] = React.useState<YahtzeeCategory | null>(null)
  const prevScorecardRef = React.useRef(scorecard)

  // Collapsed by default so it doesn't eat vertical space the player needs
  // to actually see category rows — expands on tap.
  const [showBestScoring, setShowBestScoring] = React.useState(false)

  React.useEffect(() => {
    const prev = prevScorecardRef.current
    const newlyFilled = [...upperSection, ...lowerSection].find(
      (category) => prev[category] === undefined && scorecard[category] !== undefined
    )
    prevScorecardRef.current = scorecard
    if (newlyFilled) {
      setJustScoredCategory(newlyFilled)
      const timeout = setTimeout(() => setJustScoredCategory(null), 900)
      return () => clearTimeout(timeout)
    }
  }, [scorecard])

  const showUpperSection = mode !== 'short'
  const activeUpperSection = showUpperSection ? upperSection : []
  const upperTotal = activeUpperSection.reduce((sum, cat) => sum + (scorecard[cat] ?? 0), 0)
  const bonus = showUpperSection && upperTotal >= 63 ? 35 : 0
  const lowerTotal = lowerSection.reduce((sum, cat) => sum + (scorecard[cat] ?? 0), 0)
  const total = upperTotal + bonus + lowerTotal
  const bonusProgress = Math.min(100, (upperTotal / 63) * 100)
  const filledCategories = [...activeUpperSection, ...lowerSection].filter((category) => scorecard[category] !== undefined).length
  const remainingCategories = activeUpperSection.length + lowerSection.length - filledCategories
  const bonusNeeded = Math.max(0, 63 - upperTotal)
  const scoringInsights = React.useMemo(() => {
    const options = [...activeUpperSection, ...lowerSection]
      .filter((category) => scorecard[category] === undefined)
      .map((category) => ({
        category,
        label: t(`yahtzee.categories.${category}`),
        potentialScore: calculateScore(currentDice, category),
      }))

    if (options.length === 0) {
      return {
        bestPotentialScore: null,
        bestOptions: [] as Array<{ category: YahtzeeCategory; label: string; potentialScore: number }>,
      }
    }

    const bestPotentialScore = Math.max(...options.map((option) => option.potentialScore))
    const bestOptions = options.filter((option) => option.potentialScore === bestPotentialScore)

    return {
      bestPotentialScore,
      bestOptions,
    }
  }, [currentDice, scorecard, t])

  const shouldShowScoringGuidance =
    isCurrentPlayer &&
    canSelectCategory &&
    scoringInsights.bestPotentialScore !== null &&
    scoringInsights.bestOptions.length > 0

  const bestOptionPreview = scoringInsights.bestOptions
    .slice(0, 2)
    .map((option) => option.label)
    .join(' / ')
  const playableNowCount = scoringInsights.bestOptions.length > 0
    ? [...upperSection, ...lowerSection].filter((category) => {
        if (scorecard[category] !== undefined) return false
        return calculateScore(currentDice, category) > 0
      }).length
    : 0

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
    const isYahtzeePerfect = category === 'yahtzee' && potentialScore === 50
    const isBestOption =
      shouldShowScoringGuidance &&
      potentialScore !== null &&
      potentialScore === scoringInsights.bestPotentialScore
    const rightDetail =
      state === 'filled'
        ? t('yahtzee.ui.scored')
        : state === 'high-value'
          ? 'Strong'
          : state === 'low-value'
            ? 'Playable'
            : state === 'sacrifice'
              ? 'Fallback'
              : t('yahtzee.ui.notAvailable')

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
        className={`${rowBase} ${rowVariants[state]} ${isBestOption ? 'ring-1 ring-emerald-300 dark:ring-emerald-700' : ''} ${isLoading ? 'opacity-50 cursor-wait' : ''} ${category === justScoredCategory ? 'scorecard-row-flash' : ''}`}
      >
        {/* Icon */}
        <span className="flex shrink-0 items-center leading-none"><CategoryGlyph category={category} /></span>

        {/* Label */}
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold leading-tight text-bd-ink sm:text-[13px]">
            {label}
          </div>
          <div className="mt-0.5 text-[11px] font-medium text-bd-ink-muted">
            {rightDetail}
          </div>
        </div>

        {/* Score indicator */}
        <div className="ml-1 flex min-w-[72px] shrink-0 items-center justify-end">
          {isLoading ? (
            <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
          ) : isBestOption ? (
            <span className="flex items-center gap-1">
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
                Best
              </span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 min-w-[1.5rem] text-right">
                +{potentialScore}
              </span>
            </span>
          ) : state === 'filled' ? (
            <span className="flex items-center gap-1">
              <Icon name="check" size={13} className="text-emerald-500" />
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
              {isYahtzeePerfect && <Icon name="target" size={13} className="mr-0.5" />}
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
            <span className="text-gray-400 dark:text-gray-500 text-sm w-5 text-center">—</span>
          )}
        </div>
      </button>
    )
  }

  return (
    <div
      className={`bd-card h-full flex flex-col overflow-hidden ${
        !isCurrentPlayer ? 'opacity-90' : ''
      }`}
      style={{
        background: 'linear-gradient(180deg, var(--bd-bg) 0%, var(--bd-card-warm) 100%)',
      }}
    >
      {/* Player identity + nav + stat chips — one horizontally-scrollable
          row instead of a separate header card + wrapping chip row, so
          more of the viewport is left for the actual category list */}
      <div className="flex-shrink-0 flex items-center gap-2 overflow-x-auto border-b px-3 py-1.5" style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}>
          {playerName && (
            <span className="shrink-0 max-w-[35%] truncate text-xs font-bold text-bd-ink">
              {playerName}
            </span>
          )}
          {showBackButton && onBackToMyCards && (
            <button
              onClick={() => {
                sounds.play('click', { force: true })
                onBackToMyCards()
              }}
              aria-label={t('yahtzee.actions.myCards')}
              title={t('yahtzee.actions.myCards')}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
              style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)', color: 'var(--bd-lav-deep)' }}
            >
              ←
            </button>
          )}
          {showCurrentTurnButton && onGoToCurrentTurn && (
            <button
              onClick={() => {
                sounds.play('click', { force: true })
                onGoToCurrentTurn()
              }}
              aria-label={t('yahtzee.actions.currentTurn')}
              title={t('yahtzee.actions.currentTurn')}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
              style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)', color: 'var(--bd-sky)' }}
            >
              →
            </button>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="bd-chip px-2.5 py-1 text-[10px]">
              {filledCategories}/{activeUpperSection.length + lowerSection.length} filled
            </span>
            <span className="bd-chip px-2.5 py-1 text-[10px]">
              {remainingCategories} left
            </span>
            {showUpperSection && (
              <span className={`bd-chip px-2.5 py-1 text-[10px] ${bonus > 0 ? 'bd-chip-mint' : 'bd-chip-sun'}`}>
                {bonus > 0 ? '+35 bonus ready' : `${bonusNeeded} to bonus`}
              </span>
            )}
            {isCurrentPlayer && canSelectCategory && (
              <span className="bd-chip bd-chip-lav px-2.5 py-1 text-[10px]">
                {playableNowCount > 0 ? `${playableNowCount} scoring options` : 'Choose a slot'}
              </span>
            )}
          </div>
        </div>

      {shouldShowScoringGuidance && (
        <div className="flex-shrink-0 border-b" style={{ borderColor: 'rgba(79,201,166,0.28)', background: 'linear-gradient(90deg, rgba(79,201,166,0.14) 0%, var(--bd-bg) 52%, rgba(107,193,240,0.14) 100%)' }}>
          <button
            type="button"
            onClick={() => {
              sounds.play('click', { force: true })
              setShowBestScoring((s) => !s)
            }}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
          >
            <span className="min-w-0 truncate text-xs font-semibold text-bd-ink">
              <Icon name="trophy" size={14} /> {scoringInsights.bestPotentialScore === 0 ? 'Burn a slot' : `Best +${scoringInsights.bestPotentialScore}`}
              {' · '}{bestOptionPreview}
            </span>
            <span
              className={`shrink-0 text-bd-ink-muted transition-transform duration-150 ${showBestScoring ? 'rotate-90' : ''}`}
              aria-hidden
            >
              ›
            </span>
          </button>
          {showBestScoring && (
            <div className="px-3 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-bd-ink">
                    {scoringInsights.bestPotentialScore === 0 ? 'No strong combo landed yet.' : 'You can bank a strong score right now.'}
                  </p>
                  <p className="mt-0.5 text-xs text-bd-ink-soft truncate">
                    {bestOptionPreview}
                    {scoringInsights.bestOptions.length > 2 ? '...' : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="bd-chip bd-chip-mint">
                    {scoringInsights.bestPotentialScore === 0 ? 'Burn a slot' : `Best +${scoringInsights.bestPotentialScore}`}
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-bd-ink-muted">
                    {rollsLeft > 0 ? `${rollsLeft} roll${rollsLeft === 1 ? '' : 's'} left` : 'No rolls left'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Two-column body — each column scrolls independently on small viewports */}
      <div className={`flex-1 min-h-0 grid grid-cols-1 ${showUpperSection ? 'sm:grid-cols-2' : ''} overflow-hidden divide-y sm:divide-y-0 sm:divide-x`} style={{ borderColor: 'var(--bd-line)' }}>
        {/* ── Upper section (hidden in short mode) ── */}
        {showUpperSection && (
        <div className="scorecard-scroll flex flex-col min-h-0 overflow-y-auto px-3 pt-2">
          {/* Section header */}
          <div className="mb-1.5 flex flex-shrink-0 items-center justify-between gap-2">
            <div className="flex items-center gap-2">
            <span className="bd-chip bd-chip-sun text-[11px]"><Icon name="target" size={12} /></span>
            <h3 className="bd-kicker" style={{ color: 'var(--bd-ink-soft)' }}>
              {t('yahtzee.categories.upperSection')}
            </h3>
            </div>
            <span className="text-sm font-bold text-bd-ink">{upperTotal}</span>
          </div>

          {/* Bonus progress */}
          <div className="flex-shrink-0 mb-2">
            <div className="flex items-center justify-between mb-0.5 gap-2">
              <span className="text-xs font-semibold text-bd-ink-muted">
                {t('yahtzee.ui.bonusProgress', { current: upperTotal, target: 63 })}
              </span>
              <span
                className={`text-xs font-bold shrink-0 transition-colors ${
                  bonus > 0
                    ? 'text-emerald-600'
                    : 'text-amber-700'
                }`}
              >
                {bonus > 0 ? <><Icon name="party" size={12} /> +35</> : `${63 - upperTotal} to go`}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--bd-bg2)' }}>
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
          <div className="flex flex-col gap-1 sm:justify-start sm:flex-1">
            {upperSection.map(renderCategory)}
          </div>

          {/* Upper subtotal */}
          <div className="flex-shrink-0 flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--bd-line)' }}>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-bd-ink-muted">
              Subtotal
            </span>
            <span className="text-base font-bold text-bd-ink">
              {upperTotal}
              {bonus > 0 && (
                <span className="ml-1 text-xs text-emerald-500 font-semibold">+35</span>
              )}
            </span>
          </div>
        </div>
        )}

        {/* ── Lower section ── */}
        <div className="scorecard-scroll flex flex-col min-h-0 overflow-y-auto px-3 pt-3">
          {/* Section header */}
          <div className="mb-2 flex flex-shrink-0 items-center justify-between gap-2">
            <div className="flex items-center gap-2">
            <span className="bd-chip bd-chip-lav text-[11px]"><Icon name="dice" size={12} /></span>
            <h3 className="bd-kicker" style={{ color: 'var(--bd-ink-soft)' }}>
              {t('yahtzee.categories.lowerSection')}
            </h3>
            </div>
            <span className="text-sm font-bold text-bd-ink">{lowerTotal}</span>
          </div>

          {/* Lower categories */}
          <div className="flex flex-col gap-1 sm:justify-start sm:flex-1">
            {lowerSection.map(renderCategory)}
          </div>

          {/* Lower subtotal */}
          <div className="flex-shrink-0 flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--bd-line)' }}>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-bd-ink-muted">
              Subtotal
            </span>
            <span className="text-base font-bold text-bd-ink">{lowerTotal}</span>
          </div>
        </div>
      </div>

      {/* Total score footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: 'var(--bd-line)', background: 'linear-gradient(90deg, rgba(255,196,77,0.14) 0%, rgba(155,140,255,0.14) 100%)' }}>
        <span className="bd-kicker">
          Total
        </span>
        <span className="text-xl font-black text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
          {total}
        </span>
      </div>
    </div>
  )
})

export default Scorecard
