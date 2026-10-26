import { clientLogger } from '@/lib/client-logger'
import { base64UrlToBytes, realtimeServerNow, verifyRealtimeSeal } from '@/lib/client/realtime-verify'
import { canonicalJson, isRealtimeEnvelope, type RealtimeEnvelope } from '@/lib/shared/realtime-envelope'
import {
  SKETCH_LIVE_KEY_EVENT,
  SKETCH_LIVE_MAX_FRAME_AGE_MS,
  SKETCH_LIVE_RESYNC_MS,
  isSketchLiveFrame,
  parseSketchLiveMessage,
  readSketchLiveKeyClaims,
  sketchLiveSigningInput,
  type SketchLiveFrame,
  type SketchLiveKeyClaims,
  type SketchLiveMessage,
} from '@/lib/sketch-live'

/**
 * Both ends of the signed Sketch & Guess live stream (lib/sketch-live.ts): the
 * drawer's page signs every frame with a key of its own that the server has
 * certified for the round, and every other page checks the certificate and the
 * signature before a stroke reaches its canvas.
 */

const ECDSA_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDSA_SHA256 = { name: 'ECDSA', hash: 'SHA-256' } as const
/** A P-256 signature in IEEE P1363 form is r || s, 32 bytes each. */
const SIGNATURE_BYTES = 64
const MAX_REMEMBERED_CERTIFICATES = 16
const MAX_REMEMBERED_ROUNDS = 64

let warnedInsecureContext = false

function getSubtle(): SubtleCrypto | null {
  return (globalThis as { crypto?: Crypto }).crypto?.subtle ?? null
}

function bytesToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function warnInsecureContextOnce(): void {
  if (warnedInsecureContext) return
  warnedInsecureContext = true
  clientLogger.warn('⚠️ Live drawing cannot be signed or checked outside a secure context; accepting it unchecked in development only')
}

export interface SketchLiveSenderOptions {
  /** Asks the server to certify the public key for the game's current round; the certificate, or null. */
  requestCert: (gameId: string, publicKey: { x: string; y: string }) => Promise<unknown>
  emit: (frame: SketchLiveFrame) => void
}

export interface SketchLiveSender {
  /**
   * Signs and sends `message`, once this page has been drawn on in the
   * message's round. Until the key is certified for the message's
   * round nothing goes out; the newest finished strokes are kept and sent the
   * moment the certificate arrives, and a stroke in progress is dropped – the
   * next one replaces it anyway.
   */
  send: (gameId: string, message: SketchLiveMessage) => void
  /** A frame heard on `topic`: another page of this drawer under a newer certificate quiets this one until it is drawn on again. */
  hear: (topic: string, raw: unknown) => Promise<void>
  /** This page may have missed such a frame (it was hidden, or its channel dropped): its next stroke asks for a new certificate. */
  renewOnNextStroke: () => void
}

interface SigningKey {
  privateKey: CryptoKey
  x: string
  y: string
}

async function generateSigningKey(): Promise<SigningKey | null> {
  const subtle = getSubtle()
  if (!subtle) {
    if (process.env.NODE_ENV !== 'production') warnInsecureContextOnce()
    return null
  }
  // Not extractable: the private half never leaves this page's crypto store.
  const pair = await subtle.generateKey(ECDSA_P256, false, ['sign', 'verify'])
  const jwk = await subtle.exportKey('jwk', pair.publicKey)
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return null
  return { privateKey: pair.privateKey, x: jwk.x, y: jwk.y }
}

