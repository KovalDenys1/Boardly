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

  // No signup source here on purpose. This call only ever creates a row if a
  // validly signed guest token names a guest that no longer exists, and it
  // cannot in practice: the cleanup purges on three days of inactivity while a
  // guest token lives twelve hours, so a purged guest's token is always long
  // expired. The two routes that genuinely mint guests (auth/guest-session and
  // lobby/[code]/join-guest) pass the source; this one would only ever be
  // guessing on behalf of a request that is not a signup.
  const guestUser = await getOrCreateGuestUser(guestClaims.guestId, guestClaims.guestName)
  return {
    id: guestUser.id,
    username: guestUser.username || guestClaims.guestName || 'Guest',
    isGuest: true,
  }
}
