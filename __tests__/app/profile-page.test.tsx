import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ProfilePage from '@/app/profile/page'
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
    i18n: { language: 'en' },
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    errorFrom: jest.fn(),
  },
}))

jest.mock('@/components/UsernameInput', () => {
  return function MockUsernameInput({
    value,
    onChange,
    onAvailabilityChange,
  }: {
    value: string
    onChange: (next: string) => void
    onAvailabilityChange?: (available: boolean) => void
  }) {
    React.useEffect(() => {
      onAvailabilityChange?.(true)
    }, [onAvailabilityChange])

    return (
      <input
        aria-label="username-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
})

jest.mock('@/components/GameHistory', () => {
  function MockGameHistory() {
    return <div>mock-game-history</div>
  }

  return MockGameHistory
})

jest.mock('@/components/Friends', () => {
  function MockFriends() {
    return <div>mock-friends</div>
  }

  return MockFriends
})

jest.mock('@/components/PlayerStatsDashboard', () => {
  function MockPlayerStatsDashboard({ userId }: { userId: string }) {
    return <div>mock-stats-dashboard:{userId}</div>
  }

  return MockPlayerStatsDashboard
})

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>
const mockShowToast = showToast as jest.Mocked<typeof showToast>

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('ProfilePage', () => {
  const mockRouterReplace = jest.fn()
  const mockRouterPush = jest.fn()
  const mockSessionUpdate = jest.fn().mockResolvedValue({})
  const originalFetch = global.fetch
  const mockFetch = jest.fn()
  const baseProfileUser = {
    id: 'user-1',
    username: 'Player One',
    email: 'user@example.com',
    pendingEmail: null,
    image: null,
    emailVerified: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    publicProfileId: 'public-user-1',
    friendsCount: 4,
    gamesPlayed: 12,
    linkedAccountsCount: 0,
  }

  beforeAll(() => {
    ;(global as any).fetch = mockFetch
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/profile')

    mockUseRouter.mockReturnValue({
      replace: mockRouterReplace,
      push: mockRouterPush,
      refresh: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
    } as any)

    mockUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'Player One',
          emailVerified: new Date('2026-01-01T00:00:00.000Z'),
        },
      },
      update: mockSessionUpdate,
    } as any)

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/user/linked-accounts')) {
        return mockJsonResponse({ linkedAccounts: {} })
      }

      if (url.includes('/api/user/notification-preferences')) {
        if (method === 'PUT') {
          return mockJsonResponse({ success: true })
        }
        return mockJsonResponse({
          preferences: {
            gameInvites: true,
            turnReminders: true,
            friendRequests: true,
            friendAccepted: true,
            unsubscribedAll: false,
          },
        })
      }

      if (url.includes('/api/user/profile') && method === 'PATCH') {
        const payload = JSON.parse(String(init?.body || '{}'))
        return mockJsonResponse({
          success: true,
          user: {
            ...baseProfileUser,
            username: payload.username || baseProfileUser.username,
            pendingEmail: payload.email || null,
          },
        })
      }

      if (url.includes('/api/user/profile') && method === 'GET') {
        return mockJsonResponse({ user: baseProfileUser })
      }

      return mockJsonResponse({})
    })
  })

  it('opens tab from query string', async () => {
    window.history.replaceState({}, '', '/profile?tab=stats')

    render(<ProfilePage />)

    expect(await screen.findByText('mock-stats-dashboard:user-1')).toBeTruthy()
    expect(screen.queryByText('mock-game-history')).toBeNull()
  })

  it('updates tab query param when switching tabs', async () => {
    render(<ProfilePage />)

    const tabs = await screen.findAllByRole('tab')
    const historyTab = tabs.find((tab) => tab.getAttribute('id') === 'profile-tab-history')
    expect(historyTab).toBeDefined()
    if (!historyTab) {
      throw new Error('History tab not found')
    }
    fireEvent.click(historyTab)

    await waitFor(() => {
      expect(window.location.search).toContain('tab=history')
    })
    expect(screen.getByText('mock-game-history')).toBeTruthy()
  })

  it('updates profile username via API and session update', async () => {
    render(<ProfilePage />)

    const usernameInput = await screen.findByLabelText('username-input')
    fireEvent.change(usernameInput, { target: { value: 'Player Two' } })

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/user/profile',
        expect.objectContaining({
          method: 'PATCH',
        })
      )
    })

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      user: {
        name: 'Player Two',
        username: 'Player Two',
      },
    })
    expect(mockShowToast.success).toHaveBeenCalledWith('toast.profileUpdated')
  })
})
