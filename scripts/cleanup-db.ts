import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupDatabase() {
  console.log('🧹 Starting database cleanup...\n')

  try {
    // 1. Delete all players
    const deletedPlayers = await prisma.players.deleteMany({})
    console.log(`✅ Deleted ${deletedPlayers.count} player records`)

    // 2. Delete all games
    const deletedGames = await prisma.games.deleteMany({})
    console.log(`✅ Deleted ${deletedGames.count} games`)

    // 3. Delete all lobbies
    const deletedLobbies = await prisma.lobbies.deleteMany({})
    console.log(`✅ Deleted ${deletedLobbies.count} lobbies`)

    // 4. Get all users except admin (for testing purposes)
    const usersToDelete = await prisma.users.findMany({
      where: {
        email: {
          not: process.env.ADMIN_EMAIL || 'admin@boardly.online'
        }
      },
      select: {
        id: true,
        email: true,
        username: true,
      }
    })

    console.log(`\n📋 Users to delete (${usersToDelete.length}):`)
    usersToDelete.forEach((user: any) => {
      console.log(`   - ${user.username || 'no username'} (${user.email || 'no email'})`)
    })

    // 5. Delete associated accounts, sessions, and tokens for users to be deleted
    for (const user of usersToDelete) {
      await prisma.accounts.deleteMany({ where: { userId: user.id } })
      await prisma.sessions.deleteMany({ where: { userId: user.id } })
    }

    // 6. Delete password reset and email verification tokens
    await prisma.passwordResetTokens.deleteMany({})
    await prisma.emailVerificationTokens.deleteMany({})
    console.log(`✅ Deleted all password reset and email verification tokens`)

    // 7. Delete users
    const deletedUsers = await prisma.users.deleteMany({
      where: {
        email: {
          not: process.env.ADMIN_EMAIL || 'admin@boardly.online'
        }
      }
    })
    console.log(`✅ Deleted ${deletedUsers.count} users`)

    // 8. Show remaining user
    const remainingUser = await prisma.users.findUnique({
      where: { email: process.env.ADMIN_EMAIL || 'admin@boardly.online' },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        createdAt: true,
      }
    })

    if (remainingUser) {
      console.log('\n✨ Remaining user:')
      console.log(`   Username: ${remainingUser.username}`)
      console.log(`   Email: ${remainingUser.email}`)
      console.log(`   Verified: ${remainingUser.emailVerified ? 'Yes' : 'No'}`)
      console.log(`   Created: ${remainingUser.createdAt.toLocaleString()}`)
    }

    console.log('\n✅ Database cleanup completed!')

  } catch (error) {
    console.error('❌ Error during cleanup:', error)
  } finally {
    await prisma.$disconnect()
  }
}

cleanupDatabase()