export function createSketchLiveSender({ requestCert, emit }: SketchLiveSenderOptions): SketchLiveSender {
  let signingKey: Promise<SigningKey | null> | null = null
  let certified: { gameId: string; claims: SketchLiveKeyClaims; cert: RealtimeEnvelope; receivedAt: number } | null = null
  let requesting = false
  let lastRequestAt = Number.NEGATIVE_INFINITY
  let pending: { gameId: string; message: SketchLiveMessage } | null = null
  let seq = 0
  // Frames are signed one after another, so they leave in the order their
  // counters were handed out and a receiver never sees a newer one first.
  let queue: Promise<void> = Promise.resolve()
  // Receivers keep only the newest certificate per round, so it has to belong to the page being drawn on.
  let drawnIn: string | null = null
  let quietIn: string | null = null
  let handed: { round: string; strokes: string } | null = null
  let showing: SketchLiveExpectation | null = null
  let newestHeard: { round: string; cert: RealtimeEnvelope } | null = null
  let stale: unknown = null
  const others = createSketchLiveReceiver()

  const roundOf = (gameId: string, round: number, drawerId: string) => `${gameId}\n${round}\n${drawerId}`

  const isDrawing = (round: string, message: SketchLiveMessage) => {
    if (message.kind === 'live') return message.live !== null
    const strokes = canonicalJson(message.strokes)
    const before = handed?.round === round ? handed.strokes : '[]'
    handed = { round, strokes }
    return strokes !== before
  }

  const loadKey = () => {
    if (!signingKey) signingKey = generateSigningKey().catch(() => null)
    return signingKey
  }

  const covers = (gameId: string, message: { round: number; drawerId: string }) =>
    !!certified &&
    certified.gameId === gameId &&
    certified.claims.round === message.round &&
    certified.claims.drawerId === message.drawerId

  const isOlderThanHeard = (round: string, cert: RealtimeEnvelope) =>
    newestHeard?.round === round && compareIssue(cert, newestHeard.cert) < 0

  const quietIfTakenOver = () => {
    if (!certified) return
    const round = roundOf(certified.gameId, certified.claims.round, certified.claims.drawerId)
    if (!isOlderThanHeard(round, certified.cert)) return
    certified = null
    quietIn = round
  }

  const enqueue = (message: SketchLiveMessage) => {
    if (!certified) return
    const { cert } = certified
    seq += 1
    const frameSeq = seq
    // The certificate's stamp is the server's clock; this page's clock only measures time since.
    const t = cert.iat + (Date.now() - certified.receivedAt)
    queue = queue
      .then(async () => {
        const key = await loadKey()
        const subtle = getSubtle()
        if (!key || !subtle) return
        const signature = await subtle.sign(
          ECDSA_SHA256,
          key.privateKey,
          new TextEncoder().encode(sketchLiveSigningInput(cert.sig, frameSeq, t, message))
        )
        emit({ cert, seq: frameSeq, t, sig: bytesToBase64Url(signature), p: { ...message } })
      })
      .catch((error) => clientLogger.warn('Live drawing frame was not signed', { error }))
  }

  const certify = (gameId: string) => {
    const now = Date.now()
    if (requesting || now - lastRequestAt < SKETCH_LIVE_RESYNC_MS) return
    requesting = true
    lastRequestAt = now
    void (async () => {
      try {
        const key = await loadKey()
        if (!key) return
        const cert = await requestCert(gameId, { x: key.x, y: key.y })
        const claims = isRealtimeEnvelope(cert) ? readSketchLiveKeyClaims(cert.p) : null
        if (!isRealtimeEnvelope(cert) || !claims || claims.gameId !== gameId || claims.x !== key.x || claims.y !== key.y) return
        certified = { gameId, claims, cert, receivedAt: Date.now() }
      } catch {
        // The next send asks again, no sooner than the resync interval.
      } finally {
        requesting = false
      }
      quietIfTakenOver()
      const waiting = pending
      if (waiting && covers(waiting.gameId, waiting.message)) {
        pending = null
        enqueue(waiting.message)
      }
    })()
  }

  return {
    send(gameId, message) {
      const round = roundOf(gameId, message.round, message.drawerId)
      showing = { gameId, round: message.round, drawerId: message.drawerId }
      if (isDrawing(round, message)) {
        drawnIn = round
        if (quietIn === round) quietIn = null
        if (certified && certified === stale) certified = null
      }
      if (quietIn === round) return
      const drawn = drawnIn === round
      if (covers(gameId, message)) {
        if (drawn) enqueue(message)
        return
      }
      if (drawn && message.kind === 'strokes') pending = { gameId, message }
      certify(gameId)
    },

    async hear(topic, raw) {
      const expected = showing
      if (!expected || !isSketchLiveFrame(raw)) return
      const round = roundOf(expected.gameId, expected.round, expected.drawerId)
      const own = covers(expected.gameId, expected) ? certified : null
      if (quietIn === round || (!own && !requesting)) return
      // Only a frame claiming a newer certificate than any this page knows can matter, so nothing else costs a check.
      const claims = readSketchLiveKeyClaims(raw.cert.p)
      if (!claims || claims.gameId !== expected.gameId || claims.round !== expected.round || claims.drawerId !== expected.drawerId) return
      if ((own && compareIssue(raw.cert, own.cert) <= 0) || (newestHeard?.round === round && compareIssue(raw.cert, newestHeard.cert) <= 0)) return
      if (!(await others.open(topic, raw, expected))) return
      if (!isOlderThanHeard(round, raw.cert)) newestHeard = { round, cert: raw.cert }
      quietIfTakenOver()
    },

    renewOnNextStroke() {
      stale = certified
    },
  }
}

export interface SketchLiveExpectation {
  gameId: string
  round: number
  drawerId: string
}

export interface SketchLiveReceiver {
  /**
   * The message in `raw`, if it is the current drawer's for the round being
   * shown on this topic, signed within the last few seconds, from the drawer's
   * newest page, and newer than the last one accepted from it; otherwise null.
   */
  open: (topic: string, raw: unknown, expected: SketchLiveExpectation) => Promise<SketchLiveMessage | null>
}

