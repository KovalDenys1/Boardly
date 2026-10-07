import { clientLogger } from '@/lib/client-logger'
import {
  isLobbyPeerEvent,
  isRealtimeEnvelope,
  realtimeSigningInput,
} from '@/lib/shared/realtime-envelope'

/**
 * The receiving half of signed realtime (GHSA-g868-9224-wr3p).
 *
 * Every server broadcast arrives sealed (lib/shared/realtime-envelope.ts).
 * `openRealtimeMessage` is the one gate between a frame on the socket and the
 * handlers: it hands a payload on only when the server's signature checks out
 * for this exact topic and event, the message is not one this page has seen
 * already, and it was not stamped before this page (re)joined the topic.
 * Anything else – an unsigned frame, a forged one, a genuine one recorded and
 * played back – is dropped. The only unsigned frames let through are the few
 * events clients send each other by design (`LOBBY_PEER_EVENTS`), whose
 * handlers treat them as untrusted.
 *
 * The public key comes from GET /api/realtime/key, fetched once per page and
 * again when a message names a key id this page does not know (a rotated
 * secret). The same response carries the server's clock, which is what the
 * replay window is measured against.
 */

const KEY_ENDPOINT = '/api/realtime/key'
const KEY_FETCH_ATTEMPTS = 3

/**
 * How long before this page (re)joined a topic a message may be stamped and
 * still count. A genuine message is stamped moments before it is sent and is
 * only delivered to pages already subscribed, so anything much older than the
 * join is a recording; the margin absorbs clock error and a slow send.
 */
export const REPLAY_TOLERANCE_MS = 30_000
/** A reconnect re-reads the server clock, but not more often than this. */
const CLOCK_REFRESH_INTERVAL_MS = 60_000
/** An unknown key id refetches the key at most this often, so forged ids cannot drive a fetch loop. */
const KEY_REFRESH_INTERVAL_MS = 60_000
/**
 * How far behind the newest message this page has accepted on a topic another
 * one may be stamped. Server broadcasts leave from different functions and can
 * arrive a little out of order; one minutes older than the newest is a
 * recording whose nonce has aged out of the memory below.
 */
export const MAX_REORDER_MS = 120_000
const MAX_REMEMBERED_NONCES = 2048
/** A P-256 signature in IEEE P1363 form is r || s, 32 bytes each. */
const SIGNATURE_BYTES = 64

interface VerifierKey {
  kid: string
  key: CryptoKey
  /** Server clock minus this client's clock, as measured when the key was fetched. */
  offsetMs: number
  fetchedAt: number
}

let resolvedKey: VerifierKey | null = null
let pendingKey: Promise<VerifierKey> | null = null
let lastKeyLoadAt = 0
let warnedInsecureContext = false

