#!/usr/bin/env tsx
/**
 * Cleanup Old Guest Users Script
 *
 * Deletes abandoned guest identities. A guest who has finished a game is a
 * player rather than an abandoned identity and is kept far longer - see the
 * retention constants below.
 *
 * Run: npm run cleanup:old-guests
 * Cron: daily at 3 AM UTC, via /api/cron/maintenance
 */

import { prisma } from '../lib/db'
import type { Prisma } from '../prisma/client'

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
 * boardly_guest_identity) and the token proving it is signed for 180 days
 * (lib/guest-auth.ts). The row that identity points at used to be deleted after
 * three days of inactivity, and Players.userId cascades on delete
 * (prisma/schema.prisma), so a guest who came back on day four found every game
 * they had played gone and counted as a new person (#1047).
 *
 * The window therefore depends on whether there is anything worth keeping:
 *
 * - No finished game: this is the abandoned identity the job was written for -
 *   a display name, a placeholder email, nothing attached to it. Three days,
 *   unchanged, still overridable with CLEANUP_GUEST_DAYS.
 * - At least one finished game: a real player. Ninety days, which is what this
 *   repo already keeps replays for (lib/cleanup-replays.ts) and how long the
 *   acquisition-source cookie lives, and is comfortably inside the 180-day
 *   identity token - so a row is never kept past the point where the returning
 *   guest could still prove it is theirs.
 */
const DEFAULT_GUEST_CLEANUP_DAYS = 3
const PLAYED_GUEST_CLEANUP_DAYS = 90

function resolveCleanupGuestDays(rawDays: number | undefined): number {
  if (!Number.isFinite(rawDays) || (rawDays as number) <= 0) {
    return DEFAULT_GUEST_CLEANUP_DAYS
  }

  return Math.floor(rawDays as number)
}

/**
 * The delete set. Built once and used for both the listing and the delete, so
 * the count that gets logged can never describe a different set of rows from
 * the one that is actually removed.
 */
function buildGuestCleanupWhere(cutoff: Date, playedCutoff: Date): Prisma.UsersWhereInput {
  return {
    isGuest: true,
    OR: [
      // Nothing was ever finished under this identity - nothing to lose.
      {
        lastActiveAt: { lt: cutoff },
        players: { none: { game: { status: 'finished' } } },
      },
      // Played, but idle long enough that their identity token is nearly dead too.
      { lastActiveAt: { lt: playedCutoff } },
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

    const playedCutoff = new Date()
    playedCutoff.setDate(playedCutoff.getDate() - PLAYED_GUEST_CLEANUP_DAYS)

    console.log(`📅 Cutoff date: ${cutoff.toISOString()} (no finished game, inactive for > ${days} days)`)
    console.log(`📅 Cutoff date: ${playedCutoff.toISOString()} (finished a game, inactive for > ${PLAYED_GUEST_CLEANUP_DAYS} days)`)

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
      console.log(`  - ${guest.username} (${guest.id}) - Last active ${daysSinceActive} days ago`)
    })

    if (dryRun) {
      console.log('⚠️ Dry run enabled — no users will be deleted')
      return { deleted: 0 }
    }

    // Delete old guests in a safe manner
    const result = await prisma.users.deleteMany({ where })

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

export { cleanupOldGuests, buildGuestCleanupWhere, DEFAULT_GUEST_CLEANUP_DAYS, PLAYED_GUEST_CLEANUP_DAYS }
