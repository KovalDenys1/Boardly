/**
 * Deletes what the end-to-end tests created.
 *
 * Run as its own process by the global teardown rather than imported into it:
 * the Prisma client is ESM and uses import.meta, which Playwright's transpiler
 * loads as CommonJS and chokes on. tsx is what every other script in this repo
 * uses, and it handles it.
 *
 * Three things, in this order (#867):
 *
 * 1. `LobbyParticipations` rows for the test lobbies. The table deliberately
 *    has no relation to `Lobbies` (#816), so nothing cascades — left alone,
 *    every run adds a few dozen rows of test lobbies to the analytics that
 *    the lone-creator and games-per-lobby numbers are read from.
 * 2. The lobbies themselves. Games and players cascade from these.
 * 3. The guests the tests minted, by name prefix. The guest purge would get
 *    them after 24h idle, but it does not run often enough to keep up and the
 *    weekly guest count is read from `Users` in the meantime. The guests
 *    cached in e2e/.auth are kept: the next run reuses them, and minting
 *    replacements spends the five-per-fifteen-minutes auth budget.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/db'
import { E2E_GUEST_PREFIX, E2E_LOBBY_MARKER } from './marker'
import { describeTargetMismatch } from './database-target'

function cachedGuestIds(): string[] {
  const dir = path.join(__dirname, '..', '.auth')
  if (!existsSync(dir)) return []
  const ids: string[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
      if (typeof parsed?.guestId === 'string') ids.push(parsed.guestId)
    } catch {
      // An unreadable cache file is not a reason to keep its guest.
    }
  }
  return ids
}

async function main() {
  // The teardown runs as its own process, so it re-checks rather than trusting
  // that the config that spawned it agreed with the target (#896). Deleting
  // from the wrong database is the one failure mode that looks like success.
  const mismatch = describeTargetMismatch({
    baseUrl: process.env.E2E_BASE_URL,
    databaseUrl: process.env.DATABASE_URL,
  })
  if (mismatch) {
    console.warn(mismatch)
    console.warn('e2e cleanup: nothing removed — clean up by hand.')
    await prisma.$disconnect()
    process.exitCode = 1
    return
  }

  const lobbies = await prisma.lobbies.findMany({
    where: { name: { startsWith: E2E_LOBBY_MARKER } },
    select: { id: true },
  })
  const lobbyIds = lobbies.map((lobby) => lobby.id)

  const participations =
    lobbyIds.length === 0
      ? { count: 0 }
      : await prisma.lobbyParticipations.deleteMany({ where: { lobbyId: { in: lobbyIds } } })

  const removed =
    lobbyIds.length === 0 ? { count: 0 } : await prisma.lobbies.deleteMany({ where: { id: { in: lobbyIds } } })

  const guests = await prisma.users.deleteMany({
    where: {
      isGuest: true,
      username: { startsWith: E2E_GUEST_PREFIX },
      id: { notIn: cachedGuestIds() },
    },
  })

  console.log(
    `e2e cleanup: removed ${removed.count} test ${removed.count === 1 ? 'lobby' : 'lobbies'}, ` +
      `${participations.count} participation ${participations.count === 1 ? 'row' : 'rows'}, ` +
      `${guests.count} test ${guests.count === 1 ? 'guest' : 'guests'}`
  )
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.warn('e2e cleanup failed —', error)
  await prisma.$disconnect()
  process.exitCode = 0 // never fail a green run on cleanup
})
