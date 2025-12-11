import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function getDatabaseStats() {
  console.log('📊 Database Statistics\n')
  console.log('=' .repeat(60))

  try {
    // User statistics
    const totalUsers = await prisma.user.count()
    const botUsers = await prisma.user.count({ where: { isBot: true } })
    const realUsers = totalUsers - botUsers
    const verifiedUsers = await prisma.user.count({ where: { emailVerified: { not: null } } })
    const oauthUsers = await prisma.account.count()

    console.log('\n👥 Users:')
    console.log(`   Total: ${totalUsers}`)
    console.log(`   Real users: ${realUsers}`)
    console.log(`   Bot users: ${botUsers}`)
    console.log(`   Verified emails: ${verifiedUsers}`)
    console.log(`   OAuth accounts: ${oauthUsers}`)

    // Recent users
    const recentUsers = await prisma.user.findMany({
      where: { isBot: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        username: true,
        email: true,
        emailVerified: true,
        createdAt: true,
      }
    })
    
    if (recentUsers.length > 0) {
      console.log('\n   Recent users:')
      recentUsers.forEach(user => {
        const verified = user.emailVerified ? '✅' : '❌'
        console.log(`   - ${user.username || 'no username'} (${user.email || 'no email'}) ${verified}`)
      })
    }

    // Lobby statistics
    const totalLobbies = await prisma.lobby.count()
    const activeLobbies = await prisma.lobby.count({ where: { isActive: true } })
    const lobbyByGame = await prisma.lobby.groupBy({
      by: ['gameType'],
      _count: true,
    })

    console.log('\n🎮 Lobbies:')
    console.log(`   Total: ${totalLobbies}`)
    console.log(`   Active: ${activeLobbies}`)
    console.log('   By game type:')
    lobbyByGame.forEach(group => {
      console.log(`   - ${group.gameType}: ${group._count}`)
    })

    // Game statistics
    const totalGames = await prisma.game.count()
    const gamesByStatus = await prisma.game.groupBy({
      by: ['status'],
      _count: true,
    })

    console.log('\n🎲 Games:')
    console.log(`   Total: ${totalGames}`)
    console.log('   By status:')
    gamesByStatus.forEach(group => {
      console.log(`   - ${group.status}: ${group._count}`)
    })

    // Player statistics
    const totalPlayers = await prisma.player.count()
    const avgPlayersPerGame = totalGames > 0 ? (totalPlayers / totalGames).toFixed(2) : 0

    console.log('\n👤 Players:')
    console.log(`   Total player entries: ${totalPlayers}`)
    console.log(`   Avg players per game: ${avgPlayersPerGame}`)

    // Active sessions
    const activeSessions = await prisma.session.count({
      where: { expires: { gt: new Date() } }
    })

    console.log('\n🔐 Sessions:')
    console.log(`   Active sessions: ${activeSessions}`)

    // Recent activity
    const recentGames = await prisma.game.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        lobby: {
          select: {
            name: true,
            code: true,
          }
        },
        players: {
          include: {
            user: {
              select: {
                username: true,
                isBot: true,
              }
            }
          }
        }
      }
    })

    if (recentGames.length > 0) {
      console.log('\n🕐 Recent Games:')
      recentGames.forEach(game => {
        const playerNames = game.players.map(p => 
          p.user.isBot ? `🤖 ${p.user.username}` : p.user.username
        ).join(', ')
        console.log(`   - ${game.lobby.name} (${game.lobby.code}) - ${game.status}`)
        console.log(`     Players: ${playerNames}`)
        console.log(`     Created: ${game.createdAt.toLocaleString()}`)
      })
    }

    console.log('\n' + '='.repeat(60))

  } catch (error) {
    console.error('Error fetching database stats:', error)
  } finally {
    await prisma.$disconnect()
  }
}

getDatabaseStats()
