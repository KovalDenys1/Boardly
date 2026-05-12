import { act, render, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import SpyLobbiesPage from '@/app/games/spy/lobbies/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const mockPush = jest.fn()
let postgresChangesCallback: (() => void) | undefined = undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChannel: any = {
  on: jest.fn((_event: string, _filter: object, cb: () => void) => {
    postgresChangesCallback = cb
    return mockChannel
  }),
  subscribe: jest.fn().mockReturnThis(),
}
const mockSupabaseClient = {
  channel: jest.fn().mockReturnValue(mockChannel),
  removeChannel: jest.fn().mockResolvedValue({}),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => mockSupabaseClient),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
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

describe('Spy lobby list page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    postgresChangesCallback = undefined
    mockChannel.on.mockImplementation((_event: string, _filter: object, cb: () => void) => {
      postgresChangesCallback = cb
      return mockChannel
    })

    ;(useSession as jest.Mock).mockReturnValue({ status: 'authenticated' })
    ;(fetchWithGuest as jest.Mock).mockResolvedValue(
      mockJsonResponse({ lobbies: [] })
    )
  })

  it('refreshes lobbies on Supabase Realtime update and cleans up subscription', async () => {
    const { unmount } = render(<SpyLobbiesPage />)

    await waitFor(() => {
      expect(fetchWithGuest).toHaveBeenCalledTimes(1)
    })

    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-lobbies-guess_the_spy')
    expect(mockChannel.subscribe).toHaveBeenCalled()
    expect(typeof postgresChangesCallback).toBe('function')

    act(() => {
      postgresChangesCallback?.()
    })

    await waitFor(() => {
      expect(fetchWithGuest).toHaveBeenCalledTimes(2)
    })

    unmount()

    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel)
  })
})