interface CertifiedKey {
  claims: SketchLiveKeyClaims
  key: CryptoKey
}

interface ShownRound {
  iat: number
  n: string
  seq: number
}

function compareIssue(a: { iat: number; n: string }, b: { iat: number; n: string }): number {
  if (a.iat !== b.iat) return a.iat - b.iat
  return a.n === b.n ? 0 : a.n < b.n ? -1 : 1
}

export function createSketchLiveReceiver(): SketchLiveReceiver {
  // A certificate is checked once and its key reused for every frame under it.
  // Only a verified one stays: a failed check may be a key fetch that will
  // work next time, and a forged one should not crowd out the drawer's.
  const certifiedKeys = new Map<string, Promise<CertifiedKey | null>>()
  // The drawer's newest certificate per round: a reload makes a new key, and
  // the old page's frames are a recording from then on.
  const shownRounds = new Map<string, ShownRound>()

  const remember = <V>(map: Map<string, V>, id: string, value: V, limit: number) => {
    map.delete(id)
    map.set(id, value)
    while (map.size > limit) {
      const oldest = map.keys().next().value
      if (oldest === undefined) break
      map.delete(oldest)
    }
  }

  const certifiedKeyFor = (subtle: SubtleCrypto, topic: string, cert: RealtimeEnvelope) => {
    // The signed fields and the signature, not the signature alone: a forged
    // copy that keeps the signature must not share, and fail, the genuine one's check.
    const id = `${topic}\n${canonicalJson([cert.kid, cert.iat, cert.n, cert.sig, cert.p])}`
    let entry = certifiedKeys.get(id)
    if (!entry) {
      entry = verifyRealtimeSeal(topic, SKETCH_LIVE_KEY_EVENT, cert)
        .then(async (payload) => {
          const claims = readSketchLiveKeyClaims(payload)
          if (!claims) return null
          const key = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: claims.x, y: claims.y, ext: true }, ECDSA_P256, false, ['verify'])
          return { claims, key }
        })
        .catch(() => null)
      const settled = entry
      certifiedKeys.set(id, settled)
      void settled.then((value) => {
        if (!value && certifiedKeys.get(id) === settled) certifiedKeys.delete(id)
      })
      while (certifiedKeys.size > MAX_REMEMBERED_CERTIFICATES) {
        const oldest = certifiedKeys.keys().next().value
        if (oldest === undefined) break
        certifiedKeys.delete(oldest)
      }
    }
    return entry
  }

  return {
    async open(topic, raw, expected) {
      if (!expected.gameId || !isSketchLiveFrame(raw)) return null
      const message = parseSketchLiveMessage(raw.p, expected)
      if (!message) return null

      const subtle = getSubtle()
      if (!subtle) {
        // Same carve-out as signed broadcasts (lib/client/realtime-verify.ts):
        // `next dev` from a phone over the LAN is not a secure context. A
        // production build inlines NODE_ENV, so this never accepts there.
        if (process.env.NODE_ENV === 'production') return null
        warnInsecureContextOnce()
        return message
      }

      // canonicalJson throws on a certificate nested too deep to serialise.
      const certified = await Promise.resolve(raw.cert).then((cert) => certifiedKeyFor(subtle, topic, cert)).catch(() => null)
      if (!certified) return null
      const { claims, key } = certified
      if (claims.gameId !== expected.gameId || claims.round !== expected.round || claims.drawerId !== expected.drawerId) {
        return null
      }

      const serverNow = realtimeServerNow()
      if (serverNow === null || Math.abs(serverNow - raw.t) > SKETCH_LIVE_MAX_FRAME_AGE_MS) return null

      const signature = base64UrlToBytes(raw.sig)
      if (!signature || signature.length !== SIGNATURE_BYTES) return null
      let valid = false
      try {
        valid = await subtle.verify(ECDSA_SHA256, key, signature, new TextEncoder().encode(sketchLiveSigningInput(raw.cert.sig, raw.seq, raw.t, raw.p)))
      } catch {
        valid = false
      }
      if (!valid) return null

      // Checked after the await, so two frames verified side by side still count once.
      const roundId = `${topic}\n${claims.gameId}\n${claims.round}\n${claims.drawerId}`
      const shown = shownRounds.get(roundId)
      if (shown) {
        const order = compareIssue(raw.cert, shown)
        if (order < 0 || (order === 0 && raw.seq <= shown.seq)) return null
      }
      remember(shownRounds, roundId, { iat: raw.cert.iat, n: raw.cert.n, seq: raw.seq }, MAX_REMEMBERED_ROUNDS)
      return message
    },
  }
}
