/**
 * Test support for signed realtime (GHSA-g868-9224-wr3p).
 *
 * Pages only ever see broadcasts the server signed: the channel registry drops
 * the rest. A page test that feeds a raw payload to a captured broadcast
 * handler is therefore feeding it a frame no real page would act on. These
 * helpers seal payloads with the real server code and give the registry the
 * real public key, so page tests keep exercising the path production takes –
 * including the asynchronous verification in front of every handler.
 */
import { setImmediate as realSetImmediate } from 'timers'
import { webcrypto } from 'crypto'
import {
  __resetRealtimeSigningForTests,
  getRealtimeVerifyKey,
  sealRealtimeMessage,
} from '@/lib/server/realtime-signing'
import { isLobbyPeerEvent } from '@/lib/shared/realtime-envelope'

export const TEST_REALTIME_SECRET = 'test-realtime-signing-secret-fixture-0000000'

/**
 * Give this test file a signing key, WebCrypto (jsdom has none) and a
 * /api/realtime/key answer. Call once at module scope or in beforeAll.
 */
export function installSignedRealtime(): void {
  process.env.NEXTAUTH_SECRET = TEST_REALTIME_SECRET
  __resetRealtimeSigningForTests()
  if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
  }

  const key = getRealtimeVerifyKey()!
  const previousFetch = global.fetch
  // A plain function rather than jest.fn(), so resetAllMocks cannot unset it.
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('/api/realtime/key')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ kid: key.kid, jwk: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, serverTime: Date.now() }),
      } as Response
    }
    if (typeof previousFetch === 'function') return previousFetch(input, init)
    throw new Error(`Unexpected fetch in test: ${url}`)
  }) as typeof fetch
}

/** What the server sends for `event` on `topic`, after the relay's JSON round trip. */
export function signBroadcast(topic: string, event: string, payload: unknown): unknown {
  const envelope = sealRealtimeMessage(topic, event, (payload ?? {}) as Record<string, unknown>)
  if (!envelope) throw new Error('installSignedRealtime() was not called')
  return JSON.parse(JSON.stringify(envelope))
}

/**
 * The frame a page would receive for `event`: sealed when the server sends it,
 * raw for the peer events clients send each other (LOBBY_PEER_EVENTS).
 */
export function frameFor(topic: string, event: string, payload: unknown): unknown {
  return isLobbyPeerEvent(topic, event) ? payload : signBroadcast(topic, event, payload)
}

/** Let the registry's WebCrypto verification finish. */
export async function settleRealtime(): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => realSetImmediate(resolve))
  }
}
