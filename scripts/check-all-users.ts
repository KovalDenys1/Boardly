#!/usr/bin/env tsx
/**
 * Check all users and their OAuth accounts
 */

import { prisma } from '../lib/db'

async function checkUsers() {
  console.log('🔍 Checking all users...\n')

  const users = await prisma.users.findMany({
    include: {
      accounts: {
        select: {
          provider: true,
          providerAccountId: true,
          type: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10
  })

  console.log(`Found ${users.length} user(s):\n`)

  for (const user of users) {
    console.log(`👤 ${user.username || 'No username'}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Verified: ${user.emailVerified ? '✅ Yes' : '❌ No'}`)
    console.log(`   Password: ${user.passwordHash ? '✅ Has password' : '❌ No password (OAuth only)'}`)
    console.log(`   Created: ${user.createdAt.toISOString()}`)
    
    if (user.accounts.length > 0) {
      console.log(`   Linked accounts:`)
      user.accounts.forEach(acc => {
        console.log(`     - ${acc.provider} (${acc.type})`)
      })
    } else {
      console.log(`   Linked accounts: None`)
    }
    
    console.log()
  }
}

checkUsers()
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
