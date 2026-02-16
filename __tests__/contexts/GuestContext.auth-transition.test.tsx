import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { GuestProvider, useGuest } from '@/contexts/GuestContext'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

const GUEST_ID_KEY = 'boardly_guest_id'
const GUEST_NAME_KEY = 'boardly_guest_name'
const GUEST_TOKEN_KEY = 'boardly_guest_token'

describe('GuestContext auth transitions', () => {
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
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  it('does not restore guest session after clearGuestMode when refresh request resolves late', async () => {
    window.localStorage.setItem(GUEST_ID_KEY, 'guest-1')
    window.localStorage.setItem(GUEST_NAME_KEY, 'Late Guest')
    window.localStorage.setItem(GUEST_TOKEN_KEY, 'token-1')

    let resolveFetch: ((value: any) => void) | null = null
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )

    const { result } = renderHook(() => useGuest(), { wrapper })

    await waitFor(() => {
      expect(result.current.isGuest).toBe(true)
    })

    act(() => {
      result.current.clearGuestMode()
    })

    expect(result.current.isGuest).toBe(false)
    expect(window.localStorage.getItem(GUEST_ID_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_NAME_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_TOKEN_KEY)).toBeNull()

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: async () => ({
          guestId: 'guest-1',
          guestName: 'Late Guest',
          guestToken: 'token-1',
        }),
      })
      await Promise.resolve()
    })

    expect(result.current.isGuest).toBe(false)
    expect(window.localStorage.getItem(GUEST_ID_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_NAME_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_TOKEN_KEY)).toBeNull()
  })

  it('clears guest mode when user session becomes authenticated', async () => {
    window.localStorage.setItem(GUEST_ID_KEY, 'guest-2')
    window.localStorage.setItem(GUEST_NAME_KEY, 'Auth Guest')
    window.localStorage.setItem(GUEST_TOKEN_KEY, 'token-2')

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        guestId: 'guest-2',
        guestName: 'Auth Guest',
        guestToken: 'token-2',
      }),
    })

    const { result, rerender } = renderHook(() => useGuest(), { wrapper })

    await waitFor(() => {
      expect(result.current.isGuest).toBe(true)
    })

    setSessionStatus('authenticated')
    rerender()

    await waitFor(() => {
      expect(result.current.isGuest).toBe(false)
    })

    expect(result.current.guestId).toBeNull()
    expect(result.current.guestName).toBeNull()
    expect(result.current.guestToken).toBeNull()
    expect(window.localStorage.getItem(GUEST_ID_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_NAME_KEY)).toBeNull()
    expect(window.localStorage.getItem(GUEST_TOKEN_KEY)).toBeNull()
  })
})

