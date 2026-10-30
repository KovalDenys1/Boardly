/**
 * Delete lobbies by code.
 *
 * The screenshot capture removes only the lobbies it created: cleanup.ts
 * deletes every lobby carrying the E2E marker, and on the shared dev database
 * that includes another checkout's run in progress. The marker is required
 * too, so a code that was reused by a real lobby is left alone. Its own
 * process, like delete-guests.ts.
 */
import { prisma } from '@/lib/db'
import { E2E_LOBBY_MARKER } from './marker'

async function main() {
  const codes = process.argv.slice(2)
  if (codes.length === 0) return

  const lobbies = await prisma.lobbies.findMany({
    where: { code: { in: codes }, name: { startsWith: E2E_LOBBY_MARKER } },
    select: { id: true },
  })
  const ids = lobbies.map((lobby) => lobby.id)
  if (ids.length > 0) {
    // No relation to Lobbies (#816), so nothing cascades into this table.
    await prisma.lobbyParticipations.deleteMany({ where: { lobbyId: { in: ids } } })
  }
  const removed = ids.length === 0 ? { count: 0 } : await prisma.lobbies.deleteMany({ where: { id: { in: ids } } })
  console.log(`capture cleanup: removed ${removed.count} of ${codes.length} lobbies`)
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.warn('capture cleanup failed –', error)
  await prisma.$disconnect()
  process.exitCode = 1
})
