'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { YahtzeeCategory, YahtzeeMode, YahtzeeScorecard } from '@/lib/yahtzee'
import { buildScorecardTiles, type ScoreTile } from '@/lib/yahtzee-tiles'
import { sounds } from '@/lib/sounds'
import { Icon, type IconName } from '@/components/icons'
import Die from '@/components/ui/Die'

/**
 * The scorecard as a grid of tiles (#1187, option A). Each box shows either
 * what it holds (scored) or what this roll would put in it (+N), zero options
 * are dashed, and exactly one tile carries the best-move highlight. Tapping an
 * open tile scores it; a 0-point tile needs a second tap.
 */
export interface YahtzeeTileGridProps {
  scorecard: YahtzeeScorecard
  mode: YahtzeeMode
  dice: readonly number[]
  /** The viewer may score this card with the current roll. */
  canScore: boolean
  onScore: (category: YahtzeeCategory) => void
  isScoring?: boolean
  /** Whose card this is, when it is not the viewer's own. */
  otherPlayerName?: string | null
  onBackToMine?: () => void
  /** 'card' wraps the grid in its own card for the desktop centre column. */
  variant?: 'panel' | 'card'
  /** Rendered above the grid inside the card variant. */
  children?: React.ReactNode
}

const UPPER_FACE: Partial<Record<YahtzeeCategory, number>> = {
  ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
}

const LOWER_ICON: Partial<Record<YahtzeeCategory, IconName>> = {
  onePair: 'copy',
  twoPairs: 'cards',
  threeOfKind: 'star',
  fourOfKind: 'gem',
  fullHouse: 'home',
  smallStraight: 'chart',
  largeStraight: 'rocket',
  yahtzee: 'target',
  chance: 'dice',
}

/** How long an armed 0-point tile waits for its confirming second tap. */
const ZERO_CONFIRM_MS = 3000

function TileGlyph({ category }: { category: YahtzeeCategory }) {
  const face = UPPER_FACE[category]
  if (face !== undefined) return <Die value={face} size={16} />
  return <Icon name={LOWER_ICON[category] ?? 'dice'} size={16} />
}

