import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/lib/guest-helpers')

// Matches the authenticated-user activity throttle in lib/next-auth.ts — guests hit this
// path on nearly every API call (getRequestAuthUser -> getOrCreateGuestUser), so writing
// lastActiveAt unconditionally on every request made it the hottest, unthrottled write in
// the app and a recurring source of Users.update timeouts under DB contention (#683).
const GUEST_ACTIVITY_THROTTLE_MS = 5 * 60 * 1000

const GUEST_ID_PREFIX = 'guest-'

/**
 * The discriminator appended to a guest display name when that name is taken.
 *
 * Guest ids are `guest-<uuid>` (createGuestId in lib/guest-auth.ts), so the
 * first six characters of one are the constant prefix `guest-`: the old
 * `guestId.slice(0, 6)` gave every colliding guest the same name, "Denys-guest-",
 * and the P2002 retry path the double-dashed "Denys-guest--7556". Strip the
 * prefix and the uuid's own dashes first so the suffix is drawn from the random
 * part of the id and actually discriminates.
 *
 * This matters more since #1047: a guest row is now held for up to 90 days of
 * inactivity instead of 3, so a common first name is squatted for far longer and
 * the collision path runs far more often.
 */
export function guestNameSuffix(guestId: string): string {
    const random = guestId.startsWith(GUEST_ID_PREFIX)
        ? guestId.slice(GUEST_ID_PREFIX.length)
        : guestId
    const suffix = random.replace(/-/g, '').slice(0, 6)

    return suffix.length > 0 ? suffix : guestId.replace(/-/g, '').slice(0, 6)
}

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
            uniqueUsername = `${guestName}-${guestNameSuffix(guestId)}`
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
                const fallbackUsername = `${guestName}-${guestNameSuffix(guestId)}-${Date.now().toString().slice(-4)}`
                
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
 * Guest cleanup deliberately does not live here.
 *
 * This module used to export its own `cleanupOldGuests()` deleting every guest
 * idle for 24 hours, with no relation filter and no retention policy. It was
 * never wired up - both cron routes import `scripts/cleanup-old-guests.ts` - but
 * it sat one import away from silently undoing #1047's ninety-day window for
 * guests who have played, within a day. Removed in #1051 so the policy has a
 * single home; import it from `@/scripts/cleanup-old-guests`.
 */

/**
 * Give up a display name that a guest row is holding, so a real account can take it.
 *
 * `Users.username` is `@unique` (prisma/schema.prisma), so a guest who typed
 * "Denys" occupies that name for every signup too. Before #1047 the row vanished
 * after three days of inactivity; a guest who has played is now kept for ninety,
 * which turned a short annoyance into a ninety-day squat on a common first name
 * and is the whole of #1050.
 *
 * Renaming the guest is preferred over simply skipping guest rows in the
 * caller's uniqueness check, because the unique constraint is real: "ignore
 * guests" only moves the failure from a checked 400 to a P2002 on insert. It is
 * also preferred over deleting the guest, which would cascade their Players rows
 * away - the exact loss #1047 was filed to stop. Nothing that identifies the
 * guest changes: their id, their identity token and their game history are
 * untouched, only the cosmetic display name. `getOrCreateGuestUser` above
 * already keeps the stored name when the one the browser asks for is taken, so
 * the returning guest settles on the new name rather than fighting for the old.
 *
 * Returns true when the name is free afterwards, false only when the rename
 * itself lost a race - in which case the caller should treat the name as taken.
 */
export async function releaseGuestUsername(
    guestId: string,
    currentUsername: string | null
): Promise<boolean> {
    const base = currentUsername ?? 'Guest'
    const suffix = guestNameSuffix(guestId)

    // Same shape the collision paths in getOrCreateGuestUser produce, so a guest
    // renamed here is indistinguishable from one who picked a taken name.
    const candidates = [`${base}-${suffix}`, `${base}-${suffix}-${Date.now().toString().slice(-4)}`]

    for (const candidate of candidates) {
        try {
            await prisma.users.update({
                where: { id: guestId },
                data: { username: candidate },
            })

            log.info('Released a guest display name to a registered account', {
                guestId,
                previousName: currentUsername,
                newName: candidate,
            })
            return true
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && (error as Record<string, unknown>).code === 'P2002') {
                log.warn('Guest rename collided, trying a more specific name', { guestId, candidate })
                continue
            }
            throw error
        }
    }

    log.error('Could not free a guest-held username', undefined, { guestId, currentUsername })
    return false
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
