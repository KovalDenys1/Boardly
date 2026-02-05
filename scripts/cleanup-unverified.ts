import { cleanupUnverifiedAccounts, warnUnverifiedAccounts } from '../lib/cleanup-unverified'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Manual Cleanup of Unverified Accounts\n')
  console.log('=' .repeat(60))

  try {
    // Check current status
    const unverifiedCount = await prisma.users.count({
      where: {
        emailVerified: null,
        bot: null,
        accounts: { none: {} }
      }
    })

    const oldUnverifiedCount = await prisma.users.count({
      where: {
        emailVerified: null,
        bot: null,
        accounts: { none: {} },
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })

    console.log('\n📊 Current Status:')
    console.log(`   Total unverified accounts: ${unverifiedCount}`)
    console.log(`   Unverified accounts older than 7 days: ${oldUnverifiedCount}`)

    if (unverifiedCount === 0) {
      console.log('\n✅ No unverified accounts found!')
      return
    }

    // Show accounts that would be warned
    console.log('\n⚠️  Checking accounts that need warnings...')
    const warningResult = await warnUnverifiedAccounts(2, 7)
    
    if (warningResult.warned > 0) {
      console.log(`   Found ${warningResult.warned} accounts to warn:`)
      warningResult.users.forEach(user => {
        console.log(`   - ${user.email} (${user.username}) - ${user.daysUntilDeletion} days until deletion`)
      })
    } else {
      console.log('   No accounts need warning')
    }

    // Show accounts that would be deleted
    if (oldUnverifiedCount > 0) {
      const accountsToDelete = await prisma.users.findMany({
        where: {
          emailVerified: null,
          bot: null,
          accounts: { none: {} },
          createdAt: {
            lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        select: {
          email: true,
          username: true,
          createdAt: true
        },
        take: 10
      })

      console.log(`\n🗑️  Accounts to be deleted (${oldUnverifiedCount} total):`)
      accountsToDelete.forEach((user: any) => {
        const daysOld = Math.floor(
          (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        )
        console.log(`   - ${user.email} (${user.username}) - ${daysOld} days old`)
      })

      // Ask for confirmation
      console.log('\n⚠️  WARNING: This will permanently delete these accounts!')
      console.log('Press Ctrl+C to cancel or wait 5 seconds to continue...\n')
      
      await new Promise(resolve => setTimeout(resolve, 5000))

      console.log('🗑️  Deleting unverified accounts...')
      const cleanupResult = await cleanupUnverifiedAccounts(7)

      console.log(`\n✅ Cleanup completed!`)
      console.log(`   Deleted: ${cleanupResult.deleted} accounts`)
      
      if (cleanupResult.deleted > 0) {
        console.log('\n   Deleted accounts:')
        cleanupResult.users.forEach(user => {
          console.log(`   - ${user.email} (${user.username})`)
        })
      }
    } else {
      console.log('\n✅ No accounts to delete (all unverified accounts are less than 7 days old)')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Cleanup process completed!')

  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
