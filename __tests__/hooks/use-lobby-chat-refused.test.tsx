import { act, renderHook, waitFor } from '@testing-library/react'
import { useLobbyChat } from '@/app/lobby/[code]/hooks/useLobbyChat'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1', name: 'Alice' } }, status: 'authenticated' }),
}))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { info: jest.fn(), error: jest.fn() } }))

const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

/**
 * #1082: the chat route refuses a message that spells the Sketch & Guess word
 * while it is being drawn. The sender's optimistic copy has to go too, or they
 * believe the table read something nobody else ever received.
 */
describe('useLobbyChat when the server refuses a message', () => {
  beforeEach(() => jest.clearAllMocks())

  it('takes the optimistic copy back and says why when it gave the word away', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: 'WORD_IN_CHAT' }) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))

    act(() => result.current.sendChatMessage('it is a castle'))
    expect(result.current.chatMessages).toHaveLength(1)

    await waitFor(() => expect(result.current.chatMessages).toHaveLength(0))
    expect(showToast.info).toHaveBeenCalledWith('games.guess_my_drawing.game.wordInChat', undefined, undefined, {
      id: 'sketch-word-in-chat',
    })
  })

  it('keeps a message the server accepted', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
    const { result } = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: true }))

    act(() => result.current.sendChatMessage('nice drawing'))
    await act(async () => {})

    expect(result.current.chatMessages).toHaveLength(1)
    expect(showToast.info).not.toHaveBeenCalled()
  })
})
