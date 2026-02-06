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
            expect(prisma.users.update).toHaveBeenCalledWith({
                where: { id: guestId },
                data: {
                    lastActiveAt: expect.any(Date),
                    username: guestName,
                },
            })
            expect(prisma.users.create).not.toHaveBeenCalled()
        })

        it('should handle errors gracefully', async () => {
            const guestId = 'guest_error'
            const guestName = 'Error Guest'

                ; (prisma.users.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'))

            await expect(getOrCreateGuestUser(guestId, guestName)).rejects.toThrow('Database error')
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
