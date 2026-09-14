import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/lib/guest-helpers')

// Matches the authenticated-user activity throttle in lib/next-auth.ts — guests hit this
// path on nearly every API call (getRequestAuthUser -> getOrCreateGuestUser), so writing
// lastActiveAt unconditionally on every request made it the hottest, unthrottled write in
// the app and a recurring source of Users.update timeouts under DB contention (#683).
const GUEST_ACTIVITY_THROTTLE_MS = 5 * 60 * 1000

/**
 * Get or create a guest user based on guest ID
 * Guest users are temporary and marked with isGuest = true
 */
export async function getOrCreateGuestUser(guestId: string, guestName: string, signupSource: string | null = null) {
    try {
        // Try to find existing guest user by ID
        const existingGuest = await prisma.users.findFirst({
            where: {
                id: guestId,
                isGuest: true,
            },
        })

        if (existingGuest) {
            const usernameChanged = existingGuest.username !== guestName
            const lastActiveAgeMs = Date.now() - existingGuest.lastActiveAt.getTime()

            // signupSource used to be written on create and nowhere else, so whichever
            // route happened to mint the row decided the answer forever — and one of them
            // did not pass a source at all (#909), which is how 11 of 31 live guests ended
            // up unattributed with no way back. Backfilling closes that for good: the
            // cookie is written on the visitor's first page view and lives 90 days, so it
            // still holds first-touch even when it arrives on a later request. Only ever
            // fills a blank; an existing value is never overwritten by a later visit.
            const needsSignupSource = signupSource !== null && existingGuest.signupSource === null

            // Nothing to persist and we touched this row recently — skip the write.
            if (!usernameChanged && !needsSignupSource && lastActiveAgeMs < GUEST_ACTIVITY_THROTTLE_MS) {
                return existingGuest
            }

            // Update last active timestamp and username only if it changed
            const updateData: { lastActiveAt: Date; username?: string; signupSource?: string } = {
                lastActiveAt: new Date(),
            }

            if (needsSignupSource) {
                updateData.signupSource = signupSource
                log.info('Backfilled signupSource on an existing guest', { guestId, signupSource })
            }

            // Only update username if it has changed
            if (usernameChanged) {
                // Check if the new username is already taken
                const usernameExists = await prisma.users.findFirst({
                    where: {
                        username: guestName,
                        id: { not: guestId },
                    },
                })

                // Only update if the username is available
                if (!usernameExists) {
                    updateData.username = guestName
                } else {
                    // Keep the old username if the new one is taken
                    log.info('Username already taken, keeping old username', {
                        guestId,
                        requestedName: guestName,
                        currentName: existingGuest.username
                    })
                }
            }

            try {
                const updatedGuest = await prisma.users.update({
                    where: { id: existingGuest.id },
                    data: updateData,
                })
                log.info('Found existing guest user', {
                    guestId,
                    guestName: updatedGuest.username,
                    usernameUpdated: updateData.username !== undefined
                })
                return updatedGuest
            } catch (updateError) {
                // This is a housekeeping write (activity timestamp / display name) piggybacking
                // on whatever request the guest happened to make — it shouldn't be able to take
                // down that request (e.g. Quick Play matchmaking) just because it hit the DB
                // timeout under load. Fall back to the pre-write record; the next request will
                // retry the write.
                log.error('Failed to update guest activity, continuing with existing record', updateError as Error, { guestId })
                return { ...existingGuest, ...updateData }
            }
        }

        // For new guest users, ensure username is unique
        let uniqueUsername = guestName
        let usernameExists = await prisma.users.findFirst({
            where: { username: uniqueUsername },
        })

        // If username is taken, append guest ID suffix
        if (usernameExists) {
            uniqueUsername = `${guestName}-${guestId.slice(0, 6)}`
            log.info('Username taken, using unique username', {
                requestedName: guestName,
                uniqueName: uniqueUsername
            })
        }

        // Create new guest user with retry logic for race conditions
        try {
            const newGuest = await prisma.users.create({
                data: {
                    id: guestId,
                    username: uniqueUsername,
                    email: `guest-${guestId}@boardly.guest`, // Temporary email for guests
                    isGuest: true,
                    signupSource,
                    lastActiveAt: new Date(),
                },
            })

            log.info('Created new guest user', { guestId, username: newGuest.username })
            return newGuest
        } catch (createError: unknown) {
            // Handle race condition: if username was taken between check and create
            if (typeof createError === 'object' && createError !== null && (createError as Record<string, unknown>).code === 'P2002') {
                log.warn('Race condition detected during guest user creation, retrying with unique suffix', {
                    guestId,
                    attemptedUsername: uniqueUsername
                })
                
                // Force unique username by appending guest ID and timestamp
                const fallbackUsername = `${guestName}-${guestId.slice(0, 6)}-${Date.now().toString().slice(-4)}`
                
                const retryGuest = await prisma.users.create({
                    data: {
                        id: guestId,
                        username: fallbackUsername,
                        email: `guest-${guestId}@boardly.guest`,
                        isGuest: true,
                        signupSource,
                        lastActiveAt: new Date(),
                    },
                })
                
                log.info('Created guest user with fallback username after race condition', {
                    guestId,
                    username: retryGuest.username
                })
                return retryGuest
            }
            
            // Re-throw other errors
            throw createError
        }
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
