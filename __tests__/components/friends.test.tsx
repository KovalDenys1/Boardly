import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Friends from '@/components/Friends'
import { showToast } from '@/lib/i18n-toast'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => {
    const channelObj = {
      on: function () { return channelObj },
      subscribe: function (cb?: (status: string) => void) { cb?.('SUBSCRIBED'); return channelObj },
      presenceState: () => ({}),
      track: jest.fn().mockResolvedValue(undefined),
    }
    return {
      channel: () => channelObj,
      removeChannel: jest.fn().mockResolvedValue(undefined),
    }
  },
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    errorFrom: jest.fn(),
  },
}))

jest.mock('@/components/LoadingSpinner', () => {
  function MockLoadingSpinner() {
    return <div>loading-spinner</div>
  }

  return MockLoadingSpinner
})

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>
const mockShowToast = showToast as jest.Mocked<typeof showToast>
const originalFetch = global.fetch
const mockFetch = jest.fn()
const clipboardWriteText = jest.fn()

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('Friends', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as any
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as any
  })

  beforeEach(() => {
    jest.clearAllMocks()

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    })

    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
    } as any)

    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          emailVerified: '2026-01-01T00:00:00.000Z',
        },
      },
      status: 'authenticated',
      update: jest.fn(),
    } as any)

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : String(input)

      if (url === '/api/friends') {
        return mockJsonResponse({
          friends: [
            {
              id: 'friend-1',
              username: 'Player Two',
              avatar: null,
              email: 'friend@example.com',
              publicProfileId: 'public-friend-1',
              friendshipId: 'friendship-1',
              friendsSince: '2026-01-02T00:00:00.000Z',
            },
          ],
        })
      }

      if (url === '/api/friends/request?type=received') {
        return mockJsonResponse({ requests: [] })
      }

      if (url === '/api/friends/request?type=sent') {
        return mockJsonResponse({ requests: [] })
      }

      if (url === '/api/user/friend-code') {
        return mockJsonResponse({
          friendCode: '12345',
          publicProfileId: 'public-user-1',
        })
      }

      return mockJsonResponse({})
    })
  })

  it('does not reload the whole block when switching internal tabs', async () => {
    render(<Friends />)

    await screen.findByText('profile.friends.myFriendCode')
    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(screen.queryByText('loading-spinner')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: /profile\.friends\.tabs\.requests/i })
    )

    expect(await screen.findByText('profile.friends.noRequests')).toBeTruthy()
    expect(screen.queryByText('loading-spinner')).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(4)

    fireEvent.click(
      screen.getByRole('button', { name: /profile\.friends\.tabs\.sent/i })
    )

    expect(await screen.findByText('profile.friends.noSentRequests')).toBeTruthy()
    expect(screen.queryByText('loading-spinner')).toBeNull()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
  })

  it('copies the friend code when the code card is clicked', async () => {
    clipboardWriteText.mockResolvedValue(undefined)

    render(<Friends />)

    await screen.findByText('12345')

    fireEvent.click(screen.getAllByRole('button', { name: 'profile.friends.copyCode' })[0])

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('12345')
    })

    expect(mockShowToast.success).toHaveBeenCalledWith('profile.friends.friendCodeCopied')
  })
})
