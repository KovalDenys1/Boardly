import {
  acquireLobbyChannel,
  __resetLobbyChannelsForTests,
} from '@/lib/lobby-channel-registry'

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

describe('lobby channel registry', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    fakeClient = createFakeSupabaseClient()
    __resetLobbyChannelsForTests()
  })

  afterEach(() => {
    jest.useRealTimers()
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

  it('delivers a broadcast to every consumer bound to that event', () => {
    const first = jest.fn()
    const second = jest.fn()

    acquireLobbyChannel(TOPIC, { events: { 'game-update': first } })
    acquireLobbyChannel(TOPIC, { events: { 'game-update': second } })

    fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', { move: 1 })

    expect(first).toHaveBeenCalledWith({ move: 1 })
    expect(second).toHaveBeenCalledWith({ move: 1 })
  })

  it('binds an event the first consumer never asked for', () => {
    const chat = jest.fn()

    acquireLobbyChannel(TOPIC, { events: { 'game-update': jest.fn() } })
    acquireLobbyChannel(TOPIC, { events: { 'chat-message': chat } })

    fakeClient.channelsByTopic.get(TOPIC)._emit('chat-message', { text: 'hi' })

    expect(chat).toHaveBeenCalledWith({ text: 'hi' })
  })

  it('keeps the channel alive while another consumer still holds it', () => {
    const survivor = jest.fn()
    acquireLobbyChannel(TOPIC, { events: { 'game-update': survivor } })
    const leaving = acquireLobbyChannel(TOPIC, { events: { 'game-update': jest.fn() } })

    leaving.release()
    jest.runAllTimers()

    expect(fakeClient.removeChannel).not.toHaveBeenCalled()

    fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', { move: 2 })
    expect(survivor).toHaveBeenCalledWith({ move: 2 })
  })

  it('stops delivering to a released consumer', () => {
    const released = jest.fn()
    acquireLobbyChannel(TOPIC, { events: { 'game-update': jest.fn() } })
    const handle = acquireLobbyChannel(TOPIC, { events: { 'game-update': released } })

    handle.release()
    fakeClient.channelsByTopic.get(TOPIC)._emit('game-update', { move: 3 })

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
})
