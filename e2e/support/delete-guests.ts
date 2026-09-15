/**
 * Delete guests by id.
 *
 * The screenshot capture (#932) mints guests with ordinary display names, since
 * "E2Ex7k2q" would be in every product screenshot, so the prefix-based cleanup
 * cannot find them. The capture remembers the ids and hands them here once the
 * marked lobbies are gone. Its own process, like cleanup.ts: the Prisma client
 * is ESM and Playwright's transpiler loads it as CommonJS.
 */
import { prisma } from '@/lib/db'

async function main() {
  const ids = process.argv.slice(2)
  if (ids.length === 0) return

  const removed = await prisma.users.deleteMany({
    where: { isGuest: true, id: { in: ids } },
  })
  console.log(`capture cleanup: removed ${removed.count} of ${ids.length} guests`)
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.warn('capture cleanup failed —', error)
  await prisma.$disconnect()
  process.exitCode = 1
})
