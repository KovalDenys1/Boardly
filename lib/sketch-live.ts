/**
 * Sketch & Guess live drawing: the drawer's canvas streamed to everyone else
 * over the lobby's realtime channel while the round's drawing phase runs.
 *
 * Two kinds of message. `strokes` carries every finished stroke, whole, so
 * undo and clear arrive as they are and a message lost in transit is repaired
 * by the next one. `live` carries only the stroke under the drawer's finger,
 * which is small, so it can go out many times a second.
 *
 * Nothing here is authoritative. The drawing that is scored is still the one
 * `submit-drawing` stores; this is only what people watch while it is made.
 */
/** Structurally the board's `Stroke`; declared here so lib does not import a component. */
export interface Stroke {
  color: string
  width: number
  points: { x: number; y: number }[]
}

export const SKETCH_LIVE_EVENT = 'sketch-live'

/** How often the stroke in progress goes out, at most. */
export const SKETCH_LIVE_THROTTLE_MS = 100

/**
 * How often the finished strokes are re-sent while the drawer keeps drawing,
 * so a player who joins or reconnects mid-round catches up without asking.
 */
export const SKETCH_LIVE_RESYNC_MS = 3000

/** Same ceiling the canvas enforces, so a forged message cannot be larger. */
const MAX_POINTS = 3000

export type SketchLiveMessage =
  | { kind: 'strokes'; round: number; drawerId: string; strokes: Stroke[] }
  | { kind: 'live'; round: number; drawerId: string; live: Stroke | null }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseStroke(value: unknown): Stroke | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.color !== 'string' || raw.color.length > 16) return null
  if (!isFiniteNumber(raw.width) || raw.width <= 0 || raw.width > 64) return null
  if (!Array.isArray(raw.points)) return null
  const points: Stroke['points'] = []
  for (const point of raw.points) {
    if (!point || typeof point !== 'object') return null
    const { x, y } = point as Record<string, unknown>
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
    points.push({ x, y })
  }
  return { color: raw.color, width: raw.width, points }
}

/**
 * Reads a broadcast payload and returns it only if it is well formed and comes
 * from the current drawer for the current round. Anything else – a stale round,
 * another player, a malformed or oversized body – is dropped.
 */
export function parseSketchLiveMessage(
  payload: unknown,
  expected: { round: number; drawerId: string }
): SketchLiveMessage | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as Record<string, unknown>
  if (raw.round !== expected.round || raw.drawerId !== expected.drawerId || !expected.drawerId) return null

  if (raw.kind === 'strokes') {
    if (!Array.isArray(raw.strokes)) return null
    const strokes: Stroke[] = []
    let total = 0
    for (const value of raw.strokes) {
      const stroke = parseStroke(value)
      if (!stroke) return null
      total += stroke.points.length
      if (total > MAX_POINTS) return null
      strokes.push(stroke)
    }
    return { kind: 'strokes', round: expected.round, drawerId: expected.drawerId, strokes }
  }

  if (raw.kind === 'live') {
    if (raw.live === null) return { kind: 'live', round: expected.round, drawerId: expected.drawerId, live: null }
    const live = parseStroke(raw.live)
    if (!live || live.points.length > MAX_POINTS) return null
    return { kind: 'live', round: expected.round, drawerId: expected.drawerId, live }
  }

  return null
}
