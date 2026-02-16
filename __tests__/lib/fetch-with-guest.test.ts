/**
 * Unit tests for fetchWithGuest utility
 */

import { fetchWithGuest, getGuestHeaders, isGuestMode, getGuestData } from '@/lib/fetch-with-guest'

const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

global.fetch = jest.fn()

describe('fetch-with-guest utility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.clear()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
  })

  describe('isGuestMode', () => {
    it('returns true when token, id and name are present', () => {
      localStorageMock.setItem('boardly_guest_token', 'guest.jwt.token')
      localStorageMock.setItem('boardly_guest_id', 'guest_123')
      localStorageMock.setItem('boardly_guest_name', 'Test Guest')

      expect(isGuestMode()).toBe(true)
    })

    it('returns false when token is missing', () => {
      localStorageMock.setItem('boardly_guest_id', 'guest_123')
      localStorageMock.setItem('boardly_guest_name', 'Test Guest')

      expect(isGuestMode()).toBe(false)
    })
  })

  describe('getGuestHeaders', () => {
    it('returns X-Guest-Token when token exists', () => {
      localStorageMock.setItem('boardly_guest_token', 'guest.jwt.token')

      expect(getGuestHeaders()).toEqual({
        'X-Guest-Token': 'guest.jwt.token',
      })
    })

    it('returns empty object when token missing', () => {
      expect(getGuestHeaders()).toEqual({})
    })
  })

  describe('getGuestData', () => {
    it('returns full guest data only when all fields exist', () => {
      localStorageMock.setItem('boardly_guest_token', 'guest.jwt.token')
      localStorageMock.setItem('boardly_guest_id', 'guest_123')
      localStorageMock.setItem('boardly_guest_name', 'Test Guest')

      expect(getGuestData()).toEqual({
        guestToken: 'guest.jwt.token',
        guestId: 'guest_123',
        guestName: 'Test Guest',
      })
    })

    it('returns null when one of the guest fields is missing', () => {
      localStorageMock.setItem('boardly_guest_id', 'guest_123')
      localStorageMock.setItem('boardly_guest_name', 'Test Guest')

      expect(getGuestData()).toBeNull()
    })
  })

  describe('fetchWithGuest', () => {
    it('adds guest token header to request', async () => {
      localStorageMock.setItem('boardly_guest_token', 'guest.jwt.token')

      await fetchWithGuest('/api/test')

      const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers as Headers
      expect(callHeaders.get('X-Guest-Token')).toBe('guest.jwt.token')
    })

    it('merges guest token with existing headers', async () => {
      localStorageMock.setItem('boardly_guest_token', 'guest.jwt.token')

      await fetchWithGuest('/api/test', {
        headers: {
          'Content-Type': 'application/json',
          'Custom-Header': 'value',
        },
      })

      const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers as Headers
      expect(callHeaders.get('Content-Type')).toBe('application/json')
      expect(callHeaders.get('Custom-Header')).toBe('value')
      expect(callHeaders.get('X-Guest-Token')).toBe('guest.jwt.token')
    })

    it('keeps request options unchanged', async () => {
      localStorageMock.setItem('boardly_guest_token', 'guest.jwt.token')

      await fetchWithGuest('/api/test', {
        method: 'POST',
        body: JSON.stringify({ hello: 'world' }),
        credentials: 'include',
      })

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/test')
      expect(opts.method).toBe('POST')
      expect(opts.body).toBe(JSON.stringify({ hello: 'world' }))
      expect(opts.credentials).toBe('include')
    })

    it('does not add token header outside guest mode', async () => {
      await fetchWithGuest('/api/test', {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers as Headers
      expect(callHeaders.get('Content-Type')).toBe('application/json')
      expect(callHeaders.get('X-Guest-Token')).toBeNull()
    })
  })
})
