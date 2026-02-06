/**
 * Unit tests for GuestContext
 */

import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { GuestProvider, useGuest } from '@/contexts/GuestContext'

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

describe('GuestContext', () => {
    beforeEach(() => {
        localStorageMock.clear()
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <GuestProvider>{children}</GuestProvider>
    )

    describe('useGuest hook', () => {
        it('should initialize with no guest data', () => {
            const { result } = renderHook(() => useGuest(), { wrapper })

            expect(result.current.isGuest).toBe(false)
            expect(result.current.guestId).toBeNull()
            expect(result.current.guestName).toBeNull()
        })

        it('should load guest data from localStorage on mount', () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

            const { result } = renderHook(() => useGuest(), { wrapper })

            expect(result.current.isGuest).toBe(true)
            expect(result.current.guestId).toBe('guest_123')
            expect(result.current.guestName).toBe('Test Guest')
        })

        it('should set guest mode with setGuestMode', () => {
            const { result } = renderHook(() => useGuest(), { wrapper })

            act(() => {
                result.current.setGuestMode('New Guest')
            })

            expect(result.current.isGuest).toBe(true)
            expect(result.current.guestId).toBeTruthy()
            expect(result.current.guestId).toMatch(/^guest-/)
            expect(result.current.guestName).toBe('New Guest')
            expect(localStorageMock.getItem('boardly_guest_id')).toMatch(/^guest-/)
            expect(localStorageMock.getItem('boardly_guest_name')).toBe('New Guest')
        })

        it('should clear guest mode with clearGuestMode', () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_123')
            localStorageMock.setItem('boardly_guest_name', 'Test Guest')

            const { result } = renderHook(() => useGuest(), { wrapper })

            act(() => {
                result.current.clearGuestMode()
            })

            expect(result.current.isGuest).toBe(false)
            expect(result.current.guestId).toBeNull()
            expect(result.current.guestName).toBeNull()
            expect(localStorageMock.getItem('boardly_guest_id')).toBeNull()
            expect(localStorageMock.getItem('boardly_guest_name')).toBeNull()
        })

        it('should return correct headers from getHeaders', () => {
            const { result } = renderHook(() => useGuest(), { wrapper })

            act(() => {
                result.current.setGuestMode('Header Test')
            })

            const headers = result.current.getHeaders()

            expect(headers['X-Guest-Id']).toMatch(/^guest-/)
            expect(headers['X-Guest-Name']).toBe('Header Test')
        })

        it('should return empty headers when not in guest mode', () => {
            const { result } = renderHook(() => useGuest(), { wrapper })

            const headers = result.current.getHeaders()

            expect(headers).toEqual({})
        })

        it('should generate unique guest ID with setGuestMode', () => {
            const { result: result1 } = renderHook(() => useGuest(), { wrapper })
            const { result: result2 } = renderHook(() => useGuest(), { wrapper })

            act(() => {
                result1.current.setGuestMode('Guest 1')
            })

            act(() => {
                result2.current.setGuestMode('Guest 2')
            })

            expect(result1.current.guestId).toBeTruthy()
            expect(result2.current.guestId).toBeTruthy()
            expect(result1.current.guestId).not.toBe(result2.current.guestId)
        })

        it('should persist guest data across hook re-renders', () => {
            const { result, rerender } = renderHook(() => useGuest(), { wrapper })

            act(() => {
                result.current.setGuestMode('Persistent Guest')
            })

            const persistedId = result.current.guestId

            rerender()

            expect(result.current.isGuest).toBe(true)
            expect(result.current.guestId).toBe(persistedId)
            expect(result.current.guestName).toBe('Persistent Guest')
        })
    })

    describe('GuestContext error handling', () => {
        it('should throw error when useGuest is used outside GuestProvider', () => {
            // Suppress console.error for this test
            const originalError = console.error
            console.error = jest.fn()

            expect(() => {
                renderHook(() => useGuest())
            }).toThrow('useGuest must be used within a GuestProvider')

            console.error = originalError
        })
    })
})
