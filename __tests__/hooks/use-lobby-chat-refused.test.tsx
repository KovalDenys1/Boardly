import { act, renderHook, waitFor } from '@testing-library/react'
import { useLobbyChat } from '@/app/lobby/[code]/hooks/useLobbyChat'
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

    act(() => result.current.sendChatMessage('it is a castle'))
    expect(result.current.chatMessages).toHaveLength(1)

    await waitFor(() => expect(result.current.chatMessages).toHaveLength(0))
  })

  it('keeps a message the server accepted', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))

    act(() => result.current.sendChatMessage('nice drawing'))
    await act(async () => {})

    expect(result.current.chatMessages).toHaveLength(1)
  })
})
