/**
 * Clear all tables in the database
 * WARNING: This will delete ALL data!
 */

import { prisma } from '../lib/db'

async function clearAllTables() {
  console.log('🗑️  Clearing all tables...\n')

  try {
    // Delete in correct order (respecting foreign keys)
    console.log('Deleting Players...')
    const players = await prisma.players.deleteMany({})
    console.log(`✅ Deleted ${players.count} players`)

    console.log('Deleting Games...')
    const games = await prisma.games.deleteMany({})
    console.log(`✅ Deleted ${games.count} games`)

    console.log('Deleting Lobbies...')
    const lobbies = await prisma.lobbies.deleteMany({})
    console.log(`✅ Deleted ${lobbies.count} lobbies`)

    console.log('Deleting Sessions...')
    const sessions = await prisma.sessions.deleteMany({})
    console.log(`✅ Deleted ${sessions.count} sessions`)

    console.log('Deleting Accounts...')
    const accounts = await prisma.accounts.deleteMany({})
    console.log(`✅ Deleted ${accounts.count} accounts`)

    console.log('Deleting Verification Tokens...')
    const tokens = await prisma.verificationTokens.deleteMany({})
    console.log(`✅ Deleted ${tokens.count} verification tokens`)

    console.log('Deleting Users...')
    const users = await prisma.users.deleteMany({})
    console.log(`✅ Deleted ${users.count} users`)

    console.log('\n✅ All tables cleared successfully!')
    
    // Verify
    console.log('\n📊 Verifying tables are empty:')
    const counts = await Promise.all([
      prisma.users.count(),
      prisma.accounts.count(),
      prisma.sessions.count(),
      prisma.lobbies.count(),
      prisma.games.count(),
      prisma.players.count(),
      prisma.verificationTokens.count(),
    ])

    console.log(`  Users: ${counts[0]}`)
    console.log(`  Accounts: ${counts[1]}`)
    console.log(`  Sessions: ${counts[2]}`)
    console.log(`  Lobbies: ${counts[3]}`)
    console.log(`  Games: ${counts[4]}`)
    console.log(`  Players: ${counts[5]}`)
    console.log(`  Verification Tokens: ${counts[6]}`)
    
    const total = counts.reduce((a: number, b: number) => a + b, 0)
    if (total === 0) {
      console.log('\n✅ All tables are empty! Database is clean.')
    } else {
      console.log(`\n⚠️  Warning: ${total} records still remain`)
    }
  } catch (error) {
    console.error('❌ Error clearing tables:', error)
    throw error
  }
}

clearAllTables()
  .catch((error) => {
    console.error('Failed to clear tables:', error)
    process.exit(1)
  })
  .finally(() => {
    prisma.$disconnect()
  })
