import { act, renderHook, waitFor } from '@testing-library/react'
import { useLobbyChat } from '@/app/(site)/lobby/[code]/hooks/useLobbyChat'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { playCue } from '@/lib/sound-engine'
import type { ChatMessagePayload } from '@/types/game'

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: true, guestToken: 't', guestId: 'guest-me', guestName: 'Me' }),
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

// Without text it is an announcement, which the chat then fetches (#801).
const message = (id: string, userId: string, text?: string) =>
  ({
    id,
    userId,
    username: userId,
    ...(text === undefined ? {} : { message: text }),
    timestamp: 1,
  }) as ChatMessagePayload

/**
 * #1466: a blocked player's messages are hidden in the chat, so they must not raise the unread
 * badge or play the message sound either. The viewer here is a guest, whose list is on the device.
 */
describe('useLobbyChat and blocked players', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
    window.localStorage.setItem(
      'boardly_blocked_players',
      JSON.stringify([{ id: 'blocked', username: 'Troll', blockedAt: '2026-10-18T12:00:00.000Z' }])
    )
  })

  const sound = playCue as jest.MockedFunction<typeof playCue>

  async function mountHidden() {
    const hook = renderHook(() => useLobbyChat({ code: 'ABCD', isChatVisible: false }))
    // Let the block list load from the device.
    await act(async () => {})
    return { ...hook, sound }
  }

  it('counts and sounds another player, but not a blocked one, when the message arrives with its text', async () => {
    const { result, sound } = await mountHidden()

    act(() => result.current.onChatMessage(message('m1', 'blocked', 'buy gold')))
    expect(result.current.unreadCount).toBe(0)
    expect(sound).not.toHaveBeenCalled()

    act(() => result.current.onChatMessage(message('m2', 'friend', 'gg')))
    expect(result.current.unreadCount).toBe(1)
    expect(sound).toHaveBeenCalledTimes(1)
    expect(sound).toHaveBeenCalledWith('chat.incoming')
  })

  it('looks at every fetched message, not only the last, when the announcement carries no text', async () => {
    const { result, sound } = await mountHidden()

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [message('m1', 'blocked', 'buy gold')] }) } as Response)
    act(() => result.current.onChatMessage(message('m1', 'blocked')))
    await waitFor(() => expect(result.current.chatMessages).toHaveLength(1))
    expect(result.current.unreadCount).toBe(0)
    expect(sound).not.toHaveBeenCalled()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [message('m2', 'friend', 'gg'), message('m3', 'blocked', 'buy more gold')] }),
    } as Response)
    act(() => result.current.onChatMessage(message('m3', 'blocked')))
    await waitFor(() => expect(result.current.chatMessages).toHaveLength(3))
    expect(result.current.unreadCount).toBe(1)
    expect(sound).toHaveBeenCalledTimes(1)
    expect(sound).toHaveBeenCalledWith('chat.incoming')
  })
})
