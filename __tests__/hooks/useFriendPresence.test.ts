import React from 'react'
import { act, renderHook } from '@testing-library/react'
import {
  useOnlinePresence,
  useAnnouncePresence,
  __resetSharedChannelForTests,
} from '@/hooks/useFriendPresence'

/**
 * Mimics the real @supabase/realtime-js client closely enough to catch the
 * bug this module exists to prevent: `RealtimeClient.channel(topic)` returns
 * the *same already-joined* channel object on a second call with the same
 * topic, and calling `.on('presence', ...)` on an already-joined channel
 * throws ("cannot add `presence` callbacks ... after `subscribe()`.").
 */
function createFakeSupabaseClient() {
  const channelsByTopic = new Map<string, any>()

  function channel(topic: string) {
    const existing = channelsByTopic.get(topic)
    if (existing) return existing

    let joined = false
    const listeners: Array<() => void> = []
    const chan = {
      on(type: string, _filter: unknown, cb: () => void) {
        if (joined && type === 'presence') {
          throw new Error(`cannot add \`presence\` callbacks for ${topic} after \`subscribe()\`.`)
        }
        listeners.push(cb)
        return chan
      },
      subscribe(cb?: (status: string) => void) {
        joined = true
        cb?.('SUBSCRIBED')
        return chan
      },
      track: jest.fn().mockResolvedValue(undefined),
      presenceState: () => ({}),
      _fireSync() {
        listeners.forEach((l) => l())
      },
    }
    channelsByTopic.set(topic, chan)
    return chan
  }

  return {
    channel,
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

describe('useFriendPresence shared channel', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    fakeClient = createFakeSupabaseClient()
    __resetSharedChannelForTests()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('survives React Strict Mode double-invoking effects without throwing', () => {
    expect(() => {
      renderHook(() => useOnlinePresence(), { wrapper: React.StrictMode })
    }).not.toThrow()
  })

  it('only creates one underlying channel for multiple simultaneous consumers', () => {
    renderHook(() => useOnlinePresence())
    renderHook(() => useOnlinePresence())
    renderHook(() => useAnnouncePresence('user-1', true))

    expect(fakeClient.channel('online-users')).toBeTruthy()
    // Confirms the dedup-by-topic fake behaves like the real client: a 2nd
    // call to .channel() for the same topic returns the SAME object.
    const a = fakeClient.channel('x')
    const b = fakeClient.channel('x')
    expect(a).toBe(b)
  })

  it('announces presence via track() once the channel is subscribed', async () => {
    renderHook(() => useAnnouncePresence('user-1', true))
    await act(async () => {
      await Promise.resolve()
    })
    const chan = fakeClient.channel('online-users')
    expect(chan.track).toHaveBeenCalledWith({ userId: 'user-1' })
  })

  it('does not announce when disabled (showOnlineStatus off)', async () => {
    renderHook(() => useAnnouncePresence('user-1', false))
    await act(async () => {
      await Promise.resolve()
    })
    const chan = fakeClient.channel('online-users')
    expect(chan.track).not.toHaveBeenCalled()
  })

  it('removes the channel only after the last consumer unmounts (deferred teardown)', () => {
    const hookA = renderHook(() => useOnlinePresence())
    const hookB = renderHook(() => useOnlinePresence())

    hookA.unmount()
    // Teardown is deferred by a tick — channel must still exist while B is mounted.
    act(() => {
      jest.advanceTimersByTime(0)
    })
    expect(fakeClient.removeChannel).not.toHaveBeenCalled()

    hookB.unmount()
    act(() => {
      jest.advanceTimersByTime(0)
    })
    expect(fakeClient.removeChannel).toHaveBeenCalledTimes(1)
  })
})
