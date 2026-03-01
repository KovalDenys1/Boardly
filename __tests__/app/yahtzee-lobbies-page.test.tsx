import { act, render, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { io } from 'socket.io-client'
import YahtzeeLobbiesPage from '@/app/games/yahtzee/lobbies/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'

const mockPush = jest.fn()
let socketHandlers: Record<string, (() => void) | undefined> = {}
let mockSocket: {
  connected: boolean
  on: jest.Mock
  emit: jest.Mock
  disconnect: jest.Mock
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  getBrowserSocketUrl: jest.fn(() => 'http://localhost:3001'),
}))

jest.mock('@/lib/socket-client-auth', () => ({
  resolveSocketClientAuth: jest.fn(),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
  }),
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

function mockJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  } as unknown as Response
}

describe('Yahtzee lobby list page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    socketHandlers = {}
    mockSocket = {
      connected: true,
      on: jest.fn((event: string, handler: () => void) => {
        socketHandlers[event] = handler
      }),
      emit: jest.fn(),
      disconnect: jest.fn(),
    }

    ;(useSession as jest.Mock).mockReturnValue({ status: 'authenticated' })
    ;(io as jest.Mock).mockReturnValue(mockSocket)
    ;(resolveSocketClientAuth as jest.Mock).mockResolvedValue({
      authPayload: {},
      queryPayload: {},
    })
    ;(fetchWithGuest as jest.Mock).mockResolvedValue(
      mockJsonResponse({ lobbies: [] })
    )
  })

  it('refreshes lobbies on socket update and cleans up subscription', async () => {
    const { unmount } = render(<YahtzeeLobbiesPage />)

    await waitFor(() => {
      expect(fetchWithGuest).toHaveBeenCalledTimes(1)
    })

    expect(io).toHaveBeenCalled()
    expect(typeof socketHandlers['lobby-list-update']).toBe('function')

    act(() => {
      socketHandlers['lobby-list-update']?.()
    })

    await waitFor(() => {
      expect(fetchWithGuest).toHaveBeenCalledTimes(2)
    })

    unmount()

    expect(mockSocket.emit).toHaveBeenCalledWith('leave-lobby-list')
    expect(mockSocket.disconnect).toHaveBeenCalled()
  })
})
