/**
 * @jest-environment node
 */

/**
 * Signed realtime, end to end without Supabase (GHSA-g868-9224-wr3p): what the
 * server seals, the client verifies with WebCrypto, and nothing else passes.
 *
 * The envelope is pushed through a JSON round trip with its keys reversed
 * before the client sees it, because that is what Supabase's relay does to a
 * payload: it decodes and re-encodes, and key order does not survive.
 */

import {
  __resetRealtimeSigningForTests,
  buildUserTopic,
  getRealtimeVerifyKey,
  sealRealtimeMessage,
} from '@/lib/server/realtime-signing'
import {
  __resetRealtimeVerifierForTests,
  createRealtimeReplayGuard,
  openRealtimeMessage,
  MAX_REORDER_MS,
  REPLAY_TOLERANCE_MS,
} from '@/lib/client/realtime-verify'
import { canonicalJson, type RealtimeEnvelope } from '@/lib/shared/realtime-envelope'

const TOPIC = 'lobby:1234:test-realtime-secret'
const SECRET_A = 'test-realtime-signing-secret-aaaaaaaaaaaaaaaa'
const SECRET_B = 'test-realtime-signing-secret-bbbbbbbbbbbbbbbb'

/** What the relay does: parse, re-encode, and with it lose key order. */
function relay<T>(value: T): T {
  const reorder = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(reorder)
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).reverse().map(([k, v]) => [k, reorder(v)]))
    }
    return input
  }
  return reorder(JSON.parse(JSON.stringify(value))) as T
}

function serveKeyFrom(secret: string) {
  process.env.NEXTAUTH_SECRET = secret
  __resetRealtimeSigningForTests()
  const key = getRealtimeVerifyKey()!
  ;(global.fetch as jest.Mock).mockImplementation(async () => ({
    ok: true,
    json: async () => ({ kid: key.kid, jwk: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, serverTime: Date.now() }),
  }))
  return key
}

const originalFetch = global.fetch
const originalEnv = { ...process.env }

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
  delete process.env.REALTIME_SIGNING_SECRET
  process.env.NEXTAUTH_SECRET = SECRET_A
  __resetRealtimeSigningForTests()
  __resetRealtimeVerifierForTests()
})

afterEach(() => {
  global.fetch = originalFetch
  process.env = { ...originalEnv }
  jest.restoreAllMocks()
})

describe('canonicalJson', () => {
  it('does not depend on key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' } })).toBe(
      canonicalJson({ a: { c: 'x', d: [1, { y: 2, z: 1 }] }, b: 1 })
    )
  })

  it('follows JSON.stringify for what a JSON round trip drops or rewrites', () => {
    const value = { u: undefined, n: Number.NaN, arr: [undefined, 1], d: new Date(0), s: 'é"\n' }
    expect(JSON.parse(canonicalJson(value))).toEqual(JSON.parse(JSON.stringify(value)))
  })
})

describe('sealRealtimeMessage', () => {
  it('signs a normalised copy of the payload', () => {
    const envelope = sealRealtimeMessage(TOPIC, 'game-update', { at: new Date(0), gone: undefined, keep: 1 })!
    expect(envelope.__rt).toBe(1)
    expect(envelope.p).toEqual({ at: '1970-01-01T00:00:00.000Z', keep: 1 })
    expect(envelope.sig).toMatch(/^[A-Za-z0-9_-]{86}$/)
    expect(envelope.n).not.toBe(sealRealtimeMessage(TOPIC, 'game-update', {})!.n)
  })

  it('replaces a lone surrogate so the relay cannot change what was signed', () => {
    const envelope = sealRealtimeMessage(TOPIC, 'chat-message', { username: 'ab\uD83D' })!
    expect(envelope.p.username).toBe('ab�')
  })

  it('derives the same key from the same secret and another from another', () => {
    const first = getRealtimeVerifyKey()!
    __resetRealtimeSigningForTests()
    expect(getRealtimeVerifyKey()).toEqual(first)

    process.env.NEXTAUTH_SECRET = SECRET_B
    __resetRealtimeSigningForTests()
    expect(getRealtimeVerifyKey()!.kid).not.toBe(first.kid)
  })

  it('prefers REALTIME_SIGNING_SECRET over NEXTAUTH_SECRET', () => {
    const fromNextAuth = getRealtimeVerifyKey()!
    process.env.REALTIME_SIGNING_SECRET = SECRET_B
    __resetRealtimeSigningForTests()
    expect(getRealtimeVerifyKey()!.kid).not.toBe(fromNextAuth.kid)
  })

  it('signs nothing without a secret', () => {
    delete process.env.NEXTAUTH_SECRET
    __resetRealtimeSigningForTests()
    expect(sealRealtimeMessage(TOPIC, 'game-update', {})).toBeNull()
    expect(getRealtimeVerifyKey()).toBeNull()
    expect(buildUserTopic('user-1')).toBeNull()
  })
})

