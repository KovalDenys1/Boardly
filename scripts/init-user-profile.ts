import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function initializeUserProfile() {
  console.log('🔧 Initializing user profile with new fields...\n')

  try {
    // Find admin user
    const user = await prisma.users.findUnique({
      where: { email: process.env.ADMIN_EMAIL || 'admin@boardly.online' }
    })

    if (!user) {
      console.log('❌ User not found')
      return
    }

    console.log(`✅ Found user: ${user.username} (${user.email})`)

    // Update user with profile fields
    await prisma.users.update({
      where: { id: user.id },
      data: {
        username: user.username || 'testuser',
      }
    })

    console.log('✅ User profile updated with new fields')

    // Show final state
    const finalUser = await prisma.users.findUnique({
      where: { id: user.id },
    })

    console.log('\n📊 Final user state:')
    console.log(JSON.stringify(finalUser, null, 2))

    console.log('\n✅ Initialization completed!')

  } catch (error) {
    console.error('❌ Error during initialization:', error)
  } finally {
    await prisma.$disconnect()
  }
}

initializeUserProfile()
