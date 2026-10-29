/** Row layout and change detection for the Yahtzee score table, pure so they test without a DOM. */
import {
  ALL_CATEGORIES,
  getActiveCategories,
  type YahtzeeCategory,
  type YahtzeeMode,
  type YahtzeeScorecard,
} from '@/lib/yahtzee'
import { UPPER_CATEGORIES } from '@/lib/yahtzee-tiles'

export type SheetRowKind = 'category' | 'sum' | 'bonus'

export interface SheetRow {
  key: string
  kind: SheetRowKind
  category: YahtzeeCategory | null
  section: 'upper' | 'lower'
  /** Grid row in the table (1 is the header). */
  gridRow: number
}

export interface SheetLayout {
  rows: SheetRow[]
  /** Rows between the header and the total. */
  bodyRows: number
}

export function sheetLayout(mode: YahtzeeMode): SheetLayout {
  const categories = getActiveCategories(mode)
  const rows: SheetRow[] = []
  let gridRow = 2

  if (mode !== 'short') {
    UPPER_CATEGORIES.forEach((category) => {
      rows.push({ key: category, kind: 'category', category, section: 'upper', gridRow: gridRow++ })
    })
    rows.push({ key: 'sum', kind: 'sum', category: null, section: 'upper', gridRow: gridRow++ })
    rows.push({ key: 'bonus', kind: 'bonus', category: null, section: 'upper', gridRow: gridRow++ })
  }

  categories
    .filter((category) => !UPPER_CATEGORIES.includes(category))
    .forEach((category) => {
      rows.push({ key: category, kind: 'category', category, section: 'lower', gridRow: gridRow++ })
    })

  return { rows, bodyRows: gridRow - 2 }
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
