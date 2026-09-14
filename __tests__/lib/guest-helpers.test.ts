/**
 * Unit tests for guest helper functions
 */

import { getOrCreateGuestUser, cleanupOldGuests } from '@/lib/guest-helpers'
import { prisma } from '@/lib/db'

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
    },
}))

jest.mock('@/lib/logger', () => ({
    apiLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}))

describe('Guest Helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getOrCreateGuestUser', () => {
        it('should create a new guest user if not exists', async () => {
            const guestId = 'guest_123'
            const guestName = 'Test Guest'

                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(null)
                ; (prisma.users.create as jest.Mock).mockResolvedValue({
                    id: guestId,
                    username: guestName,
                    email: `guest-${guestId}@boardly.guest`,
                    isGuest: true,
                    lastActiveAt: new Date(),
                })

            const user = await getOrCreateGuestUser(guestId, guestName)

            expect(prisma.users.findFirst).toHaveBeenCalledWith({
                where: {
                    id: guestId,
                    isGuest: true,
                },
            })
            expect(prisma.users.create).toHaveBeenCalledWith({
                data: {
                    id: guestId,
                    username: guestName,
                    email: `guest-${guestId}@boardly.guest`,
                    isGuest: true,
                    signupSource: null,
                    lastActiveAt: expect.any(Date),
                },
            })
            expect(user.isGuest).toBe(true)
            expect(user.username).toBe(guestName)
        })

        it('should update lastActiveAt for existing guest', async () => {
            const guestId = 'guest_123'
            const guestName = 'Test Guest'
            const existingUser = {
                id: guestId,
                username: 'Old Name',
                email: `guest-${guestId}@boardly.guest`,
                isGuest: true,
                lastActiveAt: new Date(Date.now() - 3600000), // 1 hour ago
            }

                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(existingUser)
                ; (prisma.users.update as jest.Mock).mockResolvedValue({
                    ...existingUser,
                    username: guestName,
                    lastActiveAt: new Date(),
                })

            const user = await getOrCreateGuestUser(guestId, guestName)

            expect(prisma.users.findFirst).toHaveBeenCalled()
            expect(prisma.users.update).toHaveBeenCalled()
            
            // Check the call structure
            const updateCall = (prisma.users.update as jest.Mock).mock.calls[0][0]
            expect(updateCall.where).toEqual({ id: guestId })
            // Verify lastActiveAt is a Date instance
            expect(updateCall.data.lastActiveAt).toBeInstanceOf(Date)
            // Username may or may not be present in the update (only if changed)
            expect(updateCall.data).toHaveProperty('lastActiveAt')
            
            expect(prisma.users.create).not.toHaveBeenCalled()
        })

        it('should skip the write when recently active and username unchanged', async () => {
            const guestId = 'guest_throttled'
            const guestName = 'Same Name'
            const existingUser = {
                id: guestId,
                username: guestName,
                email: `guest-${guestId}@boardly.guest`,
                isGuest: true,
                lastActiveAt: new Date(Date.now() - 60000), // 1 minute ago
            }

                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(existingUser)

            const user = await getOrCreateGuestUser(guestId, guestName)

            expect(prisma.users.update).not.toHaveBeenCalled()
            expect(user).toEqual(existingUser)
        })

        it('should fall back to the existing record if the activity write times out', async () => {
            const guestId = 'guest_slow_write'
            const guestName = 'Test Guest'
            const existingUser = {
                id: guestId,
                username: 'Old Name',
                email: `guest-${guestId}@boardly.guest`,
                isGuest: true,
                lastActiveAt: new Date(Date.now() - 3600000), // 1 hour ago
            }

                ; (prisma.users.findFirst as jest.Mock)
                    .mockResolvedValueOnce(existingUser) // lookup by guestId
                    .mockResolvedValueOnce(null) // username uniqueness check — available
                ; (prisma.users.update as jest.Mock).mockRejectedValue(new Error('Database operation timed out after 12000ms (Users.update)'))

            const user = await getOrCreateGuestUser(guestId, guestName)

            expect(prisma.users.update).toHaveBeenCalled()
            expect(user.id).toBe(guestId)
            expect(user.username).toBe(guestName)
        })

        it('should handle errors gracefully', async () => {
            const guestId = 'guest_error'
            const guestName = 'Error Guest'

                ; (prisma.users.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'))

            await expect(getOrCreateGuestUser(guestId, guestName)).rejects.toThrow('Database error')
        })
    })


    describe('signupSource attribution (#909)', () => {
        const guestId = 'guest_src'
        const guestName = 'Sourced Guest'

        function existingGuest(overrides: Record<string, unknown> = {}) {
            return {
                id: guestId,
                username: guestName,
                email: `guest-${guestId}@boardly.guest`,
                isGuest: true,
                signupSource: null,
                // Old enough that the activity throttle never hides a missing write.
                lastActiveAt: new Date(Date.now() - 60 * 60 * 1000),
                ...overrides,
            }
        }

        it('stores the source on a brand new guest', async () => {
            ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(null)
                ; (prisma.users.create as jest.Mock).mockResolvedValue(existingGuest({ signupSource: 'ref:reddit.com' }))

            await getOrCreateGuestUser(guestId, guestName, 'ref:reddit.com')

            expect(prisma.users.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ signupSource: 'ref:reddit.com' }) })
            )
        })

        it('backfills a guest that was minted without one', async () => {
            ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(existingGuest())
                ; (prisma.users.update as jest.Mock).mockResolvedValue(existingGuest({ signupSource: 'utm:reddit/social' }))

            await getOrCreateGuestUser(guestId, guestName, 'utm:reddit/social')

            expect(prisma.users.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ signupSource: 'utm:reddit/social' }) })
            )
        })

        it('backfills even when the activity throttle would skip the write', async () => {
            // The throttle exists to keep this off the hot path, but a blank source is
            // something to persist, so it must not be swallowed by a recent touch.
            ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(existingGuest({ lastActiveAt: new Date() }))
                ; (prisma.users.update as jest.Mock).mockResolvedValue(existingGuest({ signupSource: 'direct' }))

            await getOrCreateGuestUser(guestId, guestName, 'direct')

            expect(prisma.users.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ signupSource: 'direct' }) })
            )
        })

        it('never overwrites a source the guest already has', async () => {
            ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(existingGuest({ signupSource: 'ref:reddit.com' }))
                ; (prisma.users.update as jest.Mock).mockResolvedValue(existingGuest({ signupSource: 'ref:reddit.com' }))

            await getOrCreateGuestUser(guestId, guestName, 'utm:twitter')

            const call = (prisma.users.update as jest.Mock).mock.calls[0]?.[0]
            expect(call?.data).not.toHaveProperty('signupSource')
        })

        it('stays off the hot path: no source to add, recently touched, no write', async () => {
            ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(existingGuest({ lastActiveAt: new Date() }))

            await getOrCreateGuestUser(guestId, guestName)

            expect(prisma.users.update).not.toHaveBeenCalled()
        })
    })

    describe('cleanupOldGuests', () => {
        it('should delete guests inactive for more than 24 hours', async () => {
            const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000)

                ; (prisma.users.deleteMany as jest.Mock).mockResolvedValue({ count: 5 })

            const count = await cleanupOldGuests()

            expect(prisma.users.deleteMany).toHaveBeenCalledWith({
                where: {
                    isGuest: true,
                    lastActiveAt: {
                        lt: expect.any(Date),
                    },
                },
            })
            expect(count).toBe(5)
        })

        it('should return 0 if no guests to cleanup', async () => {
            ; (prisma.users.deleteMany as jest.Mock).mockResolvedValue({ count: 0 })

            const count = await cleanupOldGuests()

            expect(count).toBe(0)
        })
    })
})
