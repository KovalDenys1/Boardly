/**
 * @jest-environment node
 */

import { setImmediate as realSetImmediate } from 'timers'
import {
  acquireLobbyChannel,
  __resetLobbyChannelsForTests,
} from '@/lib/lobby-channel-registry'
import { __resetRealtimeVerifierForTests } from '@/lib/client/realtime-verify'
import {
  __resetRealtimeSigningForTests,
  getRealtimeVerifyKey,
  sealRealtimeMessage,
} from '@/lib/server/realtime-signing'

/**
 * Mimics @supabase/realtime-js closely enough to catch the bug this module
 * exists to prevent (#1000): `RealtimeClient.channel(topic)` returns the *same
 * already-joined* channel on a second call with the same topic, and
 * `RealtimeChannel.subscribe()` has its whole body gated on the channel being
 * closed — so the second caller's status callback is silently dropped.
 */
function createFakeSupabaseClient() {
  const channelsByTopic = new Map<string, any>()

  function channel(topic: string) {
    const existing = channelsByTopic.get(topic)
    if (existing) return existing

    let joined = false
    const bindings: Array<{ event: string; cb: (msg: { payload: unknown }) => void }> = []
    const chan = {
      topic,
      subscribeCalls: 0,
      on(_type: string, filter: { event: string }, cb: (msg: { payload: unknown }) => void) {
        bindings.push({ event: filter.event, cb })
        return chan
      },
      subscribe(cb?: (status: string) => void) {
        chan.subscribeCalls += 1
        if (joined) return chan
        joined = true
        cb?.('SUBSCRIBED')
        return chan
      },
      send: jest.fn().mockResolvedValue('ok'),
      _emit(event: string, payload: unknown) {
        bindings.filter((b) => b.event === event).forEach((b) => b.cb({ payload }))
      },
    }
    channelsByTopic.set(topic, chan)
    return chan
  }

  return {
    channel,
    channelsByTopic,
    removeChannel: jest.fn(async (chan: any) => {
      for (const [topic, value] of channelsByTopic.entries()) {
        if (value === chan) channelsByTopic.delete(topic)
      }
    }),
  }
}

let fakeClient: ReturnType<typeof createFakeSupabaseClient>

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => fakeClient,
}))

const TOPIC = 'lobby:1234:secret'

/** What the server would send on TOPIC, after the relay's JSON round trip. */
function signed(event: string, payload: Record<string, unknown>, topic: string = TOPIC) {
  return JSON.parse(JSON.stringify(sealRealtimeMessage(topic, event, payload)))
}

/** Verification is async (WebCrypto); let it finish on the real event loop. */
async function settle() {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => realSetImmediate(resolve))
  }
}

const originalFetch = global.fetch

