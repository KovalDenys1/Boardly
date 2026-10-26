import { act, renderHook, waitFor } from '@testing-library/react'
import { useLobbyChat, useLobbyChatHistory } from '@/app/lobby/[code]/hooks/useLobbyChat'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1', name: 'Alice' } }, status: 'authenticated' }),
}))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))

const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

/**
 * #1082: the chat route refuses a Sketch & Guess drawer or solver mid-round.
 * The sender's optimistic copy has to go too, or they believe the table read
 * something nobody else ever received.
 */
describe('useLobbyChat when the server refuses a message', () => {
  beforeEach(() => jest.clearAllMocks())

  it('takes the optimistic copy back when the server refuses it', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: 'SOLVER_CHAT_MUTED' }) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))

    act(() => {
      void result.current.sendChatMessage('it is a castle')
    })
    expect(result.current.chatMessages).toHaveLength(1)

    await waitFor(() => expect(result.current.chatMessages).toHaveLength(0))
  })

  it('keeps a message the server accepted', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))

    act(() => {
      void result.current.sendChatMessage('nice drawing')
    })
    await act(async () => {})

    expect(result.current.chatMessages).toHaveLength(1)
  })
})

// #1466: nobody posts before accepting the Terms of Use and the Community Rules.
describe('useLobbyChat and the terms', () => {
  const originalFetch = global.fetch

  beforeEach(() => jest.clearAllMocks())
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('asks for the terms when a send is refused for them, and hands the text back', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: 'TERMS_REQUIRED' }) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))
    expect(result.current.termsAccepted).toBeNull()

    let returned: string | null = null
    await act(async () => {
      returned = await result.current.sendChatMessage('hello there')
    })

    expect(returned).toBe('hello there')
    expect(result.current.termsAccepted).toBe(false)
    expect(result.current.chatMessages).toHaveLength(0)
  })

  it('hands nothing back for any other refusal, and leaves the terms alone', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: 'SOLVER_CHAT_MUTED' }) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))

    let returned: string | null = 'unset'
    await act(async () => {
      returned = await result.current.sendChatMessage('it is a castle')
    })

    expect(returned).toBeNull()
    expect(result.current.termsAccepted).toBeNull()
  })

  it('accepts the terms through the API and lets the composer back', async () => {
    mockFetch.mockImplementation(async (url) =>
      String(url) === '/api/user/accept-terms'
        ? ({ ok: true, status: 200, json: async () => ({ termsAcceptedAt: '2026-10-18T12:00:00.000Z' }) } as Response)
        : ({ ok: false, status: 403, json: async () => ({ code: 'TERMS_REQUIRED' }) } as Response)
    )
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))
    await act(async () => {
      await result.current.sendChatMessage('hello there')
    })
    expect(result.current.termsAccepted).toBe(false)

    let accepted = false
    await act(async () => {
      accepted = await result.current.acceptTerms()
    })

    expect(accepted).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('/api/user/accept-terms', expect.objectContaining({ method: 'POST' }))
    expect(result.current.termsAccepted).toBe(true)
  })

  it('keeps asking when accepting fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))
    act(() => result.current.mergeHistoryMessages([], { termsAccepted: false }))

    let accepted = true
    await act(async () => {
      accepted = await result.current.acceptTerms()
    })

    expect(accepted).toBe(false)
    expect(result.current.termsAccepted).toBe(false)
  })

  function useChatWithHistory() {
    const chat = useLobbyChat({ code: 'ABCD', isChatVisible: true })
    useLobbyChatHistory({ code: 'ABCD', isConnected: true, isReconnecting: false, mergeHistoryMessages: chat.mergeHistoryMessages })
    return chat
  }

  it('reads the viewer from the history, even with no messages yet', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], viewer: { termsAccepted: false } }),
    }) as typeof fetch
    const { result } = renderHook(() => useChatWithHistory())

    await waitFor(() => expect(result.current.termsAccepted).toBe(false))
  })

  it('leaves the terms unknown when the history carries no viewer', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'm1', userId: 'u2', username: 'Bob', message: 'hi', timestamp: 1 }] }),
    }) as typeof fetch
    const { result } = renderHook(() => useChatWithHistory())

    await waitFor(() => expect(result.current.chatMessages).toHaveLength(1))
    expect(result.current.termsAccepted).toBeNull()
  })

  it('does not take an accepted viewer back to unaccepted from a stale history read', () => {
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))
    act(() => result.current.mergeHistoryMessages([], { termsAccepted: true }))
    act(() => result.current.mergeHistoryMessages([], { termsAccepted: false }))
    expect(result.current.termsAccepted).toBe(true)
  })
})
