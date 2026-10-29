'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { playCue } from '@/lib/sound-engine'
import { prefersReducedMotion } from '@/lib/motion'
import { Icon } from '@/components/icons'
import ScorePop from '@/components/game-chrome/ScorePop'
import type { YahtzeeCategory, YahtzeeMode, YahtzeeScorecard } from '@/lib/yahtzee'
import { buildScorecardTiles, UPPER_BONUS_POINTS, type ScorecardTileModel, type ScoreTile } from '@/lib/yahtzee-tiles'
import { newlyScoredCategory, orderSheetPlayers, sheetLayout, type SheetRow } from '@/lib/yahtzee-sheet'

export interface ScoreTablePlayer {
  id: string
  name: string
  isBot?: boolean
  scorecard: YahtzeeScorecard
}

export interface YahtzeeScoreTableProps {
  players: readonly ScoreTablePlayer[]
  viewerId: string | null | undefined
  currentPlayerId: string | null | undefined
  mode: YahtzeeMode
  dice: readonly number[]
  canScore: boolean
  onScore?: (category: YahtzeeCategory) => void
  isScoring?: boolean
  rollsLeft: number
  departedIds?: ReadonlySet<string>
}

const FACE: Partial<Record<YahtzeeCategory, number>> = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
const FX_MS = 700

type CellFx = { category: YahtzeeCategory; kind: 'pop' | 'sweep' }

function MiniDie({ face }: { face: number }) {
  return (
    <span className="yz-mini-die" aria-hidden>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={PIPS[face]?.includes(i) ? 'yz-mini-die__pip--on' : undefined} />
      ))}
    </span>
  )
}

function RuleButton({
  id,
  name,
  rule,
  value,
  glyph,
  hint,
}: {
  id: string
  name: string
  rule: string
  value?: string
  glyph?: React.ReactNode
  hint?: string | null
}) {
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const popRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const pop = popRef.current
    const button = buttonRef.current
    if (!pop || !button || typeof pop.showPopover !== 'function') return
    const close = () => {
      try { pop.hidePopover() } catch { /* already closed */ }
    }
    const onBeforeToggle = (event: Event) => {
      if ((event as Event & { newState?: string }).newState !== 'open') return
      const rect = button.getBoundingClientRect()
      const width = Math.min(280, window.innerWidth - 16)
      pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
      if (rect.bottom + 140 > window.innerHeight && rect.top > 140) {
        pop.style.top = 'auto'
        pop.style.bottom = `${window.innerHeight - rect.top + 6}px`
      } else {
        pop.style.bottom = 'auto'
        pop.style.top = `${rect.bottom + 6}px`
      }
      // A top-layer popover does not follow its anchor, so anything that moves the anchor closes it.
      window.addEventListener('resize', close, { once: true })
      button.closest('.yz-sheet')?.addEventListener('scroll', close, { once: true, passive: true })
    }
    pop.addEventListener('beforetoggle', onBeforeToggle)
    return () => pop.removeEventListener('beforetoggle', onBeforeToggle)
  }, [])

  return (
    <>
      <button ref={buttonRef} type="button" className="yz-sheet__cat" popoverTarget={id} aria-describedby={id}>
        {glyph}
        <span className="yz-sheet__cat-text">
          <span className="yz-sheet__cat-name">{name}</span>
          {hint && <span className="yz-sheet__cat-hint" aria-hidden>{hint}</span>}
        </span>
        <span className="yz-sheet__cat-info" aria-hidden><Icon name="info" size={14} /></span>
      </button>
      <div ref={popRef} id={id} popover="auto" className="yz-rule-pop">
        <span className="yz-rule-pop__name">{name}</span>
        <span className="yz-rule-pop__rule">{rule}</span>
        {value && <span className="yz-rule-pop__value">{value}</span>}
      </div>
    </>
  )
}