describe('lobby channel registry', () => {
  beforeEach(() => {
    // Date and the microtask queue stay real: signatures carry server time and
    // WebCrypto resolves on the event loop.
    jest.useFakeTimers({ doNotFake: ['Date', 'nextTick', 'queueMicrotask', 'setImmediate'] })
    fakeClient = createFakeSupabaseClient()
    __resetLobbyChannelsForTests()
    __resetRealtimeVerifierForTests()
    process.env.NEXTAUTH_SECRET = 'test-realtime-signing-secret-registry-000000'
    __resetRealtimeSigningForTests()
    const key = getRealtimeVerifyKey()!
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ kid: key.kid, jwk: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, serverTime: Date.now() }),
    })) as unknown as typeof fetch
  })

  afterEach(() => {
    jest.useRealTimers()
    global.fetch = originalFetch
  })

  it('reports SUBSCRIBED to a consumer that arrives after the channel joined', () => {
    const firstStatuses: string[] = []
    const secondStatuses: string[] = []

    acquireLobbyChannel(TOPIC, { onStatus: (s) => firstStatuses.push(s) })
    acquireLobbyChannel(TOPIC, { onStatus: (s) => secondStatuses.push(s) })

    expect(firstStatuses).toEqual(['SUBSCRIBED'])
    // Before #1000 this was empty: the shared channel was already joined, so
    // the second subscribe() never registered the callback.
    expect(secondStatuses).toEqual(['SUBSCRIBED'])
  })

  it('subscribes once no matter how many consumers share the topic', () => {
    acquireLobbyChannel(TOPIC, {})
    acquireLobbyChannel(TOPIC, {})

    expect(fakeClient.channelsByTopic.get(TOPIC).subscribeCalls).toBe(1)
  })

  it('delivers a broadcast to every consumer bound to that event', async () => {
    const first = jest.fn()
    const second = jest.fn()

    acquireLobbyChannel(TOPIC, { events: { 'game-update': first } })
    acquireLobbyChannel(TOPIC, { events: { 'game-update': second } })

    fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', signed('game-update', { move: 1 }))
    await settle()

    expect(first).toHaveBeenCalledWith({ move: 1 })
    expect(second).toHaveBeenCalledWith({ move: 1 })
  })

  it('binds an event the first consumer never asked for', async () => {
    const chat = jest.fn()

    acquireLobbyChannel(TOPIC, { events: { 'game-update': jest.fn() } })
    acquireLobbyChannel(TOPIC, { events: { 'chat-message': chat } })

    fakeClient.channelsByTopic.get(TOPIC)._emit('chat-message', signed('chat-message', { text: 'hi' }))
    await settle()

    expect(chat).toHaveBeenCalledWith({ text: 'hi' })
  })

  it('keeps the channel alive while another consumer still holds it', async () => {
    const survivor = jest.fn()
    acquireLobbyChannel(TOPIC, { events: { 'game-update': survivor } })
    const leaving = acquireLobbyChannel(TOPIC, { events: { 'game-update': jest.fn() } })

    leaving.release()
    jest.runAllTimers()

    expect(fakeClient.removeChannel).not.toHaveBeenCalled()

    fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', signed('game-update', { move: 2 }))
    await settle()
    expect(survivor).toHaveBeenCalledWith({ move: 2 })
  })

  it('stops delivering to a released consumer', async () => {
    const released = jest.fn()
    acquireLobbyChannel(TOPIC, { events: { 'game-update': jest.fn() } })
    const handle = acquireLobbyChannel(TOPIC, { events: { 'game-update': released } })

    handle.release()
    fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', signed('game-update', { move: 3 }))
    await settle()

    expect(released).not.toHaveBeenCalled()
  })

  it('survives a cleanup-then-reacquire in the same flush without tearing down', () => {
    const handle = acquireLobbyChannel(TOPIC, {})
    const channel = handle.channel

    handle.release()
    const again = acquireLobbyChannel(TOPIC, {})
    jest.runAllTimers()

    expect(fakeClient.removeChannel).not.toHaveBeenCalled()
    expect(again.channel).toBe(channel)
  })

  it('removes the channel once the last consumer releases it', () => {
    const handle = acquireLobbyChannel(TOPIC, {})
    const channel = handle.channel

    handle.release()
    jest.runAllTimers()

    expect(fakeClient.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('ignores a double release so one consumer cannot drop another consumer count', () => {
    const first = acquireLobbyChannel(TOPIC, {})
    acquireLobbyChannel(TOPIC, {})

    first.release()
    first.release()
    jest.runAllTimers()

    expect(fakeClient.removeChannel).not.toHaveBeenCalled()
  })

  // GHSA-g868-9224-wr3p: holding the topic lets a client send on it, and before
  // this every frame reached the handlers. These are the advisory's acceptance
  // cases, driven through the registry exactly as a page receives them.
  describe('frames the server did not sign', () => {
    it('does not hand a forged game-abandoned to the page', async () => {
      const onAbandoned = jest.fn()
      acquireLobbyChannel(TOPIC, { events: { 'game-abandoned': onAbandoned } })

      fakeClient.channelsByTopic.get(TOPIC)._emit('game-abandoned', { gameId: 'x' })
      await settle()

      expect(onAbandoned).not.toHaveBeenCalled()
    })

    it('does not hand a forged future-stamped game-update to the page, and the next real one still lands', async () => {
      const onUpdate = jest.fn()
      acquireLobbyChannel(TOPIC, { events: { 'game-update': onUpdate } })
      const channel = fakeClient.channelsByTopic.get(TOPIC)

      channel._emit('game-update', {
        action: 'state-change',
        payload: { state: { board: ['X', 'X', 'X'], lastMoveAt: Date.now() + 10 ** 9 } },
      })
      channel._emit('game-update', signed('game-update', {
        action: 'state-change',
        payload: { state: { board: ['O', null, null], lastMoveAt: Date.now() } },
      }))
      await settle()

      expect(onUpdate).toHaveBeenCalledTimes(1)
      expect(onUpdate.mock.calls[0][0].payload.state.board).toEqual(['O', null, null])
    })

    it('does not deliver a forged chat message', async () => {
      const onChat = jest.fn()
      acquireLobbyChannel(TOPIC, { events: { 'chat-message': onChat } })

      fakeClient.channelsByTopic.get(TOPIC)._emit('chat-message', { userId: 'victim', username: 'Victim', message: 'I resign' })
      await settle()

      expect(onChat).not.toHaveBeenCalled()
    })

    it('does not deliver a genuine message signed for a different lobby', async () => {
      const onUpdate = jest.fn()
      acquireLobbyChannel(TOPIC, { events: { 'game-update': onUpdate } })

      fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', signed('game-update', { move: 9 }, 'lobby:9999:other'))
      await settle()

      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('delivers a genuine message once, however often it is replayed', async () => {
      const onUpdate = jest.fn()
      acquireLobbyChannel(TOPIC, { events: { 'game-update': onUpdate } })
      const envelope = signed('game-update', { move: 4 })

      fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', envelope)
      fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', envelope)
      await settle()

      expect(onUpdate).toHaveBeenCalledTimes(1)
    })

    it('keeps arrival order even though verification is asynchronous', async () => {
      const seen: number[] = []
      acquireLobbyChannel(TOPIC, { events: { 'game-update': (p) => seen.push((p as { move: number }).move) } })
      const channel = fakeClient.channelsByTopic.get(TOPIC)

      for (const move of [1, 2, 3, 4, 5]) channel._emit('game-update', signed('game-update', { move }))
      await settle()

      expect(seen).toEqual([1, 2, 3, 4, 5])
    })

    it('still passes the peer events clients send each other, unsigned', async () => {
      const onSketch = jest.fn()
      acquireLobbyChannel(TOPIC, { events: { 'sketch-live': onSketch } })

      fakeClient.channelsByTopic.get(TOPIC)._emit('sketch-live', { kind: 'live', round: 1, drawerId: 'u1', live: null })
      await settle()

      expect(onSketch).toHaveBeenCalledWith({ kind: 'live', round: 1, drawerId: 'u1', live: null })
    })

    it('believes only the server about the spectator count', async () => {
      const onCount = jest.fn()
      acquireLobbyChannel(TOPIC, { events: { 'spectator-count-update': onCount } })
      const channel = fakeClient.channelsByTopic.get(TOPIC)

      // Any topic holder could set the players' badge to anything while the
      // spectate page sent the count itself.
      channel._emit('spectator-count-update', { count: 499 })
      await settle()
      expect(onCount).not.toHaveBeenCalled()

      channel._emit('spectator-count-update', signed('spectator-count-update', { count: 2 }))
      await settle()
      expect(onCount).toHaveBeenCalledTimes(1)
      expect(onCount).toHaveBeenCalledWith({ count: 2 })
    })
  })
})
