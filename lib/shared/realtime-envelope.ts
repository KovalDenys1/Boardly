/**
 * The wire format of every broadcast the server sends (GHSA-g868-9224-wr3p).
 *
 * The lobby topic is a public Supabase broadcast channel, so anyone who holds
 * its name – every seated player, every admitted spectator – can send on it
 * too, and before this every receiver applied whatever arrived: a forged
 * `game-update` rewrote the board, a forged `game-abandoned` sent the whole
 * lobby back to /games, a forged `chat-message` spoke for somebody else.
 * Supabase stamps nothing that tells a server broadcast from a peer's.
 *
 * So the server signs. Every message it sends is sealed into the envelope
 * below with an ECDSA P-256 key only the server holds
 * (`lib/server/realtime-signing.ts`), and receivers verify it with the public
 * half (`lib/client/realtime-verify.ts`) before any handler sees the payload.
 * A client can still put a frame on the topic; it can no longer make it look
 * like the server's, because it would need the private key.
 *
 * The signature covers the topic and the event name as well as the payload, so
 * a genuine message cannot be moved to another lobby or re-labelled as another
 * event, and it carries a server timestamp and a nonce so the same message
 * cannot be played back later (the receiver's replay guard).
 *
 * The payload travels as an object, not as a pre-serialised string: Supabase
 * decodes and re-encodes it on the way through, which reorders keys, so both
 * sides sign the canonical form below instead of the bytes on the wire. The
 * alternative – shipping the payload as an escaped JSON string – would have
 * made every state broadcast about a fifth larger, and Sketch & Guess states
 * with drawings in them are the ones already closest to the broadcast size cap.
 */

export const REALTIME_ENVELOPE_VERSION = 1 as const

export interface RealtimeEnvelope {
  /** Format marker and version. */
  __rt: typeof REALTIME_ENVELOPE_VERSION
  /** Which server key signed it, so a rotated key is refetched rather than failed. */
  kid: string
  /** Server clock in epoch milliseconds when the message was sealed. */
  iat: number
  /** Random per message: seeing the same nonce twice means a replay. */
  n: string
  /** ECDSA P-256 over SHA-256, IEEE P1363 (r || s), base64url. */
  sig: string
  /** The event's payload – exactly what the handlers receive. */
  p: Record<string, unknown>
}

/** The public half of the server's key, as GET /api/realtime/key hands it out. */
export interface RealtimeVerifyKey {
  kid: string
  x: string
  y: string
}

const MAX_KID_LENGTH = 64
const MAX_NONCE_LENGTH = 64
// A P-256 signature is 64 bytes, 86 characters of base64url; anything much
// longer is not one and is not worth handing to the verifier.
const MAX_SIGNATURE_LENGTH = 128

export function isRealtimeEnvelope(value: unknown): value is RealtimeEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Record<string, unknown>
  return (
    raw.__rt === REALTIME_ENVELOPE_VERSION &&
    typeof raw.kid === 'string' && raw.kid.length > 0 && raw.kid.length <= MAX_KID_LENGTH &&
    typeof raw.iat === 'number' && Number.isFinite(raw.iat) &&
    typeof raw.n === 'string' && raw.n.length > 0 && raw.n.length <= MAX_NONCE_LENGTH &&
    typeof raw.sig === 'string' && raw.sig.length > 0 && raw.sig.length <= MAX_SIGNATURE_LENGTH &&
    !!raw.p && typeof raw.p === 'object' && !Array.isArray(raw.p)
  )
}

/**
 * JSON with object keys sorted, recursively – the one serialisation both
 * sides can reproduce after Supabase has re-encoded the payload.
 *
 * Everything else follows JSON.stringify exactly (toJSON, undefined and
 * functions dropped from objects and nulled in arrays, non-finite numbers as
 * null), and numbers and strings are formatted by JSON.stringify itself, so a
 * value that survives a JSON round trip serialises to the same text on either
 * end.
 */
export function canonicalJson(value: unknown): string {
  return serializeCanonical(value) ?? 'null'
}

function serializeCanonical(input: unknown): string | undefined {
  let value = input
  if (value !== null && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    value = (value as { toJSON: () => unknown }).toJSON()
  }

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null'
    case 'boolean':
      return value ? 'true' : 'false'
    case 'object': {
      if (value === null) return 'null'
      if (Array.isArray(value)) {
        return `[${value.map((item) => serializeCanonical(item) ?? 'null').join(',')}]`
      }
      const record = value as Record<string, unknown>
      const parts: string[] = []
      for (const key of Object.keys(record).sort()) {
        const serialized = serializeCanonical(record[key])
        if (serialized !== undefined) parts.push(`${JSON.stringify(key)}:${serialized}`)
      }
      return `{${parts.join(',')}}`
    }
    default:
      // undefined, functions, symbols: JSON.stringify leaves these out.
      return undefined
  }
}

/** The exact text the signature is computed over. */
export function realtimeSigningInput(
  topic: string,
  event: string,
  envelope: Pick<RealtimeEnvelope, 'kid' | 'iat' | 'n' | 'p'>
): string {
  return canonicalJson([REALTIME_ENVELOPE_VERSION, topic, event, envelope.kid, envelope.iat, envelope.n, envelope.p])
}

/**
 * Events a lobby topic carries from one client to the others, which the
 * server never sends and therefore never signs. Everything else on a lobby
 * topic must carry a valid server signature or it is dropped.
 *
 * - `sketch-live`: the Sketch & Guess drawer's canvas while it is being drawn.
 *   Non-authoritative by design (lib/sketch-live.ts): the drawing that is
 *   scored is the one `submit-drawing` stores, and `parseSketchLiveMessage`
 *   drops anything that is not the current drawer's, for the current round,
 *   within the canvas' own size limits.
 *
 * `chat-message` is not here on purpose: chat, Alias guesses included, goes
 * through a server route that knows who is speaking. Nor is
 * `spectator-count-update`: the spectate page reports its presence count to
 * PATCH /api/lobby/[code]/spectator-count, which stores the clamped value and
 * broadcasts it signed.
 */
export const LOBBY_PEER_EVENTS: ReadonlySet<string> = new Set(['sketch-live'])

export function isLobbyPeerEvent(topic: string, event: string): boolean {
  return topic.startsWith('lobby:') && LOBBY_PEER_EVENTS.has(event)
}

/** Largest spectator count a message may carry; the spectate route's own limit is far below it. */
export const MAX_REPORTED_SPECTATORS = 500

/**
 * A spectator count as a non-negative integer no larger than the cap. The
 * server sends it signed now, so this is belt and braces against a bad value,
 * not against a forger.
 */
export function readSpectatorCount(payload: unknown): number {
  const count = (payload as { count?: unknown } | null | undefined)?.count
  if (typeof count !== 'number' || !Number.isFinite(count)) return 0
  return Math.min(MAX_REPORTED_SPECTATORS, Math.max(0, Math.floor(count)))
}
