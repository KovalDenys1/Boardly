/**
 * Tile state for the Yahtzee scorecard grid (#1187), kept pure so the rules the
 * grid shows - what a box would score, which one is the single best move, how
 * the upper section stands against the bonus - are tested without a DOM.
 */
import {
  calculateScore,
  getActiveCategories,
  type YahtzeeCategory,
  type YahtzeeMode,
  type YahtzeeScorecard,
} from '@/lib/yahtzee'

export const UPPER_CATEGORIES: readonly YahtzeeCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
export const UPPER_BONUS_TARGET = 63
export const UPPER_BONUS_POINTS = 35

const UPPER_FACE: Partial<Record<YahtzeeCategory, number>> = {
  ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
}

/**
 * Which box to burn when nothing scores: cheapest first. Same order as the
 * timeout auto-pick in lib/yahtzee.ts, so the tile the grid suggests is the one
 * the game would have picked for you.
 */
const WASTE_PRIORITY: readonly YahtzeeCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'onePair', 'twoPairs', 'threeOfKind', 'fourOfKind', 'smallStraight', 'fullHouse',
  'largeStraight', 'chance', 'yahtzee',
]

/**
 * - `scored`: the box is filled; `value` is what it holds.
 * - `potential`: open, and the current roll would put `value` (> 0) in it.
 * - `zero`: open, and the current roll would score 0 here.
 * - `open`: open, but there is nothing to score against - no roll yet, not
 *   the viewer's turn, or someone else's card.
 */
export type TileState = 'scored' | 'potential' | 'zero' | 'open'

export interface ScoreTile {
  category: YahtzeeCategory
  state: TileState
  value: number | null
  isBest: boolean
  section: 'upper' | 'lower'
}

export interface UpperProgress {
  total: number
  /** Three of each face already scored: what "keeping pace" for 63 means so far. */
  par: number
  target: number
  bonusEarned: boolean
}

export interface ScorecardTileModel {
  tiles: ScoreTile[]
  best: YahtzeeCategory | null
  total: number
  /** Total after banking the best tile, or null when there is no best tile. */
  totalIfBest: number | null
  upper: UpperProgress | null
  lowerTotal: number
}

/**
 * The one best move for this roll: the highest score; on a tie, anything but
 * Chance (it is the spare slot, and burning it on a tie wastes it), then the
 * scorecard's own order. With nothing that scores, the cheapest box to burn.
 */
export function pickBestCategory(
  options: ReadonlyArray<{ category: YahtzeeCategory; score: number }>,
): YahtzeeCategory | null {
  if (options.length === 0) return null
  const top = Math.max(...options.map((o) => o.score))
  if (top > 0) {
    const tied = options.filter((o) => o.score === top)
    return (tied.find((o) => o.category !== 'chance') ?? tied[0]).category
  }
  const open = new Set(options.map((o) => o.category))
  return WASTE_PRIORITY.find((c) => open.has(c)) ?? options[0].category
}

export function scorecardTotal(scorecard: YahtzeeScorecard, mode: YahtzeeMode): number {
  const upper = mode === 'short' ? 0 : UPPER_CATEGORIES.reduce((s, c) => s + (scorecard[c] ?? 0), 0)
  const bonus = upper >= UPPER_BONUS_TARGET ? UPPER_BONUS_POINTS : 0
  const lower = getActiveCategories(mode)
    .filter((c) => !UPPER_CATEGORIES.includes(c))
    .reduce((s, c) => s + (scorecard[c] ?? 0), 0)
  return upper + bonus + lower
}

export function buildScorecardTiles({
  scorecard,
  mode,
  dice,
  canScore,
}: {
  scorecard: YahtzeeScorecard
  mode: YahtzeeMode
  dice: readonly number[]
  /** The viewer may score this card with this roll right now. */
  canScore: boolean
}): ScorecardTileModel {
  const categories = getActiveCategories(mode)
  const hasRoll = canScore && dice.length === 5 && dice.every((d) => d >= 1 && d <= 6)

  const openScores = hasRoll
    ? categories
        .filter((c) => scorecard[c] === undefined)
        .map((c) => ({ category: c, score: calculateScore([...dice], c) }))
    : []
  const best = pickBestCategory(openScores)
  const scoreByCategory = new Map(openScores.map((o) => [o.category, o.score]))

  const tiles: ScoreTile[] = categories.map((category) => {
    const section = UPPER_CATEGORIES.includes(category) ? 'upper' : 'lower'
    const filled = scorecard[category]
    if (filled !== undefined) {
      return { category, state: 'scored', value: filled, isBest: false, section }
    }
    const score = scoreByCategory.get(category)
    if (score === undefined) {
      return { category, state: 'open', value: null, isBest: false, section }
    }
    return {
      category,
      state: score > 0 ? 'potential' : 'zero',
      value: score,
      isBest: category === best,
      section,
    }
  })

  const total = scorecardTotal(scorecard, mode)
  const totalIfBest = best === null
    ? null
    : scorecardTotal({ ...scorecard, [best]: scoreByCategory.get(best) ?? 0 }, mode)

  let upper: UpperProgress | null = null
  if (mode !== 'short') {
    const upperTotal = UPPER_CATEGORIES.reduce((s, c) => s + (scorecard[c] ?? 0), 0)
    const par = UPPER_CATEGORIES.reduce(
      (s, c) => s + (scorecard[c] !== undefined ? 3 * (UPPER_FACE[c] ?? 0) : 0),
      0,
    )
    upper = {
      total: upperTotal,
      par,
      target: UPPER_BONUS_TARGET,
      bonusEarned: upperTotal >= UPPER_BONUS_TARGET,
    }
  }

  const lowerTotal = categories
    .filter((c) => !UPPER_CATEGORIES.includes(c))
    .reduce((s, c) => s + (scorecard[c] ?? 0), 0)

  return { tiles, best, total, totalIfBest, upper, lowerTotal }
}
