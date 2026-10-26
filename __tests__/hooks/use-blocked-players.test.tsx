import React from 'react'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useBlockedPlayers } from '@/hooks/useBlockedPlayers'
import BlockListCacheSync from '@/components/BlockListCacheSync'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

const KEY = 'boardly_blocked_players'

type Row = { id: string; username: string; blockedAt: string }

const setStatus = (status: 'authenticated' | 'unauthenticated' | 'loading') => {
  mockUseSession.mockReturnValue({
    data: status === 'authenticated' ? ({ user: { id: 'me' } } as never) : null,
    status,
    update: jest.fn(),
  } as never)
}

const stored = (): Row[] | null => {
  const raw = window.localStorage.getItem(KEY)
  return raw === null ? null : (JSON.parse(raw) as Row[])
}

const seedDevice = (ids: string[]) => {
  window.localStorage.setItem(
    KEY,
    JSON.stringify(ids.map((id, index) => ({ id, username: `Name ${id}`, blockedAt: new Date(1_000 + index).toISOString() })))
  )
}

const reply = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

const mockFetch = jest.fn()

/** A server that remembers: POST adds, DELETE removes, GET lists newest first. */
function serveBlocks(initial: Row[] = [], options: { postStatus?: number; failDelete?: boolean } = {}) {
  const state = { rows: [...initial] }
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/user/blocks' && method === 'GET') return reply({ blocks: state.rows })
    if (url === '/api/user/blocks' && method === 'POST') {
      if (options.postStatus) return reply({ error: 'nope' }, options.postStatus)
      const { userIds } = JSON.parse(String(init?.body)) as { userIds: string[] }
      for (const id of userIds) {
        if (!state.rows.some((row) => row.id === id)) {
          state.rows.unshift({ id, username: `Name ${id}`, blockedAt: new Date().toISOString() })
        }
      }
      return reply({ blocks: state.rows })
    }
    if (url.startsWith('/api/user/blocks/') && method === 'DELETE') {
      if (options.failDelete) return reply({ error: 'nope' }, 500)
      state.rows = state.rows.filter((row) => `/api/user/blocks/${row.id}` !== url)
      return reply(null, 204)
    }
    throw new Error(`unexpected request ${method} ${url}`)
  })
  return state
}

