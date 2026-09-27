import { randomInt } from 'crypto'
import { prisma } from '@/lib/db'
import { deleteAvatar, isAvatarStorageConfigured } from '@/lib/supabase-storage'
import { insensitiveEquals, sameName } from '@/lib/username-match'

/**
 * Staff removing one piece of a profile through the Control Panel (#1231, Control Panel
 * #120; Terms section 5 names content removal among the moderation actions).
 *
 * - `bio`: cleared.
 * - `avatar`: the uploaded file is deleted from storage and `avatarUrl` cleared. `image`,
 *   the picture a provider supplied at sign-up, is cleared too: every place that draws the
 *   profile picture falls back to it (`avatarUrl ?? image`), so clearing only the upload
 *   would put the provider's picture back in its place.
 * - `username`: reset to a neutral `Player` plus six random digits, checked free the way
 *   PATCH /api/user/profile checks a name (case-insensitive, `_` not a wildcard).
 */

export type ProfileContentField = 'bio' | 'avatar' | 'username'

export type ProfileContentRemoval =
  | { status: 'removed'; username?: string }
  | { status: 'not_found' }
  /** Storage refused the delete. The row is unchanged; safe to retry. */
  | { status: 'avatar_failed' }

const NEUTRAL_USERNAME_STEM = 'Player'
const NEUTRAL_USERNAME_DIGITS = 6
const USERNAME_ATTEMPTS = 10

export function neutralUsernameCandidate(): string {
  const digits = String(randomInt(0, 10 ** NEUTRAL_USERNAME_DIGITS)).padStart(NEUTRAL_USERNAME_DIGITS, '0')
  return `${NEUTRAL_USERNAME_STEM}${digits}`
}

async function isUsernameHeld(candidate: string): Promise<boolean> {
  const holders = await prisma.users.findMany({
    where: { username: insensitiveEquals(candidate) },
    select: { username: true },
  })
  return holders.some((row) => sameName(row.username, candidate))
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code
}

async function resetUsername(userId: string): Promise<ProfileContentRemoval> {
  for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
    const candidate = neutralUsernameCandidate()
    if (await isUsernameHeld(candidate)) continue
    try {
      await prisma.users.update({ where: { id: userId }, data: { username: candidate } })
      return { status: 'removed', username: candidate }
    } catch (error) {
      // Taken between the check and the write: draw again.
      if (isPrismaCode(error, 'P2002')) continue
      // Deleted between the read and the write.
      if (isPrismaCode(error, 'P2025')) return { status: 'not_found' }
      throw error
    }
  }
  // A million names and ten misses in a row means something other than bad luck.
  throw new Error('No free neutral username after 10 attempts')
}

export async function removeProfileContent(
  userId: string,
  field: ProfileContentField
): Promise<ProfileContentRemoval> {
  const user = await prisma.users.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return { status: 'not_found' }

  if (field === 'username') {
    return resetUsername(user.id)
  }

  if (field === 'avatar' && isAvatarStorageConfigured()) {
    try {
      await deleteAvatar(user.id)
    } catch {
      return { status: 'avatar_failed' }
    }
  }

  try {
    await prisma.users.update({
      where: { id: user.id },
      data: field === 'bio' ? { bio: null } : { avatarUrl: null, image: null },
    })
  } catch (error) {
    if (isPrismaCode(error, 'P2025')) return { status: 'not_found' }
    throw error
  }
  return { status: 'removed' }
}
