/**
 * Find and fix stuck games
 * 
 * This script finds games that are stuck in "playing" status
 * where all human players have left (only bots remain).
 */

import { prisma } from '../lib/db'

async function findStuckGames() {
  console.log('🔍 Searching for stuck games...\n')

  // Find all games in "playing" status
  const playingGames = await prisma.game.findMany({
    where: {
      status: 'playing'
    },
    include: {
      lobby: true,
      players: {
        include: {
          user: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  console.log(`Found ${playingGames.length} games in "playing" status\n`)

  const stuckGames: any[] = []

  for (const game of playingGames) {
    const humanPlayers = game.players.filter(p => !p.user.isBot)
    const botPlayers = game.players.filter(p => p.user.isBot)
    
    // Game is stuck if:
    // 1. No human players remain (only bots)
    // 2. Game has been running for more than 1 hour
    const isOld = Date.now() - game.createdAt.getTime() > 60 * 60 * 1000
    const noHumans = humanPlayers.length === 0
    
    if (noHumans || (isOld && humanPlayers.length <= 1)) {
      stuckGames.push({
        ...game,
        humanCount: humanPlayers.length,
        botCount: botPlayers.length,
        age: Math.round((Date.now() - game.createdAt.getTime()) / (60 * 1000))
      })
    }
  }

  if (stuckGames.length === 0) {
    console.log('✅ No stuck games found!')
    return
  }

  console.log(`⚠️  Found ${stuckGames.length} stuck games:\n`)
  
  stuckGames.forEach((game, i) => {
    console.log(`${i + 1}. Game ${game.id}`)
    console.log(`   Lobby: ${game.lobby.code} - ${game.lobby.name}`)
    console.log(`   Created: ${game.createdAt.toLocaleString()}`)
    console.log(`   Age: ${game.age} minutes`)
    console.log(`   Players: ${game.humanCount} humans, ${game.botCount} bots`)
    console.log(`   Status: ${game.status}\n`)
  })

  // Ask user if they want to fix them
  console.log('\n🔧 To fix these games, run: npm run fix-stuck-games')
}

async function fixStuckGames() {
  console.log('🔧 Fixing stuck games...\n')

  const result = await prisma.game.updateMany({
    where: {
      status: 'playing',
      players: {
        every: {
          user: {
            isBot: true
          }
        }
      }
    },
    data: {
      status: 'abandoned',
      abandonedAt: new Date() as any // TypeScript cache issue
    }
  })

  console.log(`✅ Marked ${result.count} games as abandoned\n`)

  // Also find games with only 1 human player that are old
  const oldGames = await prisma.game.findMany({
    where: {
      status: 'playing',
      createdAt: {
        lt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      }
    },
    include: {
      players: {
        include: {
          user: true
        }
      }
    }
  })

  let abandonedCount = 0
  for (const game of oldGames) {
    const humanPlayers = game.players.filter(p => !p.user.isBot)
    if (humanPlayers.length <= 1) {
      await prisma.game.update({
        where: { id: game.id },
        data: {
          status: 'abandoned',
          abandonedAt: new Date() as any
        }
      })
      abandonedCount++
    }
  }

  if (abandonedCount > 0) {
    console.log(`✅ Marked ${abandonedCount} old single-player games as abandoned\n`)
  }

  console.log('✅ Done! All stuck games have been fixed.')
}

// Check command line arguments
const args = process.argv.slice(2)

if (args.includes('--fix')) {
  fixStuckGames()
    .catch((error) => {
      console.error('❌ Error fixing stuck games:', error)
      process.exit(1)
    })
    .finally(() => {
      prisma.$disconnect()
    })
} else {
  findStuckGames()
    .catch((error) => {
      console.error('❌ Error finding stuck games:', error)
      process.exit(1)
    })
    .finally(() => {
      prisma.$disconnect()
    })
}