export default function YahtzeeScoreTable({
  players,
  viewerId,
  currentPlayerId,
  mode,
  dice,
  canScore,
  onScore,
  isScoring = false,
  rollsLeft,
  departedIds,
}: YahtzeeScoreTableProps) {
  const { t } = useTranslation()
  const uid = React.useId()
  const layout = sheetLayout(mode)
  const ordered = orderSheetPlayers(players, viewerId)

  const models = new Map<string, ScorecardTileModel>(
    ordered.map((player) => [
      player.id,
      buildScorecardTiles({ scorecard: player.scorecard, mode, dice, canScore: canScore && player.id === viewerId }),
    ]),
  )

  const [armed, setArmed] = React.useState<YahtzeeCategory | null>(null)
  const diceKey = dice.join('')
  const cardsKey = JSON.stringify(ordered.map((player) => [player.id, player.scorecard]))
  React.useEffect(() => { setArmed(null) }, [diceKey, cardsKey, canScore])

  const previousCards = React.useRef<Map<string, YahtzeeScorecard> | null>(null)
  const [fx, setFx] = React.useState<Record<string, CellFx>>({})
  const [lastScored, setLastScored] = React.useState<Record<string, YahtzeeCategory>>({})
  const fxTimers = React.useRef<ReturnType<typeof setTimeout>[]>([])
  React.useEffect(() => () => fxTimers.current.forEach(clearTimeout), [])
  React.useEffect(() => {
    const previous = previousCards.current
    previousCards.current = new Map(ordered.map((player) => [player.id, player.scorecard]))
    if (!previous) return
    const landed: Record<string, CellFx> = {}
    for (const player of ordered) {
      const category = newlyScoredCategory(previous.get(player.id), player.scorecard)
      if (category) landed[player.id] = { category, kind: player.id === viewerId ? 'pop' : 'sweep' }
    }
    if (Object.keys(landed).length === 0) return
    setFx((current) => ({ ...current, ...landed }))
    setLastScored((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(landed).map(([id, cell]) => [id, cell.category])),
    }))
    fxTimers.current.push(setTimeout(() => {
      setFx((current) => Object.fromEntries(Object.entries(current).filter(([id, cell]) => landed[id] !== cell)))
    }, FX_MS))
    // cardsKey stands for the scorecards: only a real change re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsKey])

  React.useEffect(() => {
    if (!currentPlayerId || rollsLeft >= 3) return
    setLastScored((current) => {
      if (!(currentPlayerId in current)) return current
      const next = { ...current }
      delete next[currentPlayerId]
      return next
    })
  }, [currentPlayerId, rollsLeft])

  const sheetRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const sheet = sheetRef.current
    const corner = sheet?.querySelector('.yz-sheet__corner')
    const column = Array.from(sheet?.querySelectorAll<HTMLElement>('[data-player]') ?? []).find(
      (header) => header.dataset.player === currentPlayerId,
    )
    if (!sheet || !corner || !column) return
    const fixedEdge = corner.getBoundingClientRect().right
    const viewEdge = sheet.getBoundingClientRect().right
    const box = column.getBoundingClientRect()
    const shift = box.left < fixedEdge ? box.left - fixedEdge : box.right > viewEdge ? box.right - viewEdge : 0
    if (Math.abs(shift) < 1) return
    sheet.scrollTo({ left: sheet.scrollLeft + shift, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [currentPlayerId, ordered.length])

  const categoryName = (category: YahtzeeCategory) => t(`yahtzee.categories.${category}`)

  const score = (tile: ScoreTile) => {
    if (isScoring || !canScore || !onScore) return
    if (tile.state === 'zero' && armed !== tile.category) {
      playCue('ui.select')
      setArmed(tile.category)
      return
    }
    setArmed(null)
    onScore(tile.category)
  }

  const open = (
    <>
      <span className="yz-cell__dash" aria-hidden>–</span>
      <span className="sr-only">{t('yahtzee.ui.cellOpen')}</span>
    </>
  )

  const categoryCell = (player: ScoreTablePlayer, model: ScorecardTileModel, category: YahtzeeCategory) => {
    const tile = model.tiles.find((candidate) => candidate.category === category)
    if (!tile) return { content: open, classes: [] as string[] }
    const classes: string[] = []
    const cellFx = fx[player.id]
    if (cellFx?.category === category) classes.push(`yz-cell--${cellFx.kind}`)
    if (lastScored[player.id] === category) classes.push('yz-cell--last')

    if (tile.state === 'scored') {
      return { content: <span className="yz-cell__num">{tile.value}</span>, classes: [...classes, 'yz-cell--scored'] }
    }
    if (player.id === viewerId && canScore && onScore && (tile.state === 'potential' || tile.state === 'zero')) {
      const isArmed = armed === category
      const ghost = [
        'yz-ghost',
        tile.state === 'zero' ? 'yz-ghost--zero' : '',
        tile.isBest && tile.state === 'potential' ? 'yz-ghost--best' : '',
        tile.isBest && tile.state === 'zero' ? 'yz-ghost--burn' : '',
        isArmed ? 'yz-ghost--armed' : '',
      ].filter(Boolean).join(' ')
      const name = categoryName(category)
      return {
        content: (
          <button
            type="button"
            className={ghost}
            onClick={() => score(tile)}
            disabled={isScoring}
            aria-label={isArmed ? t('yahtzee.ui.tileConfirmZeroAria', { category: name }) : t('yahtzee.ui.tileScoreAria', { category: name, score: tile.value ?? 0 })}
            data-category={category}
            data-state={tile.state}
            data-best={tile.isBest || undefined}
          >
            <span className="yz-ghost__value">{tile.value}</span>
          </button>
        ),
        classes: [...classes, 'yz-cell--action'],
      }
    }
    return { content: open, classes }
  }

  const summaryCell = (row: SheetRow, model: ScorecardTileModel) => {
    const upper = model.upper
    if (!upper) return { content: open, classes: [] as string[], label: undefined as string | undefined }
    if (row.kind === 'sum') {
      return {
        content: (
          <>
            <span className="yz-cell__num">{upper.total}</span>
            <span className={`yz-cell__bar${upper.bonusEarned ? ' yz-cell__bar--done' : upper.complete ? ' yz-cell__bar--missed' : ''}`} aria-hidden>
              <i style={{ transform: `scaleX(${Math.min(1, upper.total / upper.target)})` }} />
            </span>
          </>
        ),
        classes: ['yz-cell--summary'],
        label: t('yahtzee.ui.bonusProgress', { current: upper.total }),
      }
    }
    return {
      content: upper.bonusEarned
        ? <span className="yz-cell__num yz-cell__num--bonus">{UPPER_BONUS_POINTS}</span>
        : upper.complete ? <span className="yz-cell__num yz-cell__num--missed">0</span> : open,
      classes: ['yz-cell--summary'],
      label: undefined,
    }
  }

  const rowHeader = (row: SheetRow) => {
    const id = `${uid}-rule-${row.key}`
    if (row.kind === 'category' && row.category) {
      const face = FACE[row.category]
      return (
        <RuleButton
          id={id}
          name={categoryName(row.category)}
          rule={t(`games.yahtzee.detail.scoring.rows.${row.category}.rule`)}
          value={t(`games.yahtzee.detail.scoring.rows.${row.category}.value`)}
          glyph={face ? <MiniDie face={face} /> : undefined}
          hint={armed === row.category ? t('yahtzee.ui.tapAgainZero') : null}
        />
      )
    }
    if (row.kind === 'bonus') {
      return <RuleButton id={id} name={t('yahtzee.categories.bonus')} rule={t('games.yahtzee.detail.scoring.upperNote')} />
    }
    return (
      <span className="yz-sheet__cat yz-sheet__cat--static">
        <span className="yz-sheet__cat-text">
          <span className="yz-sheet__cat-name">{t('yahtzee.ui.subtotal')}</span>
        </span>
      </span>
    )
  }

  const headerRow = (
    <div role="row" className="yz-sheet__row yz-sheet__row--head">
      <div role="columnheader" className="yz-sheet__corner">
        <span className="sr-only">{t('yahtzee.ui.scorecardTitle')}</span>
      </div>
      {ordered.map((player) => {
        const isViewer = player.id === viewerId
        const isCurrent = player.id === currentPlayerId
        const departed = !!departedIds?.has(player.id)
        return (
          <div
            key={player.id}
            role="columnheader"
            className={`yz-sheet__ph${isCurrent ? ' is-current' : ''}${departed ? ' is-departed' : ''}`}
            title={player.name}
            data-player={player.id}
          >
            <span className="yz-sheet__ph-marks" aria-hidden>
              <span className="yz-sheet__ph-dot" />
              {player.isBot && <Icon name="robot" size={12} />}
            </span>
            <span className="yz-sheet__ph-name">{isViewer ? t('yahtzee.ui.youPill') : player.name}</span>
            {isCurrent && <span className="sr-only">{isViewer ? t('game.ui.yourTurn') : t('game.ui.theirTurn')}</span>}
            {departed && <span className="sr-only">{t('game.ui.playerLeft')}</span>}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="yz-sheet-wrap">
      <div
        ref={sheetRef}
        role="table"
        aria-label={t('yahtzee.ui.scorecardTitle')}
        aria-busy={isScoring}
        className={`yz-sheet yz-sheet--${mode}`}
        data-players={ordered.length}
        data-testid="yahtzee-score-table"
        style={{ '--yz-players': ordered.length, '--yz-body-rows': layout.bodyRows } as React.CSSProperties}
      >
        {headerRow}
        {layout.rows.map((row) => (
          <div
            key={row.key}
            role="row"
            className={`yz-sheet__row yz-sheet__row--${row.kind} yz-sheet__row--${row.section}${armed && armed === row.category ? ' is-armed' : ''}`}
            style={{ '--yz-row': row.gridRow } as React.CSSProperties}
            data-row={row.key}
          >
            <div role="rowheader" className="yz-sheet__rh">{rowHeader(row)}</div>
            {ordered.map((player) => {
              const model = models.get(player.id)!
              const cell = row.kind === 'category' && row.category
                ? { ...categoryCell(player, model, row.category), label: undefined as string | undefined }
                : summaryCell(row, model)
              const classes = ['yz-cell', ...cell.classes, player.id === currentPlayerId ? 'is-current' : ''].filter(Boolean).join(' ')
              return (
                <div key={player.id} role="cell" className={classes} aria-label={cell.label}>
                  {cell.content}
                </div>
              )
            })}
          </div>
        ))}
        <div role="row" className="yz-sheet__row yz-sheet__row--total" style={{ '--yz-row': layout.bodyRows + 2 } as React.CSSProperties}>
          <div role="rowheader" className="yz-sheet__rh">
            <span className="yz-sheet__cat yz-sheet__cat--static yz-sheet__cat--total">{t('yahtzee.ui.total')}</span>
          </div>
          {ordered.map((player) => {
            const total = models.get(player.id)!.total
            return (
              <div key={player.id} role="cell" className={`yz-cell yz-cell--total${player.id === currentPlayerId ? ' is-current' : ''}`} data-testid="yahtzee-total">
                <ScorePop value={total} className="yz-cell__total">{total}</ScorePop>
              </div>
            )
          })}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {armed ? t('yahtzee.ui.tileConfirmZeroAria', { category: categoryName(armed) }) : ''}
      </span>
    </div>
  )
}
