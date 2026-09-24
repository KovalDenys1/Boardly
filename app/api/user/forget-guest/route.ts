import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { verifyCsrfToken } from '@/lib/csrf'
import { getGuestClaimsFromRequest } from '@/lib/guest-auth'
import { detachFeedbackFrom, scrubPlayersFromGameRecords } from '@/lib/account-erasure'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/user/forget-guest')

/**
 * "Forget me" for a guest (#1129).
 *
 * A guest is a Users row – a display name, activity times, games, chat – tied
 * to a device by a signed token, and has no email for the account-deletion
 * flow to confirm through. The guest token is the proof of identity: whoever
 * holds it is that guest, which is all the rest of the app asks of them.
 *
 * Erases what the account deletion erases for a registered user: the name in
 * other players' games and replays, the Feedback link, then the row itself
 * (Players, participations, invites and notifications cascade). Guests cannot
 * upload an avatar or subscribe, so there is no storage or Stripe step.
 */
export async function POST(req: NextRequest) {
  if (!verifyCsrfToken(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const claims = getGuestClaimsFromRequest(req)
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const guest = await prisma.users.findFirst({
      where: { id: claims.guestId, isGuest: true },
      select: { id: true, username: true },
    })

    // Already gone (a second tab, or the purge got there first). The client
    // treats this exactly like success and clears the device.
    if (!guest) {
      return NextResponse.json(
        { error: 'Guest not found', code: 'GUEST_NOT_FOUND' },
        { status: 404 }
      )
    }

    // Deleting a player out of a running game would strand everyone else in
    // it until the stale-game sweep. Finish or leave it first; a stuck game is
    // flipped to abandoned by lib/lobby-health.ts within hours, so this can
    // never block for good.
    const activeGame = await prisma.players.findFirst({
      where: { userId: guest.id, leftAt: null, game: { status: 'playing' } },
      select: { id: true },
    })
    if (activeGame) {
      return NextResponse.json(
        { error: 'Leave your current game first', code: 'GUEST_IN_ACTIVE_GAME' },
        { status: 409 }
      )
    }

    const scrubbed = await scrubPlayersFromGameRecords([guest])
    const feedbackDetached = await detachFeedbackFrom([guest.id])

    // deleteMany with isGuest so this route can never delete a registered account.
    const deleted = await prisma.users.deleteMany({ where: { id: guest.id, isGuest: true } })

    // The id only: the name is what was just erased.
    log.info('Guest forgot themselves', {
      userId: guest.id,
      deleted: deleted.count,
      games: scrubbed.games,
      snapshots: scrubbed.snapshots,
      feedback: feedbackDetached,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Failed to forget guest', error as Error, { userId: claims.guestId })
    return NextResponse.json({ error: 'Failed to delete guest data' }, { status: 500 })
  }
}
