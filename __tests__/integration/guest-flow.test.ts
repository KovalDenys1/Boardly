/**
 * Integration tests for complete guest user flow
 * These tests verify the end-to-end guest experience
 */

import { getOrCreateGuestUser, cleanupOldGuests } from '@/lib/guest-helpers'
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

// Mock Prisma
jest.mock('@/lib/db', () => ({
    prisma: {
        users: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            deleteMany: jest.fn(),
        },
        lobbies: {
            create: jest.fn(),
        },
        games: {
            create: jest.fn(),
        },
        players: {
            create: jest.fn(),
        },
    },
}))

jest.mock('@/lib/logger', () => ({
    apiLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}))

import { prisma } from '@/lib/db'

describe('Guest User Flow - Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorageMock.clear()
    })

    describe('Complete guest journey', () => {
        it('should complete full guest registration and setup flow', async () => {
            const guestId = 'guest_integration_test'
            const guestName = 'Integration Test Guest'

            // Step 1: User clicks "Play as Guest" and enters name
            localStorageMock.setItem('boardly_guest_id', guestId)
            localStorageMock.setItem('boardly_guest_name', guestName)

            // Verify localStorage state
            expect(isGuestMode()).toBe(true)
            const headers = getGuestHeaders() as Record<string, string>
            expect(headers['X-Guest-Id']).toBe(guestId)
            expect(headers['X-Guest-Name']).toBe(guestName)

                // Step 2: Backend creates guest user in database
                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(null)
                ; (prisma.users.create as jest.Mock).mockResolvedValue({
                    id: guestId,
                    username: guestName,
                    email: `guest-${guestId}@boardly.guest`,
                    isGuest: true,
                    lastActiveAt: new Date(),
                })

            const user = await getOrCreateGuestUser(guestId, guestName)

            expect(user.id).toBe(guestId)
            expect(user.isGuest).toBe(true)
            expect(user.username).toBe(guestName)
            expect(prisma.users.create).toHaveBeenCalledWith({
                data: {
                    id: guestId,
                    username: guestName,
                    email: `guest-${guestId}@boardly.guest`,
                    isGuest: true,
                    lastActiveAt: expect.any(Date),
                },
            })

            // Step 3: Guest navigates and fetchWithGuest automatically adds headers
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            })

            await fetchWithGuest('/api/lobby', {
                method: 'POST',
                body: JSON.stringify({ name: 'Test Lobby' }),
            })

            const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
            expect(url).toBe('/api/lobby')
            expect(opts.method).toBe('POST')
            expect(opts.headers).toBeInstanceOf(Headers)
            expect(opts.headers.get('X-Guest-Id')).toBe(guestId)
            expect(opts.headers.get('X-Guest-Name')).toBe(guestName)
        })

        it('should update guest activity timestamp on subsequent API calls', async () => {
            const guestId = 'guest_active_test'
            const guestName = 'Active Guest'
            const oldDate = new Date(Date.now() - 3600000) // 1 hour ago

            // Guest already exists in database
            const existingGuest = {
                id: guestId,
                username: guestName,
                email: `guest-${guestId}@boardly.guest`,
                isGuest: true,
                lastActiveAt: oldDate,
            }

                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(existingGuest)
                ; (prisma.users.update as jest.Mock).mockResolvedValue({
                    ...existingGuest,
                    lastActiveAt: new Date(),
                })

            // Multiple API calls should update lastActiveAt
            await getOrCreateGuestUser(guestId, guestName)
            await getOrCreateGuestUser(guestId, guestName)
            await getOrCreateGuestUser(guestId, guestName)

            // Should have updated timestamp for each call
            expect(prisma.users.update).toHaveBeenCalledTimes(3)
            expect(prisma.users.update).toHaveBeenCalledWith({
                where: { id: guestId },
                data: {
                    lastActiveAt: expect.any(Date),
                    username: guestName,
                },
            })
        })

        it('should cleanup inactive guests after 24 hours', async () => {
            // Simulate cleanup job running
            ; (prisma.users.deleteMany as jest.Mock).mockResolvedValue({ count: 10 })

            const deletedCount = await cleanupOldGuests()

            expect(deletedCount).toBe(10)
            expect(prisma.users.deleteMany).toHaveBeenCalledWith({
                where: {
                    isGuest: true,
                    lastActiveAt: {
                        lt: expect.any(Date),
                    },
                },
            })

            // Verify the cutoff date is approximately 24 hours ago
            const call = (prisma.users.deleteMany as jest.Mock).mock.calls[0][0]
            const cutoffDate = call.where.lastActiveAt.lt
            const expectedCutoff = Date.now() - 24 * 60 * 60 * 1000

            // Allow 1 minute tolerance for test execution time
            expect(Math.abs(cutoffDate.getTime() - expectedCutoff)).toBeLessThan(60000)
        })

        it('should handle guest logout by clearing localStorage', () => {
            // Setup guest session
            localStorageMock.setItem('boardly_guest_id', 'guest_logout')
            localStorageMock.setItem('boardly_guest_name', 'Guest Logout Test')

            expect(isGuestMode()).toBe(true)

            // Simulate logout
            localStorageMock.removeItem('boardly_guest_id')
            localStorageMock.removeItem('boardly_guest_name')

            expect(isGuestMode()).toBe(false)
            expect(getGuestHeaders()).toEqual({})
        })

        it('should handle network errors gracefully in fetchWithGuest', async () => {
            localStorageMock.setItem('boardly_guest_id', 'guest_error')
            localStorageMock.setItem('boardly_guest_name', 'Error Guest')

            global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

            await expect(fetchWithGuest('/api/test')).rejects.toThrow('Network error')

            // Verify headers were still attached before the error
            const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers
            expect(callHeaders).toBeInstanceOf(Headers)
            expect(callHeaders.get('X-Guest-Id')).toBe('guest_error')
            expect(callHeaders.get('X-Guest-Name')).toBe('Error Guest')
        })

        it('should support concurrent guest sessions in different tabs', async () => {
            const guest1 = {
                id: 'guest_tab1',
                name: 'Guest Tab 1',
            }
            const guest2 = {
                id: 'guest_tab2',
                name: 'Guest Tab 2',
            }

            // Simulate tab 1
            localStorageMock.setItem('boardly_guest_id', guest1.id)
            localStorageMock.setItem('boardly_guest_name', guest1.name)

            const headers1 = getGuestHeaders() as Record<string, string>
            expect(headers1['X-Guest-Id']).toBe(guest1.id)

            // Simulate tab 2 (overwrites localStorage - expected behavior)
            localStorageMock.setItem('boardly_guest_id', guest2.id)
            localStorageMock.setItem('boardly_guest_name', guest2.name)

            const headers2 = getGuestHeaders() as Record<string, string>
            expect(headers2['X-Guest-Id']).toBe(guest2.id)

                // Both guests should be able to create users in DB
                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(null)
                ; (prisma.users.create as jest.Mock)
                    .mockResolvedValueOnce({
                        id: guest1.id,
                        username: guest1.name,
                        isGuest: true,
                    })
                    .mockResolvedValueOnce({
                        id: guest2.id,
                        username: guest2.name,
                        isGuest: true,
                    })

            const user1 = await getOrCreateGuestUser(guest1.id, guest1.name)
            const user2 = await getOrCreateGuestUser(guest2.id, guest2.name)

            expect(user1.id).toBe(guest1.id)
            expect(user2.id).toBe(guest2.id)
        })
    })
})
