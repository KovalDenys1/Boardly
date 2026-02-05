#!/usr/bin/env tsx
/**
 * Database behavior analysis for OAuth account linking
 */

import { prisma } from '../lib/db'

async function analyzeDatabaseBehavior() {
  console.log('🗄️  DATABASE BEHAVIOR ANALYSIS\n')
  console.log('═══════════════════════════════════════════════════════════\n')

  // Get all users with their accounts
  const users = await prisma.users.findMany({
    include: {
      accounts: {
        select: {
          provider: true,
          providerAccountId: true,
          type: true
        }
      },
      players: {
        select: {
          id: true,
          gameId: true
        }
      },
      lobbies: {
        select: {
          id: true,
          code: true
        }
      },
    }
  })

  console.log(`📊 Total users: ${users.length}\n`)

  for (const user of users) {
    console.log('─────────────────────────────────────────────────────────')
    console.log(`👤 User: ${user.username || 'No name'}`)
    console.log(`   ID: ${user.id}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Verified: ${user.emailVerified ? '✅' : '❌'}`)
    console.log(`   Has Password: ${user.passwordHash ? '✅' : '❌'}`)
    console.log(`   Created: ${user.createdAt.toISOString()}`)
    
    console.log(`\n   📱 Linked Accounts (${user.accounts.length}):`)
    if (user.accounts.length === 0) {
      console.log(`      None (credentials only)`)
    } else {
      user.accounts.forEach(acc => {
        console.log(`      - ${acc.provider} (${acc.type})`)
        console.log(`        ID: ${acc.providerAccountId}`)
      })
    }

    console.log(`\n   🎮 Game Activity:`)
    console.log(`      Players: ${user.players.length}`)
    console.log(`      Lobbies Created: ${user.lobbies.length}`)
    
    console.log()
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log('DATABASE STRUCTURE SCENARIOS')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('SCENARIO 1: User with credentials only')
  console.log('─────────────────────────────────────────────────────────')
  console.log('User Table:')
  console.log('  id: user_123')
  console.log('  email: user@example.com')
  console.log('  passwordHash: $2b$10$...')
  console.log('  emailVerified: null (needs verification)')
  console.log('')
  console.log('Account Table:')
  console.log('  (empty - no OAuth accounts)')
  console.log('')
  console.log('Auth Methods: Password only')
  console.log('Can Link: ✅ Any OAuth with same email')
  console.log('')

  console.log('SCENARIO 2: User links Google (same email)')
  console.log('─────────────────────────────────────────────────────────')
  console.log('User Table:')
  console.log('  id: user_123 (same)')
  console.log('  email: user@example.com')
  console.log('  passwordHash: $2b$10$... (kept)')
  console.log('  emailVerified: 2025-12-08T... (✅ auto-verified)')
  console.log('')
  console.log('Account Table:')
  console.log('  id: acc_456')
  console.log('  userId: user_123')
  console.log('  provider: google')
  console.log('  providerAccountId: 1234567890')
  console.log('  type: oauth')
  console.log('')
  console.log('Auth Methods: Password OR Google')
  console.log('Result: ✅ Single user, 2 auth methods')
  console.log('')

  console.log('SCENARIO 3: Trying to link Google (different email)')
  console.log('─────────────────────────────────────────────────────────')
  console.log('Current User (Discord):')
  console.log('  id: user_123')
  console.log('  email: discord@example.com')
  console.log('')
  console.log('Existing User (Google):')
  console.log('  id: user_789 (different!)')
  console.log('  email: google@example.com')
  console.log('')
  console.log('Google Account:')
  console.log('  userId: user_789 (linked to different user)')
  console.log('  provider: google')
  console.log('')
  console.log('Result: ❌ Error - OAuthAccountNotLinked')
  console.log('Why: Cannot link google account to user_123')
  console.log('     because it belongs to user_789')
  console.log('')

  console.log('SCENARIO 4: Multiple OAuth providers')
  console.log('─────────────────────────────────────────────────────────')
  console.log('User Table:')
  console.log('  id: user_123')
  console.log('  email: user@example.com')
  console.log('  passwordHash: null (no password set)')
  console.log('  emailVerified: 2025-12-08T...')
  console.log('')
  console.log('Account Table:')
  console.log('  [1] provider: google,  userId: user_123')
  console.log('  [2] provider: github,  userId: user_123')
  console.log('  [3] provider: discord, userId: user_123')
  console.log('')
  console.log('Auth Methods: Google OR GitHub OR Discord')
  console.log('Result: ✅ Single user, 3 auth methods')
  console.log('Note: All OAuth emails must be same for auto-link')
  console.log('')

  console.log('SCENARIO 5: After manual merge')
  console.log('─────────────────────────────────────────────────────────')
  console.log('BEFORE:')
  console.log('  User A: id=user_123, email=discord@example.com')
  console.log('    Account: discord')
  console.log('    Players: 5 games')
  console.log('    Lobbies: 2 created')
  console.log('')
  console.log('  User B: id=user_789, email=google@example.com')
  console.log('    Account: google')
  console.log('    Players: 3 games')
  console.log('    Lobbies: 1 created')
  console.log('')
  console.log('AFTER merge (User B → User A):')
  console.log('  User A: id=user_123, email=discord@example.com')
  console.log('    Accounts:')
  console.log('      - discord (original)')
  console.log('      - google (moved from User B)')
  console.log('    Players: 8 games (5 + 3 merged)')
  console.log('    Lobbies: 3 created (2 + 1 merged)')
  console.log('    Statistics: Combined')
  console.log('')
  console.log('  User B: DELETED ❌')
  console.log('')

  console.log('═══════════════════════════════════════════════════════════')
  console.log('DATABASE CONSTRAINTS & SAFETY')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('✅ ENFORCED BY DATABASE:')
  console.log('  - User.email must be unique')
  console.log('  - Account(provider, providerAccountId) must be unique')
  console.log('  - Account.userId → User.id (foreign key)')
  console.log('  - Cannot delete User if has active sessions')
  console.log('  - CASCADE delete: User → Accounts, Sessions, Players')
  console.log('')

  console.log('✅ ENFORCED BY APPLICATION:')
  console.log('  - Cannot unlink last auth method')
  console.log('  - Auto-link only when emails match')
  console.log('  - Manual merge requires confirmation')
  console.log('  - OAuth accounts auto-verify email')
  console.log('')

  console.log('⚠️  EDGE CASES HANDLED:')
  console.log('  1. OAuth email already taken → Error page')
  console.log('  2. Unlinking last account → Blocked')
  console.log('  3. Merge duplicate players → De-duplicated')
  console.log('  4. Orphaned sessions → Cleaned up')
  console.log('')

  console.log('═══════════════════════════════════════════════════════════')
  console.log('RELATIONSHIP DIAGRAM')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('User (Primary Table)')
  console.log('  ├─ id (PK)')
  console.log('  ├─ email (UNIQUE)')
  console.log('  ├─ passwordHash (optional)')
  console.log('  ├─ emailVerified')
  console.log('  │')
  console.log('  ├─ Account[] (1:Many)')
  console.log('  │   ├─ provider (google|github|discord)')
  console.log('  │   ├─ providerAccountId')
  console.log('  │   ├─ access_token')
  console.log('  │   └─ UNIQUE(provider, providerAccountId)')
  console.log('  │')
  console.log('  ├─ Session[] (1:Many)')
  console.log('  │   ├─ sessionToken')
  console.log('  │   └─ expires')
  console.log('  │')
  console.log('  ├─ Player[] (1:Many)')
  console.log('  │   ├─ gameId')
  console.log('  │   ├─ score')
  console.log('  │   └─ isWinner')
  console.log('  │')
  console.log('  ├─ Lobby[] (1:Many)')
  console.log('  │   ├─ code')
  console.log('  │   └─ creatorId (FK to User)')
  console.log('  │')
  console.log('  └─ UserStatistics (1:1)')
  console.log('      ├─ totalGames')
  console.log('      └─ totalWins')
  console.log('')

  console.log('═══════════════════════════════════════════════════════════')
  console.log('QUERIES FOR COMMON OPERATIONS')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('1. Check if OAuth account exists:')
  console.log('   SELECT * FROM Account')
  console.log('   WHERE provider = \'google\'')
  console.log('   AND providerAccountId = \'1234567890\';')
  console.log('')

  console.log('2. Check if user has this email:')
  console.log('   SELECT * FROM User')
  console.log('   WHERE email = \'user@example.com\';')
  console.log('')

  console.log('3. Get all auth methods for user:')
  console.log('   SELECT provider, type FROM Account')
  console.log('   WHERE userId = \'user_123\';')
  console.log('   UNION')
  console.log('   SELECT \'credentials\', \'password\' FROM User')
  console.log('   WHERE id = \'user_123\' AND passwordHash IS NOT NULL;')
  console.log('')

  console.log('4. Link OAuth to existing user:')
  console.log('   INSERT INTO Account (userId, provider, providerAccountId, ...)')
  console.log('   VALUES (\'user_123\', \'google\', \'1234567890\', ...);')
  console.log('')

  console.log('5. Unlink OAuth account:')
  console.log('   DELETE FROM Account')
  console.log('   WHERE userId = \'user_123\'')
  console.log('   AND provider = \'google\';')
  console.log('')

  console.log('6. Merge users (transaction):')
  console.log('   BEGIN TRANSACTION;')
  console.log('   UPDATE Account SET userId = \'user_123\' WHERE userId = \'user_789\';')
  console.log('   UPDATE Player SET userId = \'user_123\' WHERE userId = \'user_789\';')
  console.log('   UPDATE Lobby SET creatorId = \'user_123\' WHERE creatorId = \'user_789\';')
  console.log('   -- Merge statistics --')
  console.log('   DELETE FROM User WHERE id = \'user_789\';')
  console.log('   COMMIT;')
  console.log('')

  console.log('✨ Analysis complete!\n')
  
  await prisma.$disconnect()
}

analyzeDatabaseBehavior()
  .catch(console.error)
