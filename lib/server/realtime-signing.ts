import {
  createECDH,
  createHash,
  createHmac,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'crypto'
import {
  REALTIME_ENVELOPE_VERSION,
  realtimeSigningInput,
  type RealtimeEnvelope,
  type RealtimeVerifyKey,
} from '@/lib/shared/realtime-envelope'

/**
 * The server half of signed realtime (GHSA-g868-9224-wr3p): the key every
 * broadcast is sealed with, and the per-user topic names derived from it.
 *
 * The key is derived, not stored. `REALTIME_SIGNING_SECRET`, or
 * `NEXTAUTH_SECRET` when that is unset – the same fallback `GUEST_JWT_SECRET`
 * uses – is stretched with HKDF into a P-256 private scalar, so every server
 * instance arrives at the same key with no new required variable, and the
 * public half is served by GET /api/realtime/key for clients to verify with.
 * Rotating the secret rotates the key; clients see an unknown `kid` on the
 * next message and fetch the new public key.
 *
 * HKDF with a label per purpose keeps the derived keys independent of each
 * other and of the secret's other uses: knowing the public key or a user topic
 * says nothing about NEXTAUTH_SECRET.
 */

// Order of the P-256 group. A private scalar must lie in [1, n - 1].
const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')
const HKDF_SALT = 'boardly-realtime'

interface RealtimeSigningKey {
  kid: string
  privateKey: KeyObject
  verifyKey: RealtimeVerifyKey
  userTopicKey: Buffer
}

let cached: { secret: string; key: RealtimeSigningKey } | null = null

function readSigningSecret(): string | null {
  const secret = process.env.REALTIME_SIGNING_SECRET || process.env.NEXTAUTH_SECRET
  return secret && secret.length > 0 ? secret : null
}

function derive(secret: string, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, label, 32))
}

function derivePrivateScalar(secret: string): Buffer {
  // A 32-byte HKDF output is a valid scalar with probability 1 - 2^-32; the
  // counter makes the rare miss deterministic instead of a crash.
  for (let counter = 0; counter < 16; counter += 1) {
    const candidate = derive(secret, `broadcast-signing-p256-v1:${counter}`)
    const value = BigInt(`0x${candidate.toString('hex')}`)
    if (value > BigInt(0) && value < P256_ORDER) return candidate
  }
  throw new Error('Could not derive a realtime signing key')
}

function buildSigningKey(secret: string): RealtimeSigningKey {
  const scalar = derivePrivateScalar(secret)
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(scalar)
  const publicPoint = ecdh.getPublicKey() // 0x04 || X (32) || Y (32)
  const x = publicPoint.subarray(1, 33).toString('base64url')
  const y = publicPoint.subarray(33, 65).toString('base64url')
  const kid = createHash('sha256').update(publicPoint).digest('base64url').slice(0, 16)

  const privateKey = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: scalar.toString('base64url'), x, y },
    format: 'jwk',
  })

  return {
    kid,
    privateKey,
    verifyKey: { kid, x, y },
    userTopicKey: derive(secret, 'user-topic-v1'),
  }
}

function getSigningKey(): RealtimeSigningKey | null {
  const secret = readSigningSecret()
  if (!secret) return null
  if (cached?.secret === secret) return cached.key
  const key = buildSigningKey(secret)
  cached = { secret, key }
  return key
}

/** The public key clients verify broadcasts with, or null when no secret is configured. */
export function getRealtimeVerifyKey(): RealtimeVerifyKey | null {
  return getSigningKey()?.verifyKey ?? null
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * The payload as it will look after a JSON round trip: Dates as strings,
 * undefined gone. Signing this rather than the caller's object is what makes
 * the receiver's canonical form match the server's. A lone surrogate – a name
 * cut in half an emoji – is replaced the way a well-formed encoder would,
 * since the relay may not carry it through unchanged.
 */
function normalizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const parsed = JSON.parse(JSON.stringify(payload ?? {}), (_key, value) =>
    typeof value === 'string' && /[\uD800-\uDFFF]/.test(value) ? value.replace(LONE_SURROGATE, '�') : value
  )
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

/**
 * Seal a broadcast for `topic`/`event`. Returns null when there is no secret
 * to sign with, in which case the caller must not send: an unsigned message is
 * one every receiver drops anyway.
 */
export function sealRealtimeMessage(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
  now: number = Date.now()
): RealtimeEnvelope | null {
  const key = getSigningKey()
  if (!key) return null

  const unsigned = {
    kid: key.kid,
    iat: now,
    n: randomBytes(12).toString('base64url'),
    p: normalizePayload(payload),
  }
  const signature = sign('sha256', Buffer.from(realtimeSigningInput(topic, event, unsigned), 'utf8'), {
    key: key.privateKey,
    dsaEncoding: 'ieee-p1363',
  })

  return { __rt: REALTIME_ENVELOPE_VERSION, ...unsigned, sig: signature.toString('base64url') }
}

/**
 * The topic a user's invites, rematch requests and notification pokes arrive
 * on. It used to be `user:{userId}`, and user ids are public (lobby responses,
 * profile cards), so anyone could read a user's invites or push fake ones
 * (audit S3-05). The suffix is an HMAC of the id under a server-only key:
 * stable, so it needs no storage, and handed out only to the user it names
 * (GET /api/realtime/user-topic).
 */
export function buildUserTopic(userId: string): string | null {
  const key = getSigningKey()
  if (!key) return null
  const tag = createHmac('sha256', key.userTopicKey).update(userId, 'utf8').digest('base64url').slice(0, 24)
  return `user:${userId}:${tag}`
}

/** Test seam: forget the derived key so a changed secret is picked up. */
export function __resetRealtimeSigningForTests(): void {
  cached = null
}
