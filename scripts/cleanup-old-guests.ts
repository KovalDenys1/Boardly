#!/usr/bin/env tsx
/**
 * Cleanup Old Guest Users Script
 *
 * Deletes abandoned guest identities. A guest who has actually played a game is
 * a player rather than an abandoned identity and is kept far longer - see the
 * retention constants below.
 *
 * Run: npm run cleanup:old-guests
 * Cron: daily at 3 AM UTC, via /api/cron/maintenance
 */

import { prisma } from '../lib/db'
import type { Prisma } from '../prisma/client'
import { detachFeedbackFrom, scrubPlayersFromGameRecords } from '../lib/account-erasure'
import { RETENTION_DAYS } from '../lib/retention-periods'

interface CleanupOptions {
  days?: number
  dryRun?: boolean
  disconnect?: boolean
}

/**
 * Retention windows, in days of inactivity.
 *
 * Both windows are rolling: they count from lastActiveAt, so any visit starts
 * the clock again.
 *
 * A guest's identity lives in localStorage (contexts/GuestContext.tsx,
 * boardly_guest_identity) and the token proving it is signed for 90 days
 * (lib/guest-auth.ts, #1155), re-issued on every visit. The row that identity points at used to be deleted after
 * three days of inactivity, and Players.userId cascades on delete
 * (prisma/schema.prisma), so a guest who came back on day four found every game
 * they had played gone and counted as a new person (#1047).
 *
 * The window therefore depends on whether there is anything worth keeping:
 *
 * - Never played: this is the abandoned identity the job was written for -
 *   a display name, a placeholder email, nothing attached to it. Three days,
 *   unchanged, still overridable with CLEANUP_GUEST_DAYS.
 * - Played at least once: a real player. Ninety days, which is what this
 *   repo already keeps replays for (lib/cleanup-replays.ts) and how long the
 *   acquisition-source cookie lives, and what the identity token lives - so a
 *   row is never kept past the point where the returning guest could still
 *   prove it is theirs, and the token never outlives a played guest's row.
 */
const DEFAULT_GUEST_CLEANUP_DAYS = RETENTION_DAYS.guestIdle
const PLAYED_GUEST_CLEANUP_DAYS = RETENTION_DAYS.guestPlayedIdle

/**
 * What counts as "this guest actually played".
 *
 * Not just `finished`. A game only reaches `playing` once it has started, and
 * the usual way a real match ends is `abandoned`, not `finished`:
 * lib/lobby-health.ts flips any `playing` game to `abandoned` after
 * LOBBY_CLEANUP_PLAYING_STALE_HOURS (2 by default), and lib/lobby-leave.ts
 * abandons a running game the moment the roster drops below what the game needs.
 * Keying the long window on `finished` alone left #1047's own headline case
 * open: the guest whose opponent closed the tab has no finished game, so they
 * were still purged on day four.
 *
 * `waiting` and `cancelled` are excluded on purpose - both mean a lobby that
 * never started, which is the abandoned identity this job exists to remove.
 *
 * `startedAt` would be the more literal test, but it was added in
 * prisma/migrations/20260325000000_add_match_timing_metadata with no backfill,
 * so every game played before that date has it null and would read as unplayed.
 */
const PLAYED_GAME_STATUSES = ['playing', 'finished', 'abandoned'] as const

function resolveCleanupGuestDays(rawDays: number | undefined): number {
  if (!Number.isFinite(rawDays) || (rawDays as number) <= 0) {
    return DEFAULT_GUEST_CLEANUP_DAYS
  }

  return Math.floor(rawDays as number)
}

/**
 * The long window is a floor, not a ceiling.
 *
 * CLEANUP_GUEST_DAYS (and --days=) is the operator's "keep guests longer" knob.
 * If it is turned past 90 while the long window stayed a flat constant, the
 * guests who had actually played would be deleted while the empty identities
 * lived on - exactly backwards. Taking the larger of the two keeps the policy
 * monotone: a guest who played is never removed before an identical guest who
 * did not.
 */
function resolvePlayedCleanupDays(days: number): number {
  return Math.max(days, PLAYED_GUEST_CLEANUP_DAYS)
}

/**
 * The delete set. Built once and used for both the listing and the delete, so
 * the count that gets logged can never describe a different set of rows from
 * the one that is actually removed.
 */
function buildGuestCleanupWhere(cutoff: Date, playedCutoff: Date): Prisma.UsersWhereInput {
  const playedAGame = { game: { status: { in: [...PLAYED_GAME_STATUSES] } } }

  return {
    isGuest: true,
    OR: [
      // No game ever started under this identity - nothing to lose.
      {
        lastActiveAt: { lt: cutoff },
        players: { none: playedAGame },
      },
      // Played, but idle long enough that their identity token is nearly dead too.
      // The relation filter is what stops this branch quietly becoming a blanket
      // cap on CLEANUP_GUEST_DAYS: without it a never-played guest was deleted at
      // playedCutoff however far the operator turned the knob up.
      {
        lastActiveAt: { lt: playedCutoff },
        players: { some: playedAGame },
      },
    ],
  }
}