export default function YahtzeeTileGrid({
  scorecard,
  mode,
  dice,
  canScore,
  onScore,
  isScoring = false,
  otherPlayerName = null,
  onBackToMine,
  variant = 'panel',
  children,
}: YahtzeeTileGridProps) {
  const { t } = useTranslation()
  const model = buildScorecardTiles({ scorecard, mode, dice, canScore })

  // A 0-point tile is armed by the first tap and scored by the second. Any
  // change to the roll or the card disarms it, so a stale arm never scores.
  const [armed, setArmed] = React.useState<YahtzeeCategory | null>(null)
  // Keys, not identities: the engine may hand over a fresh array or object
  // on every render, which must not count as a change.
  const diceKey = dice.join('')
  const scorecardKey = JSON.stringify(scorecard)
  React.useEffect(() => { setArmed(null) }, [diceKey, scorecardKey, canScore])
  React.useEffect(() => {
    if (!armed) return
    const timeout = setTimeout(() => setArmed(null), ZERO_CONFIRM_MS)
    return () => clearTimeout(timeout)
  }, [armed])

  // The box that was just filled gets a brief flash.
  const [justScored, setJustScored] = React.useState<YahtzeeCategory | null>(null)
  const previousRef = React.useRef(scorecard)
  React.useEffect(() => {
    const previous = previousRef.current
    previousRef.current = scorecard
    const filled = model.tiles.find((tile) => previous[tile.category] === undefined && scorecard[tile.category] !== undefined)
    if (!filled) return
    setJustScored(filled.category)
    const timeout = setTimeout(() => setJustScored(null), 900)
    return () => clearTimeout(timeout)
    // scorecardKey stands for scorecard: only a real change re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scorecardKey])

  const label = (category: YahtzeeCategory) => t(`yahtzee.categories.${category}`)

  const handleTile = (tile: ScoreTile) => {
    if (isScoring || !canScore) return
    if (tile.state !== 'potential' && tile.state !== 'zero') return
    if (tile.state === 'zero' && armed !== tile.category) {
      sounds.play('click', { force: true })
      setArmed(tile.category)
      return
    }
    sounds.play('click', { force: true })
    setArmed(null)
    onScore(tile.category)
  }

  const renderTile = (tile: ScoreTile) => {
    const name = label(tile.category)
    const isArmed = armed === tile.category
    const actionable = canScore && (tile.state === 'potential' || tile.state === 'zero')
    const className = [
      'yz-tile',
      `yz-tile--${tile.state}`,
      tile.isBest ? 'yz-tile--best' : '',
      isArmed ? 'yz-tile--armed' : '',
      justScored === tile.category ? 'yz-tile--just-scored' : '',
    ].filter(Boolean).join(' ')

    const value =
      tile.state === 'scored' ? String(tile.value)
      : tile.state === 'potential' ? `+${tile.value}`
      : tile.state === 'zero' ? '0'
      : ''

    const ariaLabel =
      tile.state === 'scored' ? t('yahtzee.ui.tileScoredAria', { category: name, score: tile.value ?? 0 })
      : tile.state === 'open' ? t('yahtzee.ui.tileOpenAria', { category: name })
      : isArmed ? t('yahtzee.ui.tileConfirmZeroAria', { category: name })
      : t('yahtzee.ui.tileScoreAria', { category: name, score: tile.value ?? 0 })

    const content = (
      <>
        <span className="yz-tile__head">
          <span className="yz-tile__icon" aria-hidden><TileGlyph category={tile.category} /></span>
          <span className="yz-tile__name">{name}</span>
        </span>
        <span className="yz-tile__foot">
          {isArmed ? (
            <span className="yz-tile__confirm">{t('yahtzee.ui.tapAgainZero')}</span>
          ) : tile.isBest ? (
            <span className="yz-tile__badge">{tile.value === 0 ? t('yahtzee.ui.burnBadge') : t('yahtzee.ui.best')}</span>
          ) : tile.state === 'scored' ? (
            <span className="yz-tile__mark" aria-hidden><Icon name="check" size={14} /></span>
          ) : null}
          <span className="yz-tile__value">{value}</span>
        </span>
      </>
    )

    if (!actionable) {
      return (
        <div key={tile.category} className={className} role="group" aria-label={ariaLabel} data-category={tile.category} data-state={tile.state}>
          {content}
        </div>
      )
    }

    return (
      <button
        key={tile.category}
        type="button"
        className={className}
        onClick={() => handleTile(tile)}
        disabled={isScoring}
        aria-label={ariaLabel}
        data-category={tile.category}
        data-state={tile.state}
        data-best={tile.isBest || undefined}
      >
        {content}
      </button>
    )
  }

  const upperTiles = model.tiles.filter((tile) => tile.section === 'upper')
  const lowerTiles = model.tiles.filter((tile) => tile.section === 'lower')
  const upper = model.upper
  const pace = upper ? upper.total - upper.par : 0

  const grid = (footerInGrid: React.ReactNode) => (
    <div
      className={`yz-grid ${mode === 'short' ? 'yz-grid--short' : 'yz-grid--classic'}`}
      aria-busy={isScoring}
      data-testid="yahtzee-tile-grid"
    >
      {upper && (
        <>
          <div className="yz-section">
            <span className="yz-section__label">{t('yahtzee.ui.upperShort')}</span>
            <span className={`yz-section__bar${upper.bonusEarned ? ' yz-section__bar--done' : ''}`} aria-hidden>
              <i style={{ transform: `scaleX(${Math.min(1, upper.total / upper.target)})` }} />
            </span>
            <span>{t('yahtzee.ui.upperProgress', { current: upper.total, target: upper.target })}</span>
            {upper.bonusEarned ? (
              <span className="yz-section__pace yz-section__pace--ahead">{t('yahtzee.ui.bonusEarned')}</span>
            ) : upper.par > 0 ? (
              <span className={`yz-section__pace ${pace >= 0 ? 'yz-section__pace--ahead' : 'yz-section__pace--behind'}`}>
                {pace === 0 ? t('yahtzee.ui.onPar') : pace > 0 ? t('yahtzee.ui.aheadOfPar', { count: pace }) : t('yahtzee.ui.behindPar', { count: -pace })}
              </span>
            ) : null}
          </div>
          {upperTiles.map(renderTile)}
        </>
      )}
      <div className="yz-section">
        <span className="yz-section__label">{upper ? t('yahtzee.ui.lowerShort') : t('yahtzee.ui.categoriesShort')}</span>
        <span className="yz-section__spacer" />
        <span>{model.lowerTotal}</span>
      </div>
      {lowerTiles.map(renderTile)}
      {footerInGrid}
    </div>
  )

  const bestName = model.best ? label(model.best) : null
  const bestIsBurn = model.best !== null && model.tiles.find((tile) => tile.category === model.best)?.value === 0
  const footer = (inGrid: boolean) => (
    <div className={`yz-footer${inGrid ? ' yz-footer--in-grid' : ''}`} data-testid={inGrid ? undefined : 'yahtzee-total'}>
      <span className="yz-footer__label">{t('yahtzee.ui.total')}</span>
      {otherPlayerName ? (
        <span className="yz-footer__detail">
          {t('yahtzee.ui.playersCard', { player: otherPlayerName })} · <b className="yz-footer__total">{model.total}</b>
        </span>
      ) : bestName && model.totalIfBest !== null ? (
        <span className="yz-footer__detail">
          {bestIsBurn ? t('yahtzee.ui.burnArrow', { category: bestName }) : t('yahtzee.ui.pickArrow', { category: bestName })} <b className="yz-footer__total">{model.totalIfBest}</b>
        </span>
      ) : (
        <b className="yz-footer__total">{model.total}</b>
      )}
      {otherPlayerName && onBackToMine && !inGrid && (
        <button
          type="button"
          className="yz-footer__back"
          onClick={() => {
            sounds.play('click', { force: true })
            onBackToMine()
          }}
        >
          {t('yahtzee.ui.backToMine')}
        </button>
      )}
    </div>
  )

  if (variant === 'card') {
    return (
      <div className="yz-card">
        {children}
        {grid(null)}
        {footer(false)}
      </div>
    )
  }

  return (
    <>
      {grid(footer(true))}
      {footer(false)}
    </>
  )
}
