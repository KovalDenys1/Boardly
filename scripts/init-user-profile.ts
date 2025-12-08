import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function initializeUserProfile() {
  console.log('🔧 Initializing user profile with new fields...\n')

  try {
    // Find admin user
    const user = await prisma.user.findUnique({
      where: { email: process.env.ADMIN_EMAIL || 'admin@boardly.online' }
    })

    if (!user) {
      console.log('❌ User not found')
      return
    }

    console.log(`✅ Found user: ${user.username} (${user.email})`)

    // Update user with default values for new fields
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        bio: null, // User can fill this later
        avatar: 'default-avatar', // Default avatar
        preferences: JSON.stringify({
          language: 'en',
          notifications: {
            email: true,
            gameInvites: true,
            achievements: true
          },
          theme: 'light',
          sound: true
        })
      }
    })

    console.log('✅ User profile updated with new fields')

    // Create UserStatistics record
    const stats = await prisma.userStatistics.create({
      data: {
        userId: user.id,
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        winRate: 0,
        yahtzeeStats: JSON.stringify({
          games: 0,
          wins: 0,
          highScore: 0,
          avgScore: 0,
          perfectGames: 0,
          yahtzees: 0
        }),
        chessStats: JSON.stringify({
          games: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          rating: 1200
        }),
        guessTheSpyStats: JSON.stringify({
          games: 0,
          wins: 0,
          correctGuesses: 0,
          timesWasSpy: 0
        }),
        totalPlayTime: 0,
        longestStreak: 0,
        currentStreak: 0
      }
    })

    console.log('✅ User statistics created')

    // Create some sample achievements
    const achievements = [
      {
        code: 'first_game',
        name: 'First Steps',
        description: 'Play your first game',
        gameType: null,
        category: 'milestone',
        requirement: JSON.stringify({ type: 'games', count: 1 }),
        points: 10,
        rarity: 'common'
      },
      {
        code: 'yahtzee_first_win',
        name: 'Yahtzee Beginner',
        description: 'Win your first Yahtzee game',
        gameType: 'yahtzee',
        category: 'milestone',
        requirement: JSON.stringify({ type: 'wins', count: 1, game: 'yahtzee' }),
        points: 25,
        rarity: 'common'
      },
      {
        code: 'yahtzee_10_wins',
        name: 'Yahtzee Enthusiast',
        description: 'Win 10 Yahtzee games',
        gameType: 'yahtzee',
        category: 'milestone',
        requirement: JSON.stringify({ type: 'wins', count: 10, game: 'yahtzee' }),
        points: 50,
        rarity: 'rare'
      },
      {
        code: 'yahtzee_perfect_game',
        name: 'Perfect Roll',
        description: 'Score 375 points in a Yahtzee game',
        gameType: 'yahtzee',
        category: 'skill',
        requirement: JSON.stringify({ type: 'score', value: 375, game: 'yahtzee' }),
        points: 100,
        rarity: 'epic'
      },
      {
        code: 'social_butterfly',
        name: 'Social Butterfly',
        description: 'Play games with 10 different players',
        gameType: null,
        category: 'social',
        requirement: JSON.stringify({ type: 'unique_opponents', count: 10 }),
        points: 50,
        rarity: 'rare'
      },
      {
        code: 'week_streak',
        name: 'Dedicated Player',
        description: 'Play games for 7 days in a row',
        gameType: null,
        category: 'milestone',
        requirement: JSON.stringify({ type: 'streak', days: 7 }),
        points: 75,
        rarity: 'rare'
      }
    ]

    for (const achievement of achievements) {
      await prisma.achievement.create({ data: achievement })
    }

    console.log(`✅ Created ${achievements.length} achievements`)

    // Show final state
    const finalUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        statistics: true
      }
    })

    console.log('\n📊 Final user state:')
    console.log(JSON.stringify(finalUser, null, 2))

    const allAchievements = await prisma.achievement.findMany()
    console.log(`\n🏆 Total achievements in database: ${allAchievements.length}`)

    console.log('\n✅ Initialization completed!')

  } catch (error) {
    console.error('❌ Error during initialization:', error)
  } finally {
    await prisma.$disconnect()
  }
}

initializeUserProfile()
