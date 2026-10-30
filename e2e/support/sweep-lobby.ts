// Scoped to one test lobby: the real sweep would also close other agents' lobbies on the shared dev database.
import { prisma } from '@/lib/db'
import { E2E_LOBBY_MARKER } from './marker'

async function main() {
  const code = process.argv[2]
  if (!code) throw new Error('usage: sweep-lobby.ts <lobby code>')

  const closed = await prisma.lobbies.updateMany({
    where: {
      code,
      name: { startsWith: E2E_LOBBY_MARKER },
      isActive: true,
      games: { none: { status: { in: ['waiting', 'playing'] } } },
    },
    data: { isActive: false, spectatorCount: 0 },
  })
  if (closed.count !== 1) {
    throw new Error(`sweep-lobby: expected to close test lobby ${code}, closed ${closed.count}`)
  }
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exitCode = 1
})
