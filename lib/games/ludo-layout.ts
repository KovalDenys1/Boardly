import {
  LudoColor,
  LUDO_FINISH,
  LUDO_HOME_COLUMN_START,
  LUDO_LAST_TRACK_STEP,
  LUDO_START_OFFSET,
  LUDO_TRACK_LENGTH,
  LUDO_YARD,
} from './ludo-game'

/**
 * Where everything sits on the 15×15 cross board (#1084), in cell units, so
 * the board can be drawn as one SVG that scales to whatever box it is given.
 *
 * Red's yard is top-left and play runs clockwise: red, green (top-right),
 * yellow (bottom-right), blue (bottom-left). Index 0 of the track is red's
 * start square, and each colour's start is 13 squares further on, matching
 * LUDO_START_OFFSET in the engine.
 */

export type Cell = readonly [row: number, col: number]

function buildTrack(): Cell[] {
  const cells: Cell[] = []
  const push = (row: number, col: number) => cells.push([row, col])
  for (let c = 1; c <= 5; c += 1) push(6, c)
  for (let r = 5; r >= 0; r -= 1) push(r, 6)
  push(0, 7)
  for (let r = 0; r <= 5; r += 1) push(r, 8)
  for (let c = 9; c <= 14; c += 1) push(6, c)
  push(7, 14)
  for (let c = 14; c >= 9; c -= 1) push(8, c)
  for (let r = 9; r <= 14; r += 1) push(r, 8)
  push(14, 7)
  for (let r = 14; r >= 9; r -= 1) push(r, 6)
  for (let c = 5; c >= 0; c -= 1) push(8, c)
  push(7, 0)
  push(6, 0)
  return cells
}

/** The 52 shared squares, indexed by absolute track position. */
export const LUDO_TRACK_CELLS: readonly Cell[] = buildTrack()

/** Each colour's five home-column squares, from the entry to the centre. */
export const LUDO_HOME_COLUMN_CELLS: Record<LudoColor, readonly Cell[]> = {
  red: [1, 2, 3, 4, 5].map((c) => [7, c] as Cell),
  green: [1, 2, 3, 4, 5].map((r) => [r, 7] as Cell),
  yellow: [13, 12, 11, 10, 9].map((c) => [7, c] as Cell),
  blue: [13, 12, 11, 10, 9].map((r) => [r, 7] as Cell),
}

/** Top-left cell of each colour's 6×6 yard. */
export const LUDO_YARD_ORIGIN: Record<LudoColor, Cell> = {
  red: [0, 0],
  green: [0, 9],
  yellow: [9, 9],
  blue: [9, 0],
}

/** Where a finished token rests inside the centre triangle of its colour. */
const FINISH_POINT: Record<LudoColor, readonly [number, number]> = {
  red: [7.5, 6.55],
  green: [6.55, 7.5],
  yellow: [7.5, 8.45],
  blue: [8.45, 7.5],
}

/** Yard spots, as offsets from the yard origin, for up to four tokens. */
const YARD_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [2, 4],
  [4, 2],
  [4, 4],
]

/**
 * Centre point (x, y) in cell units of a token at `position` for `color`.
 * `token` picks the yard spot and nudges finished tokens apart.
 */
export function ludoTokenPoint(color: LudoColor, position: number, token: number): { x: number; y: number } {
  if (position === LUDO_YARD) {
    const [originRow, originCol] = LUDO_YARD_ORIGIN[color]
    const [dy, dx] = YARD_SPOTS[token % YARD_SPOTS.length]
    return { x: originCol + dx, y: originRow + dy }
  }
  if (position >= LUDO_FINISH) {
    const [row, col] = FINISH_POINT[color]
    const spread = (token - 1.5) * 0.28
    const vertical = color === 'red' || color === 'yellow'
    return { x: col + (vertical ? 0 : spread), y: row + (vertical ? spread : 0) }
  }
  if (position >= LUDO_HOME_COLUMN_START) {
    const [row, col] = LUDO_HOME_COLUMN_CELLS[color][position - LUDO_HOME_COLUMN_START]
    return { x: col + 0.5, y: row + 0.5 }
  }
  const absolute = (LUDO_START_OFFSET[color] + Math.min(position, LUDO_LAST_TRACK_STEP)) % LUDO_TRACK_LENGTH
  const [row, col] = LUDO_TRACK_CELLS[absolute]
  return { x: col + 0.5, y: row + 0.5 }
}
