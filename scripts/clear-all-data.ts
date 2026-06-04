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

    console.log('Deleting Accounts...')
    const accounts = await prisma.accounts.deleteMany({})
    console.log(`✅ Deleted ${accounts.count} accounts`)

    console.log('Deleting EmailVerificationTokens...')
    const emailTokens = await prisma.emailVerificationTokens.deleteMany({})
    console.log(`✅ Deleted ${emailTokens.count} email verification tokens`)

    console.log('Deleting PasswordResetTokens...')
    const resetTokens = await prisma.passwordResetTokens.deleteMany({})
    console.log(`✅ Deleted ${resetTokens.count} password reset tokens`)

    console.log('Deleting Users...')
    const users = await prisma.users.deleteMany({})
    console.log(`✅ Deleted ${users.count} users`)

    console.log('\n✅ All tables cleared successfully!')

    // Verify
    console.log('\n📊 Verifying tables are empty:')
    const counts = await Promise.all([
      prisma.users.count(),
      prisma.accounts.count(),
      prisma.lobbies.count(),
      prisma.games.count(),
      prisma.players.count(),
      prisma.emailVerificationTokens.count(),
      prisma.passwordResetTokens.count(),
    ])

    console.log(`  Users: ${counts[0]}`)
    console.log(`  Accounts: ${counts[1]}`)
    console.log(`  Lobbies: ${counts[2]}`)
    console.log(`  Games: ${counts[3]}`)
    console.log(`  Players: ${counts[4]}`)
    console.log(`  Email Verification Tokens: ${counts[5]}`)
    console.log(`  Password Reset Tokens: ${counts[6]}`)

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