describe('buildUserTopic', () => {
  it('is stable per user, different between users, and not the guessable user:{id}', () => {
    const topic = buildUserTopic('user-1')!
    expect(topic).toMatch(/^user:user-1:[A-Za-z0-9_-]{24}$/)
    expect(topic).not.toBe('user:user-1')
    expect(buildUserTopic('user-1')).toBe(topic)
    expect(buildUserTopic('user-2')!.split(':')[2]).not.toBe(topic.split(':')[2])
  })

  it('changes when the secret does', () => {
    const before = buildUserTopic('user-1')
    process.env.NEXTAUTH_SECRET = SECRET_B
    __resetRealtimeSigningForTests()
    expect(buildUserTopic('user-1')).not.toBe(before)
  })
})

describe('openRealtimeMessage', () => {
  it('accepts what the server sealed for this topic and event, after the relay', async () => {
    serveKeyFrom(SECRET_A)
    const envelope = relay(sealRealtimeMessage(TOPIC, 'game-update', { payload: { state: { board: [1, 2], lastMoveAt: 5 } } })!)

    const opened = await openRealtimeMessage(TOPIC, 'game-update', envelope, createRealtimeReplayGuard())

    expect(opened).toEqual({ ok: true, signed: true, payload: { payload: { state: { board: [1, 2], lastMoveAt: 5 } } } })
  })

  it('drops an unsigned frame for a server event – the forged game-abandoned of the advisory', async () => {
    serveKeyFrom(SECRET_A)
    const opened = await openRealtimeMessage(TOPIC, 'game-abandoned', { gameId: 'x' }, createRealtimeReplayGuard())
    expect(opened).toEqual({ ok: false, reason: 'unsigned' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('drops a genuine envelope whose payload was edited on the way', async () => {
    serveKeyFrom(SECRET_A)
    const envelope = relay(sealRealtimeMessage(TOPIC, 'game-update', { payload: { state: { lastMoveAt: 5 } } })!)
    ;(envelope.p as any).payload.state.lastMoveAt = Date.now() + 10 ** 9

    const opened = await openRealtimeMessage(TOPIC, 'game-update', envelope, createRealtimeReplayGuard())
    expect(opened).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('drops a genuine envelope moved to another topic or relabelled as another event', async () => {
    serveKeyFrom(SECRET_A)
    const envelope = sealRealtimeMessage(TOPIC, 'chat-message', { message: 'hi' })!

    expect(await openRealtimeMessage('lobby:9999:other-secret', 'chat-message', relay(envelope), createRealtimeReplayGuard()))
      .toEqual({ ok: false, reason: 'bad-signature' })
    expect(await openRealtimeMessage(TOPIC, 'game-abandoned', relay(envelope), createRealtimeReplayGuard()))
      .toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('drops an envelope signed with a key the server does not hold', async () => {
    serveKeyFrom(SECRET_A)
    process.env.NEXTAUTH_SECRET = SECRET_B
    __resetRealtimeSigningForTests()
    const forged = sealRealtimeMessage(TOPIC, 'game-update', {})!
    serveKeyFrom(SECRET_A)

    const opened = await openRealtimeMessage(TOPIC, 'game-update', relay(forged), createRealtimeReplayGuard())
    expect(opened).toEqual({ ok: false, reason: 'unknown-key' })
  })

  it('drops a forged signature that claims the real key id', async () => {
    serveKeyFrom(SECRET_A)
    const genuine = sealRealtimeMessage(TOPIC, 'game-update', {})!
    const forged: RealtimeEnvelope = { ...genuine, n: 'another-nonce', sig: 'A'.repeat(86) }

    const opened = await openRealtimeMessage(TOPIC, 'game-update', forged, createRealtimeReplayGuard())
    expect(opened).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('accepts a message once: a second copy is a replay', async () => {
    serveKeyFrom(SECRET_A)
    const guard = createRealtimeReplayGuard()
    const envelope = sealRealtimeMessage(TOPIC, 'game-abandoned', { reason: 'no_human_players' })!

    expect((await openRealtimeMessage(TOPIC, 'game-abandoned', relay(envelope), guard)).ok).toBe(true)
    expect(await openRealtimeMessage(TOPIC, 'game-abandoned', relay(envelope), guard)).toEqual({ ok: false, reason: 'replayed' })
  })

  it('drops a genuine message stamped before this page joined – a recording played back', async () => {
    serveKeyFrom(SECRET_A)
    const recorded = sealRealtimeMessage(TOPIC, 'game-abandoned', {}, Date.now() - REPLAY_TOLERANCE_MS - 60_000)!

    const opened = await openRealtimeMessage(TOPIC, 'game-abandoned', relay(recorded), createRealtimeReplayGuard())
    expect(opened).toEqual({ ok: false, reason: 'stale' })
  })

  it('drops a genuine message far older than the newest one accepted, once its nonce is forgotten', async () => {
    serveKeyFrom(SECRET_A)
    const guard = createRealtimeReplayGuard(Date.now() - 10 * 60_000)
    const old = sealRealtimeMessage(TOPIC, 'game-abandoned', {}, Date.now() - MAX_REORDER_MS - 60_000)!
    const fresh = sealRealtimeMessage(TOPIC, 'game-update', {})!

    expect((await openRealtimeMessage(TOPIC, 'game-update', relay(fresh), guard)).ok).toBe(true)
    expect(await openRealtimeMessage(TOPIC, 'game-abandoned', relay(old), guard)).toEqual({ ok: false, reason: 'stale' })
  })

  it('fetches the new public key when the server key rotates', async () => {
    serveKeyFrom(SECRET_A)
    const guard = createRealtimeReplayGuard()
    expect((await openRealtimeMessage(TOPIC, 'game-update', relay(sealRealtimeMessage(TOPIC, 'game-update', {})!), guard)).ok).toBe(true)

    // The refresh is throttled so forged key ids cannot drive a fetch loop.
    const realNow = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 61_000)
    serveKeyFrom(SECRET_B)
    const rotated = sealRealtimeMessage(TOPIC, 'game-update', { after: 'rotation' })!

    const opened = await openRealtimeMessage(TOPIC, 'game-update', relay(rotated), guard)
    expect(opened).toEqual({ ok: true, signed: true, payload: { after: 'rotation' } })
  })

  it('lets the lobby peer events through unsigned, and only on a lobby topic', async () => {
    const strokes = { kind: 'live', round: 1, drawerId: 'u1', live: null }
    expect(await openRealtimeMessage(TOPIC, 'sketch-live', strokes, createRealtimeReplayGuard()))
      .toEqual({ ok: true, signed: false, payload: strokes })
    expect(await openRealtimeMessage('user:u1:tag', 'sketch-live', strokes, createRealtimeReplayGuard()))
      .toEqual({ ok: false, reason: 'unsigned' })
    // chat is not a peer event: it has to come from the server.
    expect(await openRealtimeMessage(TOPIC, 'chat-message', { message: 'hi', userId: 'u2' }, createRealtimeReplayGuard()))
      .toEqual({ ok: false, reason: 'unsigned' })
  })

  describe('without WebCrypto', () => {
    const webCrypto = globalThis.crypto

    beforeEach(() => {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true })
    })

    afterEach(() => {
      Object.defineProperty(globalThis, 'crypto', { value: webCrypto, configurable: true, writable: true })
    })

    it('refuses signed messages in a production build, where it cannot check them', async () => {
      process.env = { ...process.env, NODE_ENV: 'production' }
      const envelope = sealRealtimeMessage(TOPIC, 'game-update', {})!
      expect(await openRealtimeMessage(TOPIC, 'game-update', relay(envelope), createRealtimeReplayGuard()))
        .toEqual({ ok: false, reason: 'unverifiable' })
    })

    it('still refuses unsigned frames in development', async () => {
      process.env = { ...process.env, NODE_ENV: 'development' }
      expect(await openRealtimeMessage(TOPIC, 'game-abandoned', {}, createRealtimeReplayGuard()))
        .toEqual({ ok: false, reason: 'unsigned' })
    })
  })
})
