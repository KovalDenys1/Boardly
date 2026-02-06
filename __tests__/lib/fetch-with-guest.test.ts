/**
 * Unit tests for fetchWithGuest utility
 */

import { fetchWithGuest, getGuestHeaders, isGuestMode } from '@/lib/fetch-with-guest'

// Mock localStorage
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

// Mock global fetch
global.fetch = jest.fn()

describe('fetch-with-guest utility', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorageMock.clear()
            ; (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            })
    })

    describe('isGuestMode', () => {
        it('should return true when isGuest flag is set', () => {
            localStorageMock.setItem('isGuest', 'true')
            expect(isGuestMode()).toBe(true)
        })

        it('should return false when isGuest flag is not set', () => {
            expect(isGuestMode()).toBe(false)
        })

        it('should return false when isGuest is set to false', () => {
            localStorageMock.setItem('isGuest', 'false')
            expect(isGuestMode()).toBe(false)
        })
    })

    describe('getGuestHeaders', () => {
        it('should return guest headers when in guest mode', () => {
            localStorageMock.setItem('isGuest', 'true')
            localStorageMock.setItem('guestId', 'guest_123')
            localStorageMock.setItem('guestName', 'Test Guest')

            const headers = getGuestHeaders()

            expect(headers).toEqual({
                'X-Guest-Id': 'guest_123',
                'X-Guest-Name': 'Test Guest',
            })
        })

        it('should return empty object when not in guest mode', () => {
            const headers = getGuestHeaders()
            expect(headers).toEqual({})
        })

        it('should return empty object when guest data is incomplete', () => {
            localStorageMock.setItem('isGuest', 'true')
            localStorageMock.setItem('guestId', 'guest_123')
            // Missing guestName

            const headers = getGuestHeaders()
            expect(headers).toEqual({})
        })
    })

    describe('fetchWithGuest', () => {
        it('should add guest headers to fetch request', async () => {
            localStorageMock.setItem('isGuest', 'true')
            localStorageMock.setItem('guestId', 'guest_123')
            localStorageMock.setItem('guestName', 'Test Guest')

            await fetchWithGuest('/api/test')

            expect(global.fetch).toHaveBeenCalledWith('/api/test', {
                headers: {
                    'X-Guest-Id': 'guest_123',
                    'X-Guest-Name': 'Test Guest',
                },
            })
        })

        it('should merge guest headers with existing headers', async () => {
            localStorageMock.setItem('isGuest', 'true')
            localStorageMock.setItem('guestId', 'guest_123')
            localStorageMock.setItem('guestName', 'Test Guest')

            await fetchWithGuest('/api/test', {
                headers: {
                    'Content-Type': 'application/json',
                    'Custom-Header': 'value',
                },
            })

            expect(global.fetch).toHaveBeenCalledWith('/api/test', {
                headers: {
                    'Content-Type': 'application/json',
                    'Custom-Header': 'value',
                    'X-Guest-Id': 'guest_123',
                    'X-Guest-Name': 'Test Guest',
                },
            })
        })

        it('should work with Headers object', async () => {
            localStorageMock.setItem('isGuest', 'true')
            localStorageMock.setItem('guestId', 'guest_123')
            localStorageMock.setItem('guestName', 'Test Guest')

            const headers = new Headers()
            headers.set('Content-Type', 'application/json')

            await fetchWithGuest('/api/test', { headers })

            const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers
            expect(callHeaders.get('X-Guest-Id')).toBe('guest_123')
            expect(callHeaders.get('X-Guest-Name')).toBe('Test Guest')
            expect(callHeaders.get('Content-Type')).toBe('application/json')
        })

        it('should not add guest headers when not in guest mode', async () => {
            await fetchWithGuest('/api/test', {
                headers: {
                    'Content-Type': 'application/json',
                },
            })

            expect(global.fetch).toHaveBeenCalledWith('/api/test', {
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        })

        it('should handle request without init options', async () => {
            localStorageMock.setItem('isGuest', 'true')
            localStorageMock.setItem('guestId', 'guest_123')
            localStorageMock.setItem('guestName', 'Test Guest')

            await fetchWithGuest('/api/test')

            expect(global.fetch).toHaveBeenCalledWith('/api/test', {
                headers: {
                    'X-Guest-Id': 'guest_123',
                    'X-Guest-Name': 'Test Guest',
                },
            })
        })

        it('should pass through other fetch options', async () => {
            localStorageMock.setItem('isGuest', 'true')
            localStorageMock.setItem('guestId', 'guest_123')
            localStorageMock.setItem('guestName', 'Test Guest')

            await fetchWithGuest('/api/test', {
                method: 'POST',
                body: JSON.stringify({ data: 'test' }),
                credentials: 'include',
            })

            expect(global.fetch).toHaveBeenCalledWith('/api/test', {
                method: 'POST',
                body: JSON.stringify({ data: 'test' }),
                credentials: 'include',
                headers: {
                    'X-Guest-Id': 'guest_123',
                    'X-Guest-Name': 'Test Guest',
                },
            })
        })
    })
})
