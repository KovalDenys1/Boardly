#!/usr/bin/env tsx

/**
 * Test OAuth Email Verification
 * 
 * This script checks if OAuth users are properly verified in the database
 */

import { prisma } from '../lib/db'

async function main() {
  console.log('🔍 Checking OAuth users email verification status...\n')

  // Get all users with OAuth accounts
  const usersWithOAuth = await prisma.user.findMany({
    where: {
      accounts: {
        some: {
          provider: {
            in: ['google', 'github', 'discord']
          }
        }
      }
    },
    include: {
      accounts: {
        select: {
          provider: true,
          providerAccountId: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  console.log(`Found ${usersWithOAuth.length} users with OAuth accounts\n`)

  if (usersWithOAuth.length === 0) {
    console.log('No OAuth users found. Sign in with Google/GitHub/Discord to test.')
    return
  }

  for (const user of usersWithOAuth) {
    const providers = user.accounts.map(a => a.provider).join(', ')
    const verified = user.emailVerified ? '✅ Verified' : '❌ Not Verified'
    
    console.log(`User: ${user.username || user.email}`)
    console.log(`  Email: ${user.email}`)
    console.log(`  Providers: ${providers}`)
    console.log(`  Status: ${verified}`)
    console.log(`  Verified at: ${user.emailVerified?.toISOString() || 'Never'}`)
    console.log()
  }

  // Check for unverified OAuth users (should not exist after fix)
  const unverifiedOAuth = usersWithOAuth.filter(u => !u.emailVerified)
  
  if (unverifiedOAuth.length > 0) {
    console.log(`⚠️  Found ${unverifiedOAuth.length} unverified OAuth users!`)
    console.log('This should not happen after the fix.')
    console.log('These users should be auto-verified on next sign-in.\n')
  } else {
    console.log('✅ All OAuth users are properly verified!')
  }

  // Statistics
  const stats = {
    total: usersWithOAuth.length,
    verified: usersWithOAuth.filter(u => u.emailVerified).length,
    unverified: usersWithOAuth.filter(u => !u.emailVerified).length,
    google: usersWithOAuth.filter(u => u.accounts.some(a => a.provider === 'google')).length,
    github: usersWithOAuth.filter(u => u.accounts.some(a => a.provider === 'github')).length,
    discord: usersWithOAuth.filter(u => u.accounts.some(a => a.provider === 'discord')).length,
  }

  console.log('\n📊 Statistics:')
  console.log(`  Total OAuth users: ${stats.total}`)
  console.log(`  Verified: ${stats.verified} (${(stats.verified / stats.total * 100).toFixed(1)}%)`)
  console.log(`  Unverified: ${stats.unverified}`)
  console.log(`\n  By provider:`)
  console.log(`    Google: ${stats.google}`)
  console.log(`    GitHub: ${stats.github}`)
  console.log(`    Discord: ${stats.discord}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
