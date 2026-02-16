import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { GuestProvider, useGuest } from '@/contexts/GuestContext'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

const GUEST_ID_KEY = 'boardly_guest_id'
const GUEST_NAME_KEY = 'boardly_guest_name'
const GUEST_TOKEN_KEY = 'boardly_guest_token'

describe('GuestContext', () => {
  const originalFetch = global.fetch
  const mockFetch = jest.fn()

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <GuestProvider>{children}</GuestProvider>
  )

  const setSessionStatus = (status: 'authenticated' | 'unauthenticated' | 'loading') => {
    mockUseSession.mockReturnValue({
      data: status === 'authenticated' ? ({ user: { id: 'user-1' } } as any) : null,
      status,
      update: jest.fn(),
    } as any)
  }

  beforeAll(() => {
    ;(global as any).fetch = mockFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
    setSessionStatus('unauthenticated')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        guestId: 'guest-new',
        guestName: 'Guest User',
        guestToken: 'guest.jwt.token',
      }),
    })
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  it('initializes with no guest data', () => {
    const { result } = renderHook(() => useGuest(), { wrapper })

    expect(result.current.isGuest).toBe(false)
    expect(result.current.guestId).toBeNull()
    expect(result.current.guestName).toBeNull()
    expect(result.current.guestToken).toBeNull()
  })

  it('loads guest data from localStorage and refreshes token', async () => {
    window.localStorage.setItem(GUEST_ID_KEY, 'guest-1')
    window.localStorage.setItem(GUEST_NAME_KEY, 'Stored Guest')
    window.localStorage.setItem(GUEST_TOKEN_KEY, 'stored.token')

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        guestId: 'guest-1',
        guestName: 'Stored Guest',
        guestToken: 'refreshed.token',
      }),
    })

    const { result } = renderHook(() => useGuest(), { wrapper })

    await waitFor(() => {
      expect(result.current.isGuest).toBe(true)
    })

    await waitFor(() => {
      expect(window.localStorage.getItem(GUEST_TOKEN_KEY)).toBe('refreshed.token')
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/guest-session', expect.any(Object))
  })

  it('creates guest session via setGuestMode and persists it', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        guestId: 'guest-42',
        guestName: 'New Guest',
        guestToken: 'token-42',
      }),
    })

    const { result } = renderHook(() => useGuest(), { wrapper })

    await act(async () => {
      await result.current.setGuestMode('New Guest')
    })

    expect(result.current.isGuest).toBe(true)
    expect(result.current.guestId).toBe('guest-42')
    expect(result.current.guestName).toBe('New Guest')
    expect(result.current.guestToken).toBe('token-42')

    expect(window.localStorage.getItem(GUEST_ID_KEY)).toBe('guest-42')
    expect(window.localStorage.getItem(GUEST_NAME_KEY)).toBe('New Guest')
    expect(window.localStorage.getItem(GUEST_TOKEN_KEY)).toBe('token-42')
  })

  it('returns token header from getHeaders in guest mode', async () => {
    const { result } = renderHook(() => useGuest(), { wrapper })

    await act(async () => {
      await result.current.setGuestMode('Header Guest', {
        guestId: 'guest-header',
        guestToken: 'header.token',
      })
    })

    expect(result.current.getHeaders()).toEqual({
      'X-Guest-Token': 'header.token',
    })
  })

  it('clears guest mode and local storage', async () => {
    const { result } = renderHook(() => useGuest(), { wrapper })

    await act(async () => {
      await result.current.setGuestMode('Clear Guest', {
        guestId: 'guest-clear',
        guestToken: 'clear.token',
      })
    })

    act(() => {
      result.current.clearGuestMode()
    })

    expect(result.current.isGuest).toBe(false)
    expect(result.current.guestId).toBeNull()
    expect(result.current.guestName).toBeNull()
    expect(result.current.guestToken).toBeNull()

    expect(window.localStorage.getItem(GUEST_ID_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_NAME_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_TOKEN_KEY)).toBeNull()
  })

  it('throws when useGuest is called outside provider', () => {
    const originalError = console.error
    console.error = jest.fn()

    expect(() => renderHook(() => useGuest())).toThrow('useGuest must be used within a GuestProvider')

    console.error = originalError
  })
})