function getSubtle(): SubtleCrypto | null {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto
  return webCrypto?.subtle ?? null
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

async function fetchKeyOnce(subtle: SubtleCrypto): Promise<VerifierKey> {
  const startedAt = Date.now()
  const res = await fetch(KEY_ENDPOINT, { cache: 'no-store', credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Realtime key request failed with HTTP ${res.status}`)
  const data = await res.json()
  const receivedAt = Date.now()

  const kid = data?.kid
  const x = data?.jwk?.x
  const y = data?.jwk?.y
  const serverTime = data?.serverTime
  if (typeof kid !== 'string' || typeof x !== 'string' || typeof y !== 'string' || typeof serverTime !== 'number') {
    throw new Error('Malformed realtime key response')
  }

  const key = await subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )

  return {
    kid,
    key,
    offsetMs: serverTime - Math.round((startedAt + receivedAt) / 2),
    fetchedAt: receivedAt,
  }
}

async function loadKeyWithRetry(): Promise<VerifierKey> {
  const subtle = getSubtle()
  if (!subtle) throw new Error('WebCrypto is unavailable')

  let lastError: unknown = null
  for (let attempt = 0; attempt < KEY_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetchKeyOnce(subtle)
    } catch (error) {
      lastError = error
    }
    if (attempt < KEY_FETCH_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Realtime key unavailable')
}

function loadKey(): Promise<VerifierKey> {
  if (pendingKey) return pendingKey
  lastKeyLoadAt = Date.now()
  const loading = loadKeyWithRetry().then((key) => {
    resolvedKey = key
    return key
  })
  pendingKey = loading
  const clear = () => {
    if (pendingKey === loading) pendingKey = null
  }
  loading.then(clear, clear)
  return loading
}

async function currentKey(): Promise<VerifierKey> {
  return resolvedKey ?? loadKey()
}

/** A key named by a message this page does not know: fetch again, but not on every forged frame. */
async function refreshKey(): Promise<VerifierKey | null> {
  if (!pendingKey && Date.now() - lastKeyLoadAt < KEY_REFRESH_INTERVAL_MS) return resolvedKey
  try {
    return await loadKey()
  } catch {
    return resolvedKey
  }
}

/** Start fetching the key before the first message needs it. Safe to call often. */
export function prefetchRealtimeVerifierKey(): void {
  if (resolvedKey || pendingKey || !getSubtle() || typeof fetch !== 'function') return
  void loadKey().catch(() => {
    // The first message retries; nothing to report twice.
  })
}

/**
 * A topic was rejoined after a drop. The replay window restarts from now, so
 * the offset it is measured with should be current too – a laptop that slept
 * may have had its clock corrected since the key was fetched.
 */
export function refreshRealtimeClock(): void {
  if (!resolvedKey || pendingKey) return
  if (Date.now() - resolvedKey.fetchedAt < CLOCK_REFRESH_INTERVAL_MS) return
  void loadKey().catch(() => {
    // Keep the old reading; it is still roughly right.
  })
}

export interface RealtimeReplayGuard {
  /** This client's clock when the topic was last (re)joined. */
  windowStartedAt: number
  /** The newest server stamp accepted on this topic, in server time. */
  latestIat: number | null
  nonces: Set<string>
  order: string[]
}

export function createRealtimeReplayGuard(now: number = Date.now()): RealtimeReplayGuard {
  return { windowStartedAt: now, latestIat: null, nonces: new Set(), order: [] }
}

/**
 * Called on every SUBSCRIBED. Broadcast has no replay buffer, so nothing sent
 * while this page was away will ever be delivered to it legitimately; a
 * message stamped before the (re)join that arrives now is a recording. The
 * page resyncs from the server on a reconnect anyway.
 */
export function restartReplayWindow(guard: RealtimeReplayGuard, now: number = Date.now()): void {
  guard.windowStartedAt = now
}

function rememberNonce(guard: RealtimeReplayGuard, nonce: string) {
  guard.nonces.add(nonce)
  guard.order.push(nonce)
  while (guard.order.length > MAX_REMEMBERED_NONCES) {
    const evicted = guard.order.shift()
    if (evicted !== undefined) guard.nonces.delete(evicted)
  }
}

export type RealtimeRejectReason =
  | 'unsigned'
  | 'unknown-key'
  | 'bad-signature'
  | 'replayed'
  | 'stale'
  | 'unverifiable'

export type OpenedRealtimeMessage =
  | { ok: true; payload: unknown; signed: boolean }
  | { ok: false; reason: RealtimeRejectReason }

/**
 * Decide whether a frame that arrived on `topic` as `event` may reach the
 * handlers, and unwrap it if so.
 */
export async function openRealtimeMessage(
  topic: string,
  event: string,
  raw: unknown,
  guard: RealtimeReplayGuard
): Promise<OpenedRealtimeMessage> {
  if (!isRealtimeEnvelope(raw)) {
    if (isLobbyPeerEvent(topic, event) && raw !== null && typeof raw === 'object') {
      return { ok: true, payload: raw, signed: false }
    }
    return { ok: false, reason: 'unsigned' }
  }

  if (guard.nonces.has(raw.n)) return { ok: false, reason: 'replayed' }

  const subtle = getSubtle()
  if (!subtle) {
    // WebCrypto exists only in a secure context. Every deployed environment
    // is https, but `next dev` opened from a phone over the LAN is plain http,
    // and without this realtime would be dead there with no hint why. The
    // check is on NODE_ENV, which a production build inlines, so this branch
    // does not exist on boardly.online or on any preview.
    if (process.env.NODE_ENV !== 'production') {
      if (!warnedInsecureContext) {
        warnedInsecureContext = true
        clientLogger.warn('⚠️ Realtime signatures cannot be checked outside a secure context; accepting them unchecked in development only')
      }
      rememberNonce(guard, raw.n)
      return { ok: true, payload: raw.p, signed: true }
    }
    return { ok: false, reason: 'unverifiable' }
  }

  let key: VerifierKey
  try {
    key = await currentKey()
  } catch {
    return { ok: false, reason: 'unverifiable' }
  }

  if (key.kid !== raw.kid) {
    const refreshed = await refreshKey()
    if (!refreshed || refreshed.kid !== raw.kid) return { ok: false, reason: 'unknown-key' }
    key = refreshed
  }

  if (raw.iat < guard.windowStartedAt + key.offsetMs - REPLAY_TOLERANCE_MS) {
    return { ok: false, reason: 'stale' }
  }
  if (guard.latestIat !== null && raw.iat < guard.latestIat - MAX_REORDER_MS) {
    return { ok: false, reason: 'stale' }
  }

  const signature = base64UrlToBytes(raw.sig)
  if (!signature || signature.length !== SIGNATURE_BYTES) return { ok: false, reason: 'bad-signature' }

  let valid = false
  try {
    valid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key.key,
      signature,
      new TextEncoder().encode(realtimeSigningInput(topic, event, raw))
    )
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, reason: 'bad-signature' }

  // Two copies of one message can be verified side by side; only the first counts.
  if (guard.nonces.has(raw.n)) return { ok: false, reason: 'replayed' }
  rememberNonce(guard, raw.n)
  guard.latestIat = guard.latestIat === null ? raw.iat : Math.max(guard.latestIat, raw.iat)
  return { ok: true, payload: raw.p, signed: true }
}

/** Test seam: forget the key and the warning state. */
export function __resetRealtimeVerifierForTests(): void {
  resolvedKey = null
  pendingKey = null
  lastKeyLoadAt = 0
  warnedInsecureContext = false
}
