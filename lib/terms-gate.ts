import { prisma } from '@/lib/db'

/**
 * True when this user may not post free text yet (#1466): Google Play wants the terms accepted
 * before anything user-generated is shown to others. Guests and accounts that predate the terms
 * have a null `termsAcceptedAt`; a bot is never held back.
 */
export async function requiresTermsAcceptance(userId: string): Promise<boolean> {
  const sender = await prisma.users.findUnique({
    where: { id: userId },
    select: { termsAcceptedAt: true, bot: { select: { id: true } } },
  })
  return !sender?.termsAcceptedAt && !sender?.bot
}
