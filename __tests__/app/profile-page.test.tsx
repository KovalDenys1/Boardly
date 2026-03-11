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

const mockTranslate = (key: string) => key
const mockI18n = {
  language: 'en',
  changeLanguage: jest.fn().mockImplementation(async (nextLanguage: string) => {
    mockI18n.language = nextLanguage
  }),
  on: jest.fn(),
  off: jest.fn(),
}

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: mockTranslate,
    i18n: mockI18n,
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
    mockI18n.language = 'en'

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
            inAppNotifications: true,
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

      if (url.includes('/api/user/check-email')) {
        return mockJsonResponse({ available: true, email: 'new@example.com' })
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

  it('prefers the active i18n language over stale profile language storage', async () => {
    window.localStorage.setItem('language', 'ru')
    window.localStorage.setItem('i18nextLng', 'en')

    render(<ProfilePage />)

    const settingsTab = (await screen.findAllByRole('tab')).find(
      (tab) => tab.getAttribute('id') === 'profile-tab-settings'
    )
    expect(settingsTab).toBeDefined()
    if (!settingsTab) {
      throw new Error('Settings tab not found')
    }

    fireEvent.click(settingsTab)

    const comboboxes = await screen.findAllByRole('combobox')
    expect((comboboxes[0] as HTMLSelectElement).value).toBe('en')
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

  it('hides cancel and disables save when there are no profile changes', async () => {
    render(<ProfilePage />)

    const saveButton = await screen.findByRole('button', { name: 'profile.edit.save' })
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'profile.edit.cancel' })).toBeNull()
  })

  it('updates profile username via API and session update', async () => {
    render(<ProfilePage />)

    const usernameInput = await screen.findByLabelText('username-input')
    fireEvent.change(usernameInput, { target: { value: 'Player Two' } })

    fireEvent.click(screen.getByRole('button', { name: 'profile.edit.save' }))

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

  it('updates profile email via the form and requests verification', async () => {
    render(<ProfilePage />)

    const emailInput = await screen.findByLabelText('profile-email-input')
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/user/check-email?email=new%40example.com'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'profile.edit.save' }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/user/profile',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ email: 'new@example.com' }),
        })
      )
    })

    expect(mockShowToast.success).toHaveBeenCalledWith('toast.verificationSent')
  })

  it('keeps email draft in sync between the header editor and the profile form', async () => {
    render(<ProfilePage />)

    fireEvent.doubleClick(await screen.findByTitle('profile.inline.editEmail'))

    const inlineEmailInput = await screen.findByLabelText('inline-email-input')
    const profileEmailInput = await screen.findByLabelText('profile-email-input')

    fireEvent.change(inlineEmailInput, { target: { value: 'draft@example.com' } })
    expect((profileEmailInput as HTMLInputElement).value).toBe('draft@example.com')

    fireEvent.change(profileEmailInput, { target: { value: 'draft-2@example.com' } })
    expect((inlineEmailInput as HTMLInputElement).value).toBe('draft-2@example.com')
  })

  it('keeps username draft in sync between the header editor and the profile form', async () => {
    render(<ProfilePage />)

    fireEvent.doubleClick(await screen.findByTitle('profile.inline.editUsername'))

    const inlineUsernameInput = await screen.findByLabelText('inline-username-input')
    const profileUsernameInput = await screen.findByLabelText('username-input')

    fireEvent.change(inlineUsernameInput, { target: { value: 'DraftName' } })
    expect((profileUsernameInput as HTMLInputElement).value).toBe('DraftName')

    fireEvent.change(profileUsernameInput, { target: { value: 'DraftNameTwo' } })
    expect((inlineUsernameInput as HTMLInputElement).value).toBe('DraftNameTwo')
  })

  it('does not force a session update when the page regains visibility', async () => {
    render(<ProfilePage />)

    await screen.findByRole('heading', { name: 'profile.title' })
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/user/profile', { cache: 'no-store' })
    })

    mockSessionUpdate.mockClear()
    mockFetch.mockClear()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/user/profile', { cache: 'no-store' })
    })
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })
})
