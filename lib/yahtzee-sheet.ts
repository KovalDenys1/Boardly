/** Row layout and change detection for the Yahtzee score table, pure so they test without a DOM. */
import {
  ALL_CATEGORIES,
  getActiveCategories,
  type YahtzeeCategory,
  type YahtzeeMode,
  type YahtzeeScorecard,
} from '@/lib/yahtzee'
import { UPPER_CATEGORIES } from '@/lib/yahtzee-tiles'

export type SheetRowKind = 'category' | 'sum' | 'bonus' | 'upperTotal'

export interface SheetRow {
  key: string
  kind: SheetRowKind
  category: YahtzeeCategory | null
  section: 'upper' | 'lower'
  /** Grid row in the single-column layout (1 is the header), or null when the row is not shown there. */
  stackRow: number | null
  /** Grid row when the two sections sit side by side and share rows 2-10. */
  splitRow: number
}

export interface SheetLayout {
  rows: SheetRow[]
  /** Rows between the header and the total in the single-column layout. */
  stackBodyRows: number
  canSplit: boolean
}

export function sheetLayout(mode: YahtzeeMode): SheetLayout {
  const categories = getActiveCategories(mode)
  const rows: SheetRow[] = []
  let stack = 2

  if (mode !== 'short') {
    UPPER_CATEGORIES.forEach((category, index) => {
      rows.push({ key: category, kind: 'category', category, section: 'upper', stackRow: stack++, splitRow: index + 2 })
    })
    rows.push({ key: 'sum', kind: 'sum', category: null, section: 'upper', stackRow: stack++, splitRow: 8 })
    rows.push({ key: 'bonus', kind: 'bonus', category: null, section: 'upper', stackRow: stack++, splitRow: 9 })
    // The stacked total row already carries it; side by side it gives the upper section its ninth row.
    rows.push({ key: 'upperTotal', kind: 'upperTotal', category: null, section: 'upper', stackRow: null, splitRow: 10 })
  }

  categories
    .filter((category) => !UPPER_CATEGORIES.includes(category))
    .forEach((category, index) => {
      rows.push({ key: category, kind: 'category', category, section: 'lower', stackRow: stack++, splitRow: index + 2 })
    })

  return { rows, stackBodyRows: stack - 2, canSplit: mode !== 'short' }
}

export function orderSheetPlayers<T extends { id: string }>(players: readonly T[], viewerId: string | null | undefined): T[] {
  const viewer = players.find((player) => player.id === viewerId)
  return viewer ? [viewer, ...players.filter((player) => player !== viewer)] : [...players]
}

export function newlyScoredCategory(
  previous: YahtzeeScorecard | undefined,
  next: YahtzeeScorecard,
): YahtzeeCategory | null {
  if (!previous) return null
  return ALL_CATEGORIES.find((category) => previous[category] === undefined && next[category] !== undefined) ?? null
}
