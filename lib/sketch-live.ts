import { canonicalJson, isExactRealtimeEnvelope, type RealtimeEnvelope } from '@/lib/shared/realtime-envelope'

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
 *
 * It is still only the drawer's to send. The messages go peer to peer, so the
 * drawer id inside one proves nothing: anyone on the topic can write it. Each
 * message therefore travels in a frame signed with a key the drawer's page
 * made for itself, and the server has certified that key – once per round,
 * after checking the caller is that round's drawer – with the same ECDSA key it
 * seals its broadcasts with (POST /api/game/[gameId]/sketch-live-key). A
 * receiver believes a frame only when the certificate verifies for its own
 * topic and names the game, round and drawer it is showing, and the frame's
 * signature verifies under the certified key. One signature per message on the
 * drawer's side, one check per message on everyone else's, and one request per
 * round: nothing per stroke touches the server, the database or the limiter.
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

/**
 * The event a drawer's key certificate is sealed under. The server never
 * broadcasts it, so a certificate put on the topic reaches no handler, and the
 * signature binds the event name, so it cannot pass for a broadcast either.
 */
export const SKETCH_LIVE_KEY_EVENT = 'sketch-live-key'

/** What the server vouches for: the P-256 key (x, y) draws `round` of `gameId` as `drawerId`. */
export interface SketchLiveKeyClaims {
  gameId: string
  round: number
  drawerId: string
  x: string
  y: string
}

/** A live-drawing message on the wire. */
export interface SketchLiveFrame {
  /** The server's seal over the drawer's key (`SketchLiveKeyClaims`). */
  cert: RealtimeEnvelope
  /** Counts up per sending page, so a recorded frame played back is older than one already shown. */
  seq: number
  /** Server time when it was signed, as the drawer's page reckons it from its certificate. */
  t: number
  /** ECDSA P-256 over SHA-256 by the certified key, IEEE P1363, base64url. */
  sig: string
  p: Record<string, unknown>
}

const MAX_ID_LENGTH = 128
const MAX_SIGNATURE_LENGTH = 128

/** A P-256 coordinate as a JWK carries it: 32 bytes, 43 characters of base64url. */
export function isP256Coordinate(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}

export function readSketchLiveKeyClaims(payload: unknown): SketchLiveKeyClaims | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as Record<string, unknown>
  if (typeof raw.gameId !== 'string' || raw.gameId.length === 0 || raw.gameId.length > MAX_ID_LENGTH) return null
  if (typeof raw.drawerId !== 'string' || raw.drawerId.length === 0 || raw.drawerId.length > MAX_ID_LENGTH) return null
  if (typeof raw.round !== 'number' || !Number.isInteger(raw.round)) return null
  if (!isP256Coordinate(raw.x) || !isP256Coordinate(raw.y)) return null
  return { gameId: raw.gameId, round: raw.round, drawerId: raw.drawerId, x: raw.x, y: raw.y }
}

const FRAME_KEYS: ReadonlySet<string> = new Set(['cert', 'seq', 't', 'sig', 'p'])

export function isSketchLiveFrame(value: unknown): value is SketchLiveFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Record<string, unknown>
  return (
    Object.keys(raw).every((key) => FRAME_KEYS.has(key)) &&
    isExactRealtimeEnvelope(raw.cert) &&
    typeof raw.seq === 'number' && Number.isSafeInteger(raw.seq) && raw.seq > 0 &&
    typeof raw.t === 'number' && Number.isFinite(raw.t) &&
    typeof raw.sig === 'string' && raw.sig.length > 0 && raw.sig.length <= MAX_SIGNATURE_LENGTH &&
    !!raw.p && typeof raw.p === 'object' && !Array.isArray(raw.p)
  )
}

/**
 * How far a frame's stamp may be from the receiver's reckoning of server time.
 * A frame arrives within a second or so; the rest absorbs two clock estimates.
 * A recording played back later than this is dropped even by a page that
 * opened after it was made and so has no newer frame to compare it with.
 */
export const SKETCH_LIVE_MAX_FRAME_AGE_MS = 10_000

/**
 * The text the drawer's key signs. The certificate's own signature stands in
 * for the certificate, so a frame cannot be moved under another one; canonical
 * JSON because the relay re-encodes the payload.
 */
export function sketchLiveSigningInput(certSignature: string, seq: number, t: number, payload: unknown): string {
  return canonicalJson([SKETCH_LIVE_EVENT, certSignature, seq, t, payload])
}