async function cleanupOldGuests(opts: CleanupOptions = {}) {
  const envDays = process.env.CLEANUP_GUEST_DAYS
    ? Number.parseInt(process.env.CLEANUP_GUEST_DAYS, 10)
    : undefined
  const days = resolveCleanupGuestDays(opts.days ?? envDays)
  const dryRun = opts.dryRun ?? process.argv.includes('--dry-run')
  const shouldDisconnect = opts.disconnect ?? true

  try {
    console.log('🧹 Starting guest cleanup...')

    // Calculate the cutoff dates (N days ago)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const playedDays = resolvePlayedCleanupDays(days)
    const playedCutoff = new Date()
    playedCutoff.setDate(playedCutoff.getDate() - playedDays)

    console.log(`📅 Cutoff date: ${cutoff.toISOString()} (never played, inactive for > ${days} days)`)
    console.log(`📅 Cutoff date: ${playedCutoff.toISOString()} (played a game, inactive for > ${playedDays} days)`)

    const where = buildGuestCleanupWhere(cutoff, playedCutoff)

    // Find old guest users (we use lastActiveAt which is non-nullable)
    const oldGuests = await prisma.users.findMany({
      where,
      select: {
        id: true,
        username: true,
        lastActiveAt: true,
        createdAt: true,
      },
    })

    if (oldGuests.length === 0) {
      console.log('✅ No old guests to clean up')
      return { deleted: 0 }
    }

    console.log(`🔍 Found ${oldGuests.length} old guest(s):`)
    oldGuests.forEach((guest) => {
      const last = guest.lastActiveAt ?? guest.createdAt
      const daysSinceActive = Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
      // The id only: this list is written to the logs of a job that erases these people.
      console.log(`  - ${guest.id} - Last active ${daysSinceActive} days ago`)
    })

    if (dryRun) {
      console.log('⚠️ Dry run enabled — no users will be deleted')
      return { deleted: 0 }
    }

    // Their names outlive the row in other players' Games.state and replays,
    // and a feedback reply address outlives it in Feedback (#1128). Scrubbed
    // for exactly the listed guests, before the rows go.
    const identities = oldGuests.map((guest) => ({ id: guest.id, username: guest.username }))
    const scrubbed = await scrubPlayersFromGameRecords(identities)
    const feedbackDetached = await detachFeedbackFrom(identities.map((identity) => identity.id))
    console.log(`Scrubbed ${scrubbed.games} game(s), ${scrubbed.snapshots} snapshot(s), ${feedbackDetached} feedback row(s)`)

    // Delete exactly the listed, scrubbed set: the where clause again, so a guest
    // who came back in the meantime is kept, narrowed to the listed ids, so a
    // guest who crossed the cutoff since the listing waits for tomorrow's run
    // instead of going unscrubbed.
    const result = await prisma.users.deleteMany({
      where: { AND: [where, { id: { in: identities.map((identity) => identity.id) } }] },
    })

    console.log(`✅ Successfully deleted ${result.count} old guest user(s)`)

    // Log database stats
    const totalGuests = await prisma.users.count({ where: { isGuest: true } })
    const totalUsers = await prisma.users.count()

    console.log('📊 Database stats:')
    console.log(`  - Active guests: ${totalGuests}`)
    console.log(`  - Total users: ${totalUsers}`)
    console.log(`  - Regular users: ${totalUsers - totalGuests}`)

    return { deleted: result.count }
  } catch (error: unknown) {
    console.error('❌ Error cleaning up old guests:', error as Error)
    throw error
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect()
    }
  }
}

// Run if executed directly.
const isMain = typeof require !== 'undefined' && require.main === module

if (isMain) {
  // parse simple args: --days=N and --dry-run
  const daysArg = process.argv.find((a) => a.startsWith('--days='))
  const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : undefined
  const dryRun = process.argv.includes('--dry-run')

  cleanupOldGuests({ days, dryRun, disconnect: true })
    .then(() => {
      console.log('🎉 Guest cleanup completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Guest cleanup failed:', error)
      process.exit(1)
    })
}

export {
  cleanupOldGuests,
  buildGuestCleanupWhere,
  resolvePlayedCleanupDays,
  PLAYED_GAME_STATUSES,
  DEFAULT_GUEST_CLEANUP_DAYS,
  PLAYED_GUEST_CLEANUP_DAYS,
}
