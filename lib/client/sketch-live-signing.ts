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
const MAX_REMEMBERED_SENDERS = 64
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
   * Signs and sends `message`. Until the key is certified for the message's
   * round nothing goes out; the newest finished strokes are kept and sent the
   * moment the certificate arrives, and a stroke in progress is dropped – the
   * next one replaces it anyway.
   */
  send: (gameId: string, message: SketchLiveMessage) => void
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

  const loadKey = () => {
    if (!signingKey) signingKey = generateSigningKey().catch(() => null)
    return signingKey
  }

  const covers = (gameId: string, message: SketchLiveMessage) =>
    !!certified &&
    certified.gameId === gameId &&
    certified.claims.round === message.round &&
    certified.claims.drawerId === message.drawerId

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
      const waiting = pending
      if (waiting && covers(waiting.gameId, waiting.message)) {
        pending = null
        enqueue(waiting.message)
      }
    })()
  }

  return {
    send(gameId, message) {
      if (covers(gameId, message)) {
        enqueue(message)
        return
      }
      if (message.kind === 'strokes') pending = { gameId, message }
      certify(gameId)
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
  issuedAt: number
}

export function createSketchLiveReceiver(): SketchLiveReceiver {
  // A certificate is checked once and its key reused for every frame under it.
  // Only a verified one stays: a failed check may be a key fetch that will
  // work next time, and a forged one should not crowd out the drawer's.
  const certifiedKeys = new Map<string, Promise<CertifiedKey | null>>()
  const lastSeq = new Map<string, number>()
  // The drawer's newest certificate per round: a reload makes a new key, and
  // the old page's frames are a recording from then on.
  const newestIssue = new Map<string, number>()

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
    // The whole certificate, not its signature alone: a forged copy that keeps
    // the signature must not share, and fail, the genuine one's check.
    const id = `${topic}\n${canonicalJson(cert)}`
    let entry = certifiedKeys.get(id)
    if (!entry) {
      entry = verifyRealtimeSeal(topic, SKETCH_LIVE_KEY_EVENT, cert)
        .then(async (payload) => {
          const claims = readSketchLiveKeyClaims(payload)
          if (!claims) return null
          const key = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: claims.x, y: claims.y, ext: true }, ECDSA_P256, false, ['verify'])
          return { claims, key, issuedAt: cert.iat }
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
    return { id, entry }
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

      const { id, entry } = certifiedKeyFor(subtle, topic, raw.cert)
      const certified = await entry
      if (!certified) return null
      const { claims, key, issuedAt } = certified
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
      const newest = newestIssue.get(roundId)
      if (newest !== undefined && issuedAt < newest) return null
      const last = lastSeq.get(id)
      if (last !== undefined && raw.seq <= last) return null
      remember(newestIssue, roundId, Math.max(newest ?? issuedAt, issuedAt), MAX_REMEMBERED_ROUNDS)
      remember(lastSeq, id, raw.seq, MAX_REMEMBERED_SENDERS)
      return message
    },
  }
}
