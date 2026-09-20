/**
 * Unit tests for guest helper functions
 */

import * as guestHelpers from '@/lib/guest-helpers'
import { getOrCreateGuestUser, guestNameSuffix, releaseGuestUsername } from '@/lib/guest-helpers'
import { prisma } from '@/lib/db'

// createGuestId() in lib/guest-auth.ts mints `guest-<uuid>`, so that is the shape
// every guest row's primary key really has - and the shape guestNameSuffix has to
// cope with.
const GUEST_ID = 'guest-8f14e45f-ceea-467a-9a3b-1c2d3e4f5a6b'

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

    // #1047 follow-up: guest rows are now held for up to 90 days of inactivity
    // instead of 3, so a taken display name is squatted 30x longer and this
    // collision path runs far more often. It used to produce the same name for
    // every guest, because createGuestId returns `guest-<uuid>` and the old
    // suffix was guestId.slice(0, 6) - the constant prefix "guest-".
    describe('guestNameSuffix', () => {
        const OTHER_GUEST_ID = 'guest-2c1a7b90-4d55-4e0f-8b71-0a9c8d7e6f54'

        it('draws the suffix from the random part of the id, not the prefix', () => {
            expect(guestNameSuffix(GUEST_ID)).toBe('8f14e4')
            expect(guestNameSuffix(GUEST_ID)).not.toContain('guest')
        })

        it('gives two colliding guests different names', () => {
            expect(guestNameSuffix(GUEST_ID)).not.toBe(guestNameSuffix(OTHER_GUEST_ID))
            expect(`Denys-${guestNameSuffix(GUEST_ID)}`).toBe('Denys-8f14e4')
        })

        it('leaves no double dash on the P2002 retry name', () => {
            const fallback = `Denys-${guestNameSuffix(GUEST_ID)}-7556`
            expect(fallback).toBe('Denys-8f14e4-7556')
            expect(fallback).not.toContain('--')
        })
    })

    // #1051. This module used to export a second cleanupOldGuests() that deleted
    // every guest idle for 24 hours with no relation filter - no 3-day window for
    // never-played guests, no 90-day window for guests who had played. It was
    // dead code, but one import away from undoing #1047 within a day, and lib/ is
    // where a route author looks first. The policy now lives only in
    // scripts/cleanup-old-guests.ts, which both cron routes already import.
    describe('guest cleanup policy', () => {
        it('exports no cleanup entry point of its own', () => {
            const exported = Object.keys(guestHelpers)

            expect(exported).not.toContain('cleanupOldGuests')
            expect(exported.filter((name) => /cleanup|purge|delete/i.test(name))).toEqual([])
        })
    })

    // #1050. Users.username is @unique, so a guest holding "Denys" blocked that
    // signup outright - and since #1047 a guest who has played is kept 90 days,
    // not 3. The guest gives the name up instead of the visitor being turned away.
    describe('releaseGuestUsername', () => {
        it('renames the guest and reports the name free', async () => {
            ; (prisma.users.update as jest.Mock).mockResolvedValue({ id: GUEST_ID, username: 'Denys-8f14e4' })

            const freed = await releaseGuestUsername(GUEST_ID, 'Denys')

            expect(freed).toBe(true)
            expect(prisma.users.update).toHaveBeenCalledWith({
                where: { id: GUEST_ID },
                data: { username: 'Denys-8f14e4' },
            })
        })

        it('keeps the guest row and everything that identifies it', async () => {
            ; (prisma.users.update as jest.Mock).mockResolvedValue({ id: GUEST_ID, username: 'Denys-8f14e4' })

            await releaseGuestUsername(GUEST_ID, 'Denys')

            const call = (prisma.users.update as jest.Mock).mock.calls[0]?.[0]
            expect(Object.keys(call.data)).toEqual(['username'])
            expect(prisma.users.deleteMany).not.toHaveBeenCalled()
        })

        it('retries with a more specific name when the rename collides', async () => {
            const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
                ; (prisma.users.update as jest.Mock)
                    .mockRejectedValueOnce(conflict)
                    .mockResolvedValueOnce({ id: GUEST_ID, username: 'Denys-8f14e4-0000' })

            const freed = await releaseGuestUsername(GUEST_ID, 'Denys')

            expect(freed).toBe(true)
            expect(prisma.users.update).toHaveBeenCalledTimes(2)
            const secondName = (prisma.users.update as jest.Mock).mock.calls[1][0].data.username
            expect(secondName).toMatch(/^Denys-8f14e4-\d{4}$/)
        })

        it('reports the name still taken when every rename collides', async () => {
            const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
                ; (prisma.users.update as jest.Mock).mockRejectedValue(conflict)

            await expect(releaseGuestUsername(GUEST_ID, 'Denys')).resolves.toBe(false)
        })

        it('rethrows a failure that is not a name collision', async () => {
            ; (prisma.users.update as jest.Mock).mockRejectedValue(new Error('connection terminated'))

            await expect(releaseGuestUsername(GUEST_ID, 'Denys')).rejects.toThrow('connection terminated')
        })

        it('handles a guest row with no display name at all', async () => {
            ; (prisma.users.update as jest.Mock).mockResolvedValue({ id: GUEST_ID, username: 'Guest-8f14e4' })

            const freed = await releaseGuestUsername(GUEST_ID, null)

            expect(freed).toBe(true)
            expect((prisma.users.update as jest.Mock).mock.calls[0][0].data.username).toBe('Guest-8f14e4')
        })
    })
})
