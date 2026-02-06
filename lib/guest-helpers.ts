import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/lib/guest-helpers')

/**
 * Get or create a guest user based on guest ID
 * Guest users are temporary and marked with isGuest = true
 */
export async function getOrCreateGuestUser(guestId: string, guestName: string) {
    try {
        // Try to find existing guest user by ID
        const existingGuest = await prisma.users.findFirst({
            where: {
                id: guestId,
                isGuest: true,
            },
        })

        if (existingGuest) {
            // Update last active timestamp
            const updatedGuest = await prisma.users.update({
                where: { id: existingGuest.id },
                data: {
                    lastActiveAt: new Date(),
                    username: guestName, // Update name in case it changed
                },
            })
            log.info('Found existing guest user', { guestId, guestName })
            return updatedGuest
        }

        // Create new guest user
        const newGuest = await prisma.users.create({
            data: {
                id: guestId,
                username: guestName,
                email: `guest-${guestId}@boardly.guest`, // Temporary email for guests
                isGuest: true,
                lastActiveAt: new Date(),
            },
        })

        log.info('Created new guest user', { guestId, guestName })
        return newGuest
    } catch (error) {
        log.error('Error creating/getting guest user', error as Error, { guestId, guestName })
        throw error
    }
}

/**
 * Clean up old guest users (older than 24 hours of inactivity)
 * Should be called periodically or during lobby cleanup
 */
export async function cleanupOldGuests() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    try {
        const result = await prisma.users.deleteMany({
            where: {
                isGuest: true,
                lastActiveAt: {
                    lt: twentyFourHoursAgo,
                },
            },
        })

        log.info('Cleaned up old guest users', { count: result.count })
        return result.count
    } catch (error) {
        log.error('Error cleaning up guest users', error as Error)
        throw error
    }
}

/**
 * Check if a user ID is a guest
 */
export async function isGuestUser(userId: string): Promise<boolean> {
    const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { isGuest: true },
    })

    return user?.isGuest ?? false
}
