import type { ProfileVisibility } from '@prisma/client'
import { prisma } from './db'

export type AccountPreferenceSnapshot = {
  profileVisibility: ProfileVisibility
}

export async function getAccountPreferences(
  userId: string
): Promise<AccountPreferenceSnapshot> {
  const prefs = await prisma.accountPreferences.findUnique({
    where: { userId },
    select: {
      profileVisibility: true,
    },
  })

  return (
    prefs ?? {
      profileVisibility: 'public',
    }
  )
}

export async function upsertAccountPreferences(
  userId: string,
  data: Partial<AccountPreferenceSnapshot>
): Promise<AccountPreferenceSnapshot> {
  return prisma.accountPreferences.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
    },
    update: data,
    select: {
      profileVisibility: true,
    },
  })
}
