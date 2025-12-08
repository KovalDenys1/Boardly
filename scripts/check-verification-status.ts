import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkVerificationStatus() {
  console.log('📧 Email Verification Status Check\n')
  console.log('=' .repeat(60))

  try {
    // Total users
    const totalUsers = await prisma.user.count({
      where: { isBot: false }
    })

    // Verified users
    const verifiedUsers = await prisma.user.count({
      where: {
        isBot: false,
        emailVerified: { not: null }
      }
    })

    // Unverified users
    const unverifiedUsers = await prisma.user.count({
      where: {
        isBot: false,
        emailVerified: null,
        accounts: { none: {} } // Email/password only
      }
    })

    // OAuth users (don't need verification)
    const oauthUsers = await prisma.user.count({
      where: {
        isBot: false,
        accounts: { some: {} }
      }
    })

    console.log('\n👥 User Statistics:')
    console.log(`   Total real users: ${totalUsers}`)
    console.log(`   ✅ Verified email users: ${verifiedUsers}`)
    console.log(`   ⚠️  Unverified email users: ${unverifiedUsers}`)
    console.log(`   🔐 OAuth users: ${oauthUsers}`)

    if (unverifiedUsers > 0) {
      // Breakdown by age
      const now = Date.now()
      const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000)
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000)
      const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000)
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

      const lessThanDay = await prisma.user.count({
        where: {
          isBot: false,
          emailVerified: null,
          accounts: { none: {} },
          createdAt: { gte: oneDayAgo }
        }
      })

      const oneToThree = await prisma.user.count({
        where: {
          isBot: false,
          emailVerified: null,
          accounts: { none: {} },
          createdAt: { lt: oneDayAgo, gte: threeDaysAgo }
        }
      })

      const threeToFive = await prisma.user.count({
        where: {
          isBot: false,
          emailVerified: null,
          accounts: { none: {} },
          createdAt: { lt: threeDaysAgo, gte: fiveDaysAgo }
        }
      })

      const fiveToSeven = await prisma.user.count({
        where: {
          isBot: false,
          emailVerified: null,
          accounts: { none: {} },
          createdAt: { lt: fiveDaysAgo, gte: sevenDaysAgo }
        }
      })

      const moreThanSeven = await prisma.user.count({
        where: {
          isBot: false,
          emailVerified: null,
          accounts: { none: {} },
          createdAt: { lt: sevenDaysAgo }
        }
      })

      console.log('\n📊 Unverified Users by Age:')
      console.log(`   < 1 day: ${lessThanDay}`)
      console.log(`   1-3 days: ${oneToThree}`)
      console.log(`   3-5 days: ${threeToFive}`)
      console.log(`   5-7 days (⚠️  warning zone): ${fiveToSeven}`)
      console.log(`   > 7 days (🗑️  deletion zone): ${moreThanSeven}`)

      if (moreThanSeven > 0) {
        const oldAccounts = await prisma.user.findMany({
          where: {
            isBot: false,
            emailVerified: null,
            accounts: { none: {} },
            createdAt: { lt: sevenDaysAgo }
          },
          select: {
            email: true,
            username: true,
            createdAt: true
          }
        })

        console.log('\n🗑️  Accounts ready for deletion:')
        oldAccounts.forEach(user => {
          const daysOld = Math.floor(
            (now - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          )
          console.log(`   - ${user.email} (${user.username}) - ${daysOld} days old`)
        })
      }
    }

    // Pending verification tokens
    const activeTokens = await prisma.emailVerificationToken.count({
      where: {
        expires: { gt: new Date() }
      }
    })

    const expiredTokens = await prisma.emailVerificationToken.count({
      where: {
        expires: { lte: new Date() }
      }
    })

    console.log('\n🎫 Verification Tokens:')
    console.log(`   Active tokens: ${activeTokens}`)
    console.log(`   Expired tokens: ${expiredTokens}`)

    if (expiredTokens > 0) {
      console.log(`   💡 Run cleanup to remove expired tokens`)
    }

    console.log('\n' + '='.repeat(60))

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkVerificationStatus()
