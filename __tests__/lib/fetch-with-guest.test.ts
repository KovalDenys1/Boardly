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

describe.skip('fetch-with-guest utility', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorageMock.clear()
            ; (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            })
    })

    describe('isGuestMode', () => {
        it('should return true when guest data is set', () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')
            expect(isGuestMode()).toBe(true)
        })

        it('should return false when guest data is not set', () => {
            expect(isGuestMode()).toBe(false)
        })

        it('should return false when only guest id is set', () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            expect(isGuestMode()).toBe(false)
        })
    })

    describe('getGuestHeaders', () => {
        it('should return guest headers when guest data is set', () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

            const headers = getGuestHeaders()

            expect(headers).toEqual({
                'X-Guest-Id': 'guest_123',
                'X-Guest-Name': 'Test Guest',
            })
        })

        it('should return empty object when guest data is not set', () => {
            const headers = getGuestHeaders()
            expect(headers).toEqual({})
        })

        it('should return empty object when guest data is incomplete', () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            // Missing boardly_guest_name

            const headers = getGuestHeaders()
            expect(headers).toEqual({})
        })
    })

    describe('fetchWithGuest', () => {
        it('should add guest headers to fetch request', async () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

            await fetchWithGuest('/api/test')

            const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers
            expect(callHeaders).toBeInstanceOf(Headers)
            expect(callHeaders.get('X-Guest-Id')).toBe('guest_123')
            expect(callHeaders.get('X-Guest-Name')).toBe('Test Guest')
        })

        it('should merge guest headers with existing headers', async () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

            await fetchWithGuest('/api/test', {
                headers: {
                    'Content-Type': 'application/json',
                    'Custom-Header': 'value',
                },
            })

            const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers
            expect(callHeaders).toBeInstanceOf(Headers)
            expect(callHeaders.get('Content-Type')).toBe('application/json')
            expect(callHeaders.get('Custom-Header')).toBe('value')
            expect(callHeaders.get('X-Guest-Id')).toBe('guest_123')
            expect(callHeaders.get('X-Guest-Name')).toBe('Test Guest')
        })

        it('should work with Headers object', async () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

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

            const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers
            expect(callHeaders).toBeInstanceOf(Headers)
            expect(callHeaders.get('Content-Type')).toBe('application/json')
            expect(callHeaders.get('X-Guest-Id')).toBeNull()
            expect(callHeaders.get('X-Guest-Name')).toBeNull()
        })

        it('should handle request without init options', async () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

            await fetchWithGuest('/api/test')

            const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers
            expect(callHeaders).toBeInstanceOf(Headers)
            expect(callHeaders.get('X-Guest-Id')).toBe('guest_123')
            expect(callHeaders.get('X-Guest-Name')).toBe('Test Guest')
        })

        it('should pass through other fetch options', async () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

            await fetchWithGuest('/api/test', {
                method: 'POST',
                body: JSON.stringify({ data: 'test' }),
                credentials: 'include',
            })

            const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
            expect(url).toBe('/api/test')
            expect(opts.method).toBe('POST')
            expect(opts.body).toBe(JSON.stringify({ data: 'test' }))
            expect(opts.credentials).toBe('include')
            expect(opts.headers.get('X-Guest-Id')).toBe('guest_123')
            expect(opts.headers.get('X-Guest-Name')).toBe('Test Guest')
        })
    })
})
