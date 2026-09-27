import type { ProfileVisibility } from '@/prisma/client'
import { prisma } from './db'

export type AccountPreferenceSnapshot = {
  profileVisibility: ProfileVisibility
  showOnlineStatus: boolean
}

/**
 * What an account with no `AccountPreferences` row has always been: a public profile with
 * online status shown, the column defaults before #1131.
 *
 * Since 2026-09-27 every account gets its row when it is created (the register route and
 * lib/custom-prisma-adapter.ts), with the new defaults: friends-only, online status off.
 * So a missing row now always means an account that predates the change, and the decision
 * was that existing accounts stay as they are. Reads fall back to these values, and a row
 * created later for such an account (a settings change, onboarding) is written with them
 * rather than the column defaults, which would silently hide a profile its owner never
 * changed.
 */
export const LEGACY_ACCOUNT_PREFERENCES: AccountPreferenceSnapshot = {
  profileVisibility: 'public',
  showOnlineStatus: true,
}

export async function getAccountPreferences(
  userId: string
): Promise<AccountPreferenceSnapshot> {
  const prefs = await prisma.accountPreferences.findUnique({
    where: { userId },
    select: {
      profileVisibility: true,
      showOnlineStatus: true,
    },
  })

  return prefs ?? { ...LEGACY_ACCOUNT_PREFERENCES }
}

export async function upsertAccountPreferences(
  userId: string,
  data: Partial<AccountPreferenceSnapshot>
): Promise<AccountPreferenceSnapshot> {
  return prisma.accountPreferences.upsert({
    where: { userId },
    create: {
      userId,
      ...LEGACY_ACCOUNT_PREFERENCES,
      ...data,
    },
    update: data,
    select: {
      profileVisibility: true,
      showOnlineStatus: true,
    },
  })
}
