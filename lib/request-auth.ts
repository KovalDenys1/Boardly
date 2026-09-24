import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { getGuestClaimsFromRequest } from '@/lib/guest-auth'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'

export interface RequestAuthUser {
  id: string
  username: string
  isGuest: boolean
}

interface SessionUserLike {
  username?: string | null
  name?: string | null
  email?: string | null
  suspended?: boolean | null
}

function getSessionUsername(sessionUser?: SessionUserLike): string {
  if (sessionUser?.username && typeof sessionUser.username === 'string') {
    return sessionUser.username
  }
  if (sessionUser?.name && typeof sessionUser.name === 'string') {
    return sessionUser.name
  }
  return 'Player'
}

export async function getRequestAuthUser(request: Request): Promise<RequestAuthUser | null> {
  const session = await getServerSession(authOptions)
  if (session?.user?.id) {
    if (session.user.suspended) {
      return null
    }

    const dbUser = await prisma.users.findUnique({
      where: { id: session.user.id },
      select: { id: true, username: true, suspended: true },
    })

    if (!dbUser || dbUser.suspended) {
      return null
    }

    return {
      id: session.user.id,
      username: getSessionUsername({
        ...session.user,
        username: dbUser.username ?? session.user.name ?? session.user.email,
      }),
      isGuest: false,
    }
  }

  const guestClaims = getGuestClaimsFromRequest(request)
  if (!guestClaims) {
    return null
  }

  // Never creates a row. The two routes that genuinely mint guests
  // (auth/guest-session and lobby/[code]/join-guest) do that; here a validly
  // signed token naming a guest that no longer exists is someone who used
  // "Forget me" in another tab, or was purged mid-session, and re-creating the
  // row under the same id would undo the erasure (#1129). Unauthenticated.
  const guestUser = await getOrCreateGuestUser(guestClaims.guestId, guestClaims.guestName, null, {
    createIfMissing: false,
  })
  if (!guestUser) {
    return null
  }
  return {
    id: guestUser.id,
    username: guestUser.username || guestClaims.guestName || 'Guest',
    isGuest: true,
  }
}
