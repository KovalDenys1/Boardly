#!/usr/bin/env tsx
import { prisma } from '../lib/db'
import { cleanupOldReplaySnapshots } from '../lib/cleanup-replays'

async function run() {
  const daysArg = process.argv.find((arg) => arg.startsWith('--days='))
  const days = daysArg ? Number.parseInt(daysArg.split('=')[1], 10) : undefined

  try {
    const result = await cleanupOldReplaySnapshots(days)
    console.log('Replay cleanup completed', result)
    process.exit(0)
  } catch (error) {
    console.error('Replay cleanup failed', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

const isMain = typeof require !== 'undefined' ? require.main === module : (import.meta && import.meta.url === `file://${process.argv[1]}`)

if (isMain) {
  void run()
}
