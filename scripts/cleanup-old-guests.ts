#!/usr/bin/env tsx
/**
 * Cleanup Old Guest Users Script
 * 
 * Deletes guest users who haven't been active for 3+ days
 * This helps keep the database clean without affecting regular users
 * 
 * Run: npm run cleanup:old-guests
 * Cron: Daily at 3 AM UTC
 */

import { prisma } from '../lib/db'

interface CleanupOptions {
  days?: number
  dryRun?: boolean
  disconnect?: boolean
}

const DEFAULT_GUEST_CLEANUP_DAYS = 3

function resolveCleanupGuestDays(rawDays: number | undefined): number {
  if (!Number.isFinite(rawDays) || (rawDays as number) <= 0) {
    return DEFAULT_GUEST_CLEANUP_DAYS
  }

  return Math.floor(rawDays as number)
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

    // Calculate the cutoff date (N days ago)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    console.log(`📅 Cutoff date: ${cutoff.toISOString()} (inactive for > ${days} days)`)

    // Find old guest users (we use lastActiveAt which is non-nullable)
    const oldGuests = await prisma.users.findMany({
      where: {
        isGuest: true,
        lastActiveAt: { lt: cutoff },
      },
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
    const result = await prisma.users.deleteMany({
      where: {
        isGuest: true,
        lastActiveAt: { lt: cutoff },
      },
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

export { cleanupOldGuests }
