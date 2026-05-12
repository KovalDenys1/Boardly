import { act, render, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import MemoryLobbiesPage from '@/app/games/memory/lobbies/page'
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

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
  }),
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

function mockJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  } as unknown as Response
}

describe('Memory lobby list page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    postgresChangesCallback = undefined
    mockChannel.on.mockImplementation((_event: string, _filter: object, cb: () => void) => {
      postgresChangesCallback = cb
      return mockChannel
    })

    ;(useSession as jest.Mock).mockReturnValue({ status: 'authenticated' })
    ;(fetchWithGuest as jest.Mock).mockResolvedValue(mockJsonResponse({ lobbies: [] }))
  })

  it('loads memory lobbies, refreshes on Supabase Realtime updates, and cleans up on unmount', async () => {
    const { unmount } = render(<MemoryLobbiesPage />)

    await waitFor(() => {
      expect(fetchWithGuest).toHaveBeenCalledWith('/api/lobby?gameType=memory')
    })

    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-lobbies-memory')
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
