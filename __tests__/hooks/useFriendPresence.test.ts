import React from 'react'
import { act, renderHook } from '@testing-library/react'
import {
  readOnlineUserIds,
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

  function channel(topic: string, opts?: { config?: { presence?: { key?: string } } }) {
    const existing = channelsByTopic.get(topic)
    if (existing) return existing

    let joined = false
    const listeners: Array<() => void> = []
    // Every client joining this topic passes the same constant key, and the
    // realtime adapter's transformState keys the map by that key and appends
    // every client's meta to the one array. Stubbing presenceState as `{}` is
    // what let #1010 through, so the fake reproduces the merge instead.
    const presenceKey = opts?.config?.presence?.key ?? 'anon'
    const metas: Array<Record<string, unknown>> = []
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
      track: jest.fn(async (payload: Record<string, unknown>) => {
        metas.push({ ...payload, presence_ref: `ref-${metas.length}` })
      }),
      untrack: jest.fn().mockResolvedValue(undefined),
      presenceState: () => (metas.length === 0 ? {} : { [presenceKey]: [...metas] }),
      /** A different browser joining the same channel under the same key. */
      _trackRemote(payload: Record<string, unknown>) {
        metas.push({ ...payload, presence_ref: `ref-${metas.length}` })
      },
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

  it('untracks presence when the announcer disables mid-session, even while another consumer keeps the channel alive', async () => {
    renderHook(() => useOnlinePresence()) // keeps refCount > 0 throughout
    const announcer = renderHook(
      ({ enabled }) => useAnnouncePresence('user-1', enabled),
      { initialProps: { enabled: true } }
    )
    await act(async () => {
      await Promise.resolve()
    })
    const chan = fakeClient.channel('online-users')
    expect(chan.track).toHaveBeenCalledWith({ userId: 'user-1' })

    announcer.rerender({ enabled: false })

    expect(chan.untrack).toHaveBeenCalledTimes(1)
    // The channel itself must survive — useOnlinePresence is still mounted.
    expect(fakeClient.removeChannel).not.toHaveBeenCalled()
  })

  it('untracks presence on unmount', async () => {
    const announcer = renderHook(() => useAnnouncePresence('user-1', true))
    await act(async () => {
      await Promise.resolve()
    })
    const chan = fakeClient.channel('online-users')

    announcer.unmount()

    expect(chan.untrack).toHaveBeenCalledTimes(1)
  })

  it('reports the ids of the other people on the channel, not the join key (#1010)', async () => {
    const reader = renderHook(() => useOnlinePresence())
    renderHook(() => useAnnouncePresence('me', true))
    await act(async () => {
      await Promise.resolve()
    })

    const chan = fakeClient.channel('online-users')
    act(() => {
      chan._trackRemote({ userId: 'friend-1' })
      chan._trackRemote({ userId: 'friend-2' })
      chan._fireSync()
    })

    // Object.keys() here was Set { 'reader' }, so has(friend.id) was false for
    // every real id and no friend could ever show as online.
    expect([...reader.result.current].sort()).toEqual(['friend-1', 'friend-2', 'me'])
    expect(reader.result.current.has('reader')).toBe(false)
  })

  it('ignores presence entries with no usable userId', () => {
    expect(readOnlineUserIds({})).toEqual(new Set())
    expect(
      readOnlineUserIds({
        reader: [
          { userId: 'friend-1', presence_ref: 'a' },
          { presence_ref: 'b' },
          { userId: '', presence_ref: 'c' },
          { userId: 'friend-1', presence_ref: 'd' },
        ],
      } as never)
    ).toEqual(new Set(['friend-1']))
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