const postCalls = () => mockFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
const getCalls = () =>
  mockFetch.mock.calls.filter(([url, init]) => url === '/api/user/blocks' && ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET')

describe('useBlockedPlayers', () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    ;(global as unknown as { fetch: unknown }).fetch = mockFetch
  })

  afterAll(() => {
    ;(global as unknown as { fetch: unknown }).fetch = originalFetch
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    mockFetch.mockReset()
    window.localStorage.clear()
    setStatus('unauthenticated')
  })

  describe('as a guest', () => {
    it('keeps a block on the device and takes it back on unblock', async () => {
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      let blocked: boolean | undefined
      await act(async () => {
        blocked = await result.current.block({ id: 'u2', username: 'Rival' })
      })

      expect(blocked).toBe(true)
      expect(result.current.blockedIds.has('u2')).toBe(true)
      expect(result.current.blocked).toEqual([{ id: 'u2', username: 'Rival', blockedAt: expect.any(String) }])
      expect(stored()).toEqual([{ id: 'u2', username: 'Rival', blockedAt: expect.any(String) }])

      let unblocked: boolean | undefined
      await act(async () => {
        unblocked = await result.current.unblock('u2')
      })

      expect(unblocked).toBe(true)
      expect(result.current.blocked).toEqual([])
      expect(result.current.blockedIds.size).toBe(0)
      expect(window.localStorage.getItem(KEY)).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('drops the oldest entry when the 201st is blocked', async () => {
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      for (let index = 0; index < 201; index += 1) {
        await act(async () => {
          await result.current.block({ id: `p${index}`, username: `Player ${index}` })
        })
      }

      const ids = (stored() ?? []).map((row) => row.id)
      expect(ids).toHaveLength(200)
      expect(ids).not.toContain('p0')
      expect(ids[0]).toBe('p1')
      expect(ids[199]).toBe('p200')
      expect(result.current.blocked).toHaveLength(200)
      expect(result.current.blockedIds.has('p0')).toBe(false)
      expect(result.current.blockedIds.has('p200')).toBe(true)
    })

    it('keeps the first block when the same player is blocked twice', async () => {
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      await act(async () => {
        await result.current.block({ id: 'u2', username: 'Rival' })
      })
      const first = stored()
      await act(async () => {
        await result.current.block({ id: 'u2', username: 'Rival again' })
      })

      expect(stored()).toEqual(first)
    })

    it('reads a list it did not write defensively', async () => {
      window.localStorage.setItem(KEY, JSON.stringify([{ id: 'ok', username: 'Fine', blockedAt: 'x' }, { id: 7 }, 'junk', null]))

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))
      expect([...result.current.blockedIds]).toEqual(['ok'])

      window.localStorage.setItem(KEY, '{not json')
      const second = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(second.result.current.ready).toBe(true))
      expect(second.result.current.blocked).toEqual([])
    })

    describe('when the device refuses the write', () => {
      const refuseWrites = (onlyKey?: string) => {
        const storage = window.localStorage
        const setItem = storage.setItem.bind(storage)
        jest.spyOn(storage, 'setItem').mockImplementation((key: string, value: string) => {
          if (onlyKey !== undefined && key !== onlyKey) return setItem(key, value)
          throw new DOMException('quota', 'QuotaExceededError')
        })
      }

      it('says false for a block when storage is unusable', async () => {
        const { result } = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(result.current.ready).toBe(true))
        refuseWrites()

        await act(async () => {
          await expect(result.current.block({ id: 'u2', username: 'Rival' })).resolves.toBe(false)
        })
        expect(result.current.blockedIds.has('u2')).toBe(false)
      })

      it('says false for a block that did not stay', async () => {
        const { result } = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(result.current.ready).toBe(true))
        refuseWrites(KEY)

        await act(async () => {
          await expect(result.current.block({ id: 'u2', username: 'Rival' })).resolves.toBe(false)
        })
        expect(result.current.blockedIds.has('u2')).toBe(false)
        expect(window.localStorage.getItem(KEY)).toBeNull()
      })

      it('says false for an unblock that did not stay', async () => {
        seedDevice(['a', 'b'])
        const { result } = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(result.current.ready).toBe(true))
        refuseWrites(KEY)

        await act(async () => {
          await expect(result.current.unblock('a')).resolves.toBe(false)
        })
        expect(result.current.blockedIds.has('a')).toBe(true)
        expect(stored()?.map((row) => row.id)).toEqual(['a', 'b'])
      })
    })

    it('follows a change made in another tab', async () => {
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      seedDevice(['a'])
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'something_else' }))
      })
      expect(result.current.blockedIds.size).toBe(0)

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
      })
      expect(result.current.blockedIds.has('a')).toBe(true)

      window.localStorage.clear()
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: null }))
      })
      expect(result.current.blockedIds.size).toBe(0)
    })

    it('stops listening to other tabs when unmounted', async () => {
      const remove = jest.spyOn(window, 'removeEventListener')
      const { result, unmount } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      unmount()

      expect(remove).toHaveBeenCalledWith('storage', expect.any(Function))
    })

    it('shows a change made by another instance, as a second chat on the page must', async () => {
      const first = renderHook(() => useBlockedPlayers())
      const second = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(second.result.current.ready).toBe(true))

      await act(async () => {
        await first.result.current.block({ id: 'u2', username: 'Rival' })
      })
      expect(second.result.current.blockedIds.has('u2')).toBe(true)

      await act(async () => {
        await first.result.current.unblock('u2')
      })
      expect(second.result.current.blockedIds.has('u2')).toBe(false)
    })
  })

  describe('while the session is loading', () => {
    it('is not ready, blocks nobody and neither reads the account nor hands the device list over', async () => {
      setStatus('loading')
      seedDevice(['a'])

      const { result } = renderHook(() => useBlockedPlayers())
      await act(async () => {})

      expect(result.current.ready).toBe(false)
      expect(result.current.blockedIds.size).toBe(0)
      expect(result.current.blocked).toEqual([])
      await act(async () => {
        await expect(result.current.block({ id: 'u2', username: 'Rival' })).resolves.toBe(false)
      })
      expect(mockFetch).not.toHaveBeenCalled()
      expect(stored()).toHaveLength(1)
    })
  })

  describe('signed in', () => {
    beforeEach(() => setStatus('authenticated'))

    it('loads the account list', async () => {
      serveBlocks([{ id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }])

      const { result } = renderHook(() => useBlockedPlayers())
      expect(result.current.ready).toBe(false)
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(result.current.blocked).toEqual([{ id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }])
      expect([...result.current.blockedIds]).toEqual(['u9'])
    })

    it('POSTs a block, showing it before the server answers', async () => {
      serveBlocks()
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      let blocked: boolean | undefined
      await act(async () => {
        blocked = await result.current.block({ id: 'u2', username: 'Rival' })
      })

      expect(blocked).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/user/blocks',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ userIds: ['u2'] }) })
      )
      expect(result.current.blockedIds.has('u2')).toBe(true)
      expect(window.localStorage.getItem(KEY)).toBeNull()
    })

    it('rolls a block back when the POST fails', async () => {
      let answer: (response: Response) => void = () => {}
      mockFetch.mockImplementation((url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Promise<Response>((resolve) => {
              answer = resolve
            })
          : Promise.resolve(reply({ blocks: [] }))
      )
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      let pending: Promise<boolean> = Promise.resolve(true)
      act(() => {
        pending = result.current.block({ id: 'u2', username: 'Rival' })
      })
      expect(result.current.blockedIds.has('u2')).toBe(true)

      await act(async () => {
        answer(reply({ error: 'nope' }, 500))
        await expect(pending).resolves.toBe(false)
      })
      expect(result.current.blockedIds.has('u2')).toBe(false)
    })

    it('rolls a block back when the request never arrives', async () => {
      mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') throw new TypeError('Failed to fetch')
        return reply({ blocks: [] })
      })
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      await act(async () => {
        await expect(result.current.block({ id: 'u2', username: 'Rival' })).resolves.toBe(false)
      })
      expect(result.current.blocked).toEqual([])
    })

    it('sends a DELETE on unblock', async () => {
      serveBlocks([{ id: 'u2', username: 'Rival', blockedAt: '2026-10-01T00:00:00.000Z' }])
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      await act(async () => {
        await expect(result.current.unblock('u2')).resolves.toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/user/blocks/u2', expect.objectContaining({ method: 'DELETE' }))
      expect(result.current.blockedIds.has('u2')).toBe(false)
    })

    it('puts the player back, in the same place, when the DELETE fails', async () => {
      serveBlocks(
        [
          { id: 'u3', username: 'Third', blockedAt: '2026-10-03T00:00:00.000Z' },
          { id: 'u2', username: 'Second', blockedAt: '2026-10-02T00:00:00.000Z' },
          { id: 'u1', username: 'First', blockedAt: '2026-10-01T00:00:00.000Z' },
        ],
        { failDelete: true }
      )
      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      await act(async () => {
        await expect(result.current.unblock('u2')).resolves.toBe(false)
      })

      expect(result.current.blocked.map((player) => player.id)).toEqual(['u3', 'u2', 'u1'])
    })

    it('reads the account list once for every instance that mounts together', async () => {
      serveBlocks([{ id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }])
      const first = renderHook(() => useBlockedPlayers())
      const second = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(first.result.current.ready).toBe(true))
      await waitFor(() => expect(second.result.current.ready).toBe(true))

      expect(getCalls()).toHaveLength(1)
      expect(second.result.current.blockedIds.has('u9')).toBe(true)
    })

    it('follows the list another instance reads, asking nothing itself, when told not to load', async () => {
      serveBlocks([{ id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }])
      const follower = renderHook(() => useBlockedPlayers({ load: false }))
      await act(async () => {})

      expect(getCalls()).toHaveLength(0)
      expect(follower.result.current.ready).toBe(false)
      expect(follower.result.current.accountId).toBe('me')

      renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(follower.result.current.blockedIds.has('u9')).toBe(true))
      expect(getCalls()).toHaveLength(1)
    })

    it('hands another instance the new list, so it updates without asking the server again', async () => {
      serveBlocks()
      const first = renderHook(() => useBlockedPlayers())
      const second = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(second.result.current.ready).toBe(true))
      await waitFor(() => expect(first.result.current.ready).toBe(true))
      const readsBefore = getCalls().length

      await act(async () => {
        await first.result.current.block({ id: 'u2', username: 'Rival' })
      })
      await waitFor(() => expect(second.result.current.blockedIds.has('u2')).toBe(true))

      await act(async () => {
        await first.result.current.unblock('u2')
      })
      await waitFor(() => expect(second.result.current.blockedIds.has('u2')).toBe(false))

      expect(getCalls()).toHaveLength(readsBefore)
    })

    it('says when the account list could not be read, blocks nothing meanwhile, and reads it again on retry', async () => {
      serveBlocks([{ id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }])
      const serve = mockFetch.getMockImplementation()!
      let readFails = true
      mockFetch.mockImplementation(async (url: string, init?: RequestInit) =>
        url === '/api/user/blocks' && (init?.method ?? 'GET') === 'GET' && readFails ? reply({ error: 'nope' }, 500) : serve(url, init)
      )

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))
      expect(result.current.failed).toBe(true)
      expect(result.current.unknown).toBe(true)
      expect(result.current.blockedIds.size).toBe(0)

      readFails = false
      act(() => result.current.retry())

      await waitFor(() => expect(result.current.failed).toBe(false))
      expect(result.current.unknown).toBe(false)
      expect([...result.current.blockedIds]).toEqual(['u9'])
    })

    describe('the block window (#1466 refuter)', () => {
      const CACHE = 'boardly_blocked_players_account:me'
      const OLD_FOE = { id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }
      const neverAnswer = () => mockFetch.mockImplementation(() => new Promise<Response>(() => {}))

      it('keeps the last list on the device for this account, so a later mount is ready before the server answers', async () => {
        serveBlocks([OLD_FOE])
        const first = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(first.result.current.blockedIds.has('u9')).toBe(true))
        expect(JSON.parse(window.localStorage.getItem(CACHE) ?? 'null')).toEqual([OLD_FOE])
        first.unmount()

        neverAnswer()
        const second = renderHook(() => useBlockedPlayers())
        expect(second.result.current.ready).toBe(true)
        expect([...second.result.current.blockedIds]).toEqual(['u9'])
      })

      it('starts a remount from the list a mounted instance holds, even when the device keeps nothing', async () => {
        serveBlocks([OLD_FOE])
        const holder = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(holder.result.current.blockedIds.has('u9')).toBe(true))
        window.localStorage.clear()

        neverAnswer()
        const remount = renderHook(() => useBlockedPlayers())
        expect(remount.result.current.ready).toBe(true)
        expect([...remount.result.current.blockedIds]).toEqual(['u9'])
      })

      it('keeps the cached list, flagged as failed, when the read fails', async () => {
        window.localStorage.setItem(CACHE, JSON.stringify([OLD_FOE]))
        mockFetch.mockResolvedValue(reply({ error: 'nope' }, 500))

        const { result } = renderHook(() => useBlockedPlayers())
        expect(result.current.ready).toBe(true)
        await waitFor(() => expect(result.current.failed).toBe(true))
        expect([...result.current.blockedIds]).toEqual(['u9'])
        expect(result.current.unknown).toBe(false)
      })

      it('calls a failed read unknown only when no list was known, an empty one included', async () => {
        window.localStorage.setItem(CACHE, '[]')
        mockFetch.mockResolvedValue(reply({ error: 'nope' }, 500))

        const { result } = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(result.current.failed).toBe(true))
        expect(result.current.unknown).toBe(false)
        expect(result.current.blockedIds.size).toBe(0)
      })

      it("does not write the old account's copy back when a block is answered after sign-out", async () => {
        serveBlocks()
        const serve = mockFetch.getMockImplementation()!
        let answerPost: (response: Response) => void = () => {}
        mockFetch.mockImplementation((url: string, init?: RequestInit) =>
          init?.method === 'POST' ? new Promise<Response>((resolve) => (answerPost = resolve)) : serve(url, init)
        )
        const { result, rerender } = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(result.current.ready).toBe(true))

        let blocking: Promise<boolean> = Promise.resolve(false)
        act(() => {
          blocking = result.current.block({ id: 'u2', username: 'Rival' })
        })
        setStatus('unauthenticated')
        rerender()
        await waitFor(() => expect(window.localStorage.getItem(CACHE)).toBeNull())

        await act(async () => {
          answerPost(reply({ error: 'nope' }, 500))
          await blocking
        })
        expect(window.localStorage.getItem(CACHE)).toBeNull()
      })

      it("forgets this account's cached list on sign-out, and any other account's on load", async () => {
        window.localStorage.setItem('boardly_blocked_players_account:someone-else', JSON.stringify([OLD_FOE]))
        serveBlocks([OLD_FOE])
        const { result, rerender } = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(result.current.blockedIds.has('u9')).toBe(true))
        expect(window.localStorage.getItem('boardly_blocked_players_account:someone-else')).toBeNull()
        expect(window.localStorage.getItem(CACHE)).not.toBeNull()

        setStatus('unauthenticated')
        rerender()
        await waitFor(() => expect(window.localStorage.getItem(CACHE)).toBeNull())
      })

      it('does not write the copy back when the chat is gone and the session ended before the answer', async () => {
        serveBlocks()
        const serve = mockFetch.getMockImplementation()!
        let answerPost: (response: Response) => void = () => {}
        mockFetch.mockImplementation((url: string, init?: RequestInit) =>
          init?.method === 'POST' ? new Promise<Response>((resolve) => (answerPost = resolve)) : serve(url, init)
        )
        const sync = render(<BlockListCacheSync />)
        const chat = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(chat.result.current.ready).toBe(true))

        let blocking: Promise<boolean> = Promise.resolve(false)
        act(() => {
          blocking = chat.result.current.block({ id: 'u2', username: 'Rival' })
        })
        // The header's sign-out navigates away: the chat unmounts, the always-mounted sync stays.
        chat.unmount()
        setStatus('unauthenticated')
        sync.rerender(<BlockListCacheSync />)
        expect(window.localStorage.getItem(CACHE)).toBeNull()

        await act(async () => {
          answerPost(reply({ error: 'nope' }, 500))
          await blocking
        })
        expect(window.localStorage.getItem(CACHE)).toBeNull()
      })

      it('shows a block in every instance before the server answers, and takes it back there when refused', async () => {
        serveBlocks()
        const serve = mockFetch.getMockImplementation()!
        let answerPost: (response: Response) => void = () => {}
        mockFetch.mockImplementation((url: string, init?: RequestInit) =>
          init?.method === 'POST' ? new Promise<Response>((resolve) => (answerPost = resolve)) : serve(url, init)
        )
        const first = renderHook(() => useBlockedPlayers())
        const second = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(first.result.current.ready).toBe(true))
        await waitFor(() => expect(second.result.current.ready).toBe(true))

        let blocking: Promise<boolean> = Promise.resolve(false)
        act(() => {
          blocking = first.result.current.block({ id: 'u2', username: 'Rival' })
        })
        await waitFor(() => expect(second.result.current.blockedIds.has('u2')).toBe(true))

        await act(async () => {
          answerPost(reply({ error: 'nope' }, 500))
          await blocking
        })
        expect(second.result.current.blockedIds.has('u2')).toBe(false)
        expect(first.result.current.blockedIds.has('u2')).toBe(false)
      })

      it('after a failed read, a block takes the whole list the server answers with and clears the failure', async () => {
        const state = serveBlocks([OLD_FOE])
        const serve = mockFetch.getMockImplementation()!
        mockFetch.mockImplementation(async (url: string, init?: RequestInit) =>
          url === '/api/user/blocks' && (init?.method ?? 'GET') === 'GET' ? reply({ error: 'nope' }, 500) : serve(url, init)
        )
        const { result } = renderHook(() => useBlockedPlayers())
        await waitFor(() => expect(result.current.failed).toBe(true))

        await act(async () => {
          await expect(result.current.block({ id: 'u2', username: 'Rival' })).resolves.toBe(true)
        })

        expect(result.current.failed).toBe(false)
        expect([...result.current.blockedIds].sort()).toEqual(['u2', 'u9'])
        expect(state.rows.map((row) => row.id).sort()).toEqual(['u2', 'u9'])
      })
    })

    it('stops showing the account list once signed out', async () => {
      serveBlocks([{ id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }])
      const { result, rerender } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.blockedIds.has('u9')).toBe(true))

      setStatus('unauthenticated')
      rerender()

      await waitFor(() => expect(result.current.ready).toBe(true))
      expect(result.current.blockedIds.size).toBe(0)
    })
  })

  describe('signing in with blocks made as a guest', () => {
    it('POSTs the device list once and clears the key', async () => {
      setStatus('loading')
      seedDevice(['a', 'b'])
      serveBlocks()

      const { result, rerender } = renderHook(() => useBlockedPlayers())
      await act(async () => {})
      expect(mockFetch).not.toHaveBeenCalled()

      setStatus('authenticated')
      rerender()
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(postCalls()).toHaveLength(1)
      expect(postCalls()[0][1]).toMatchObject({ body: JSON.stringify({ userIds: ['a', 'b'] }) })
      expect(window.localStorage.getItem(KEY)).toBeNull()
      expect([...result.current.blockedIds].sort()).toEqual(['a', 'b'])
    })

    it('hands over once with several instances and under React StrictMode', async () => {
      setStatus('authenticated')
      seedDevice(['a', 'b'])
      serveBlocks()
      const strict = ({ children }: { children: React.ReactNode }) => <React.StrictMode>{children}</React.StrictMode>

      const first = renderHook(() => useBlockedPlayers(), { wrapper: strict })
      const second = renderHook(() => useBlockedPlayers(), { wrapper: strict })
      await waitFor(() => expect(first.result.current.ready).toBe(true))
      await waitFor(() => expect(second.result.current.ready).toBe(true))

      expect(postCalls()).toHaveLength(1)
      expect(window.localStorage.getItem(KEY)).toBeNull()
      expect(second.result.current.blockedIds.has('a')).toBe(true)
    })

    it('keeps the device list for the next load when the hand-over fails, and keeps hiding it meanwhile', async () => {
      setStatus('authenticated')
      seedDevice(['a'])
      serveBlocks([], { postStatus: 500 })

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(postCalls()).toHaveLength(1)
      expect(stored()?.map((row) => row.id)).toEqual(['a'])
      expect([...result.current.blockedIds]).toEqual(['a'])

      mockFetch.mockClear()
      serveBlocks()
      const nextLoad = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(postCalls()).toHaveLength(1))
      await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull())
      expect(window.localStorage.getItem(KEY)).toBeNull()
      expect(nextLoad.result.current.blockedIds.has('a')).toBe(true)
    })

    it('leaves the account\'s own id out of the hand-over', async () => {
      setStatus('authenticated')
      seedDevice(['me', 'a'])
      serveBlocks()

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(postCalls()).toHaveLength(1)
      expect(postCalls()[0][1]).toMatchObject({ body: JSON.stringify({ userIds: ['a'] }) })
    })

    it('just clears a device list that holds only the account\'s own id', async () => {
      setStatus('authenticated')
      seedDevice(['me'])
      serveBlocks()

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(postCalls()).toHaveLength(0)
      expect(window.localStorage.getItem(KEY)).toBeNull()
    })

    it('drops a device list the server refuses with a 400, so it is not sent on every load', async () => {
      setStatus('authenticated')
      seedDevice(['a'])
      serveBlocks([], { postStatus: 400 })

      const first = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(first.result.current.ready).toBe(true))
      expect(postCalls()).toHaveLength(1)
      expect(window.localStorage.getItem(KEY)).toBeNull()

      const second = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(second.result.current.ready).toBe(true))
      expect(postCalls()).toHaveLength(1)
    })

    it.each([401, 429, 503])('keeps the device list when the hand-over is answered with %i', async (postStatus) => {
      setStatus('authenticated')
      seedDevice(['a'])
      serveBlocks([], { postStatus })

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(postCalls()).toHaveLength(1)
      expect(stored()?.map((row) => row.id)).toEqual(['a'])
    })

    it('keeps the device list when the request never arrives', async () => {
      setStatus('authenticated')
      seedDevice(['a'])
      mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') throw new TypeError('Failed to fetch')
        return reply({ blocks: [] })
      })

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(stored()?.map((row) => row.id)).toEqual(['a'])
    })

    it('sends nothing when the device list is empty', async () => {
      setStatus('authenticated')
      serveBlocks()

      const { result } = renderHook(() => useBlockedPlayers())
      await waitFor(() => expect(result.current.ready).toBe(true))

      expect(postCalls()).toHaveLength(0)
    })
  })
})
