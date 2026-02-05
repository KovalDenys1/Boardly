#!/usr/bin/env tsx
/**
 * Script to auto-verify all OAuth users who don't have email verified
 */

import { prisma } from '../lib/db'

async function verifyOAuthUsers() {
  console.log('🔍 Finding OAuth users with unverified emails...\n')

  // Find all users who have OAuth accounts but no email verification
  const users = await prisma.users.findMany({
    where: {
      emailVerified: null,
      accounts: {
        some: {
          type: 'oauth'
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
    }
  })

  if (users.length === 0) {
    console.log('✅ No OAuth users found with unverified emails!')
    return
  }

  console.log(`Found ${users.length} OAuth user(s) with unverified emails:\n`)

  for (const user of users) {
    const providers = user.accounts.map(acc => acc.provider).join(', ')
    console.log(`📧 ${user.email}`)
    console.log(`   Username: ${user.username}`)
    console.log(`   Providers: ${providers}`)
    console.log(`   Created: ${user.createdAt.toISOString()}`)
    
    // Auto-verify
    await prisma.users.update({
      where: { id: user.id },
      data: { 
        emailVerified: new Date(),
        // Set username if missing
        username: user.username?.replace(/\s+/g, '_').toLowerCase() || user.email?.split('@')[0] || 'user'
      }
    })
    
    console.log(`   ✅ Email verified!\n`)
  }

  console.log(`\n✨ Successfully verified ${users.length} OAuth user(s)!`)
}

// Run the script
verifyOAuthUsers()
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
