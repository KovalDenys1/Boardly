import { randomInt } from 'crypto'
import { prisma } from '@/lib/db'
import { scrubPlayersFromGameRecords, type ErasedIdentity } from '@/lib/account-erasure'
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
 *   PATCH /api/user/profile checks a name (case-insensitive, `_` not a wildcard). The old
 *   name also leaves Games.state and the replay snapshots, replaced by the new one
 *   (scrubPlayersFromGameRecords, the same rewrite account deletion uses). It stays where
 *   this does not reach: the Redis chat history, for up to 24 hours (CHAT_RETENTION_HOURS),
 *   and the user's own session token, until its 30-minute refresh (lib/next-auth.ts), so a
 *   game they start in that window can still record it.
 *
 * Bots are refused whatever the field. A bot is found by its username
 * (lib/bot-helpers.ts getOrCreateBotUser), so a renamed bot is missed, the lookup then
 * tries to create it again, collides on its email and every add-bot fails.
 */

export type ProfileContentField = 'bio' | 'avatar' | 'username'

export type ProfileContentRemoval =
  | { status: 'removed'; username?: string }
  | { status: 'not_found' }
  | { status: 'bot' }
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

/**
 * The game records are rewritten before the row, so that a failure part-way leaves the
 * old name in `Users.username`, where a retry reads it and finds every record still
 * carrying it. Rewriting after the row would leave a retry scrubbing for the neutral name
 * instead, and the old one would stay wherever a record names it without an id beside it.
 */
async function resetUsername(userId: string, oldName: string | null): Promise<ProfileContentRemoval> {
  // A candidate the records were already moved to but the row could not take (another
  // account won it between the check and the write) is moved on with the old name.
  const labelledAs: string[] = []
  for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
    const candidate = neutralUsernameCandidate()
    if (await isUsernameHeld(candidate)) continue

    const identities: ErasedIdentity[] = [oldName, ...labelledAs].map((username) => ({
      id: userId,
      username,
      label: candidate,
    }))
    await scrubPlayersFromGameRecords(identities)

    try {
      await prisma.users.update({ where: { id: userId }, data: { username: candidate } })
      return { status: 'removed', username: candidate }
    } catch (error) {
      if (isPrismaCode(error, 'P2002')) {
        labelledAs.push(candidate)
        continue
      }
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
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, username: true, bot: { select: { id: true } } },
  })
  if (!user) return { status: 'not_found' }
  if (user.bot) return { status: 'bot' }

  if (field === 'username') {
    return resetUsername(user.id, user.username)
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
