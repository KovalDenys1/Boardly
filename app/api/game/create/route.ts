import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { GameEngine, GameConfig } from '@/lib/game-engine'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { BotMoveExecutor } from '@/lib/bot-executor'
import { getServerSocketUrl } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.game)

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { gameType, lobbyId, config } = await request.json()

    if (!gameType || !lobbyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify lobby exists and user is the creator
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: {
        games: {
          include: {
            players: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== session.user.id) {
      return NextResponse.json({ error: 'Only lobby creator can start the game' }, { status: 403 })
    }

    // Get players from the waiting game
    const waitingGame = lobby.games.find(g => g.status === 'waiting')
    if (!waitingGame) {
      return NextResponse.json({ error: 'No waiting game found in lobby' }, { status: 404 })
    }

    // Create game instance based on type
    let gameEngine: any
    let gameConfig: GameConfig

    switch (gameType) {
      case 'yahtzee':
        gameConfig = {
          maxPlayers: config?.maxPlayers || 4,
          minPlayers: config?.minPlayers || 1,
          ...config
        }
        gameEngine = new YahtzeeGame(`game_${Date.now()}`, gameConfig)
        break
      default:
        return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
    }

    // Add players to the game
    for (const player of waitingGame.players) {
      gameEngine.addPlayer({
        id: player.userId,
        name: player.user.name || 'Unknown',
        score: player.score,
        isActive: true,
      })
    }

    // Shuffle players before starting to randomize turn order
    gameEngine.shufflePlayers()

    // Start the game
    const gameStarted = gameEngine.startGame()
    if (!gameStarted) {
      return NextResponse.json({ error: 'Not enough players to start the game' }, { status: 400 })
    }

    // Update existing game instead of creating new one
    const game = await prisma.game.update({
      where: { id: waitingGame.id },
      data: {
        state: JSON.stringify(gameEngine.getState()),
        status: 'playing',
        updatedAt: new Date(),
      },
      include: {
        players: {
          include: {
            user: true,
          },
        },
      },
    })

    // Update lobby status
    await prisma.lobby.update({
      where: { id: lobbyId },
      data: { isActive: false }, // Mark lobby as inactive when game starts
    })

    // Notify all clients via WebSocket that game started
    try {
      const socketUrl = getServerSocketUrl()
      await fetch(`${socketUrl}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: `lobby:${lobby.code}`,
          event: 'game-started',
          data: {
            lobbyCode: lobby.code,
            gameId: game.id,
          },
        }),
      }).catch(err => {
        const log = apiLogger('POST /api/game/create')
        log.error('Failed to notify socket server', err)
      })

      // Also send game state update
      await fetch(`${socketUrl}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: `lobby:${lobby.code}`,
          event: 'game-update',
          data: {
            action: 'state-change',
            payload: { state: gameEngine.getState() },
          },
        }),
      }).catch(err => {
        const log = apiLogger('POST /api/game/create')
        log.error('Failed to notify socket server', err)
      })
    } catch (error) {
      const log = apiLogger('POST /api/game/create')
      log.error('Error sending WebSocket notification', error as Error)
    }

    // Check if first player is a bot and trigger bot turn
    const currentPlayerIndex = gameEngine.getState().currentPlayerIndex
    const currentPlayer = game.players[currentPlayerIndex]
    
    if (currentPlayer && BotMoveExecutor.isBot(currentPlayer)) {
      const log = apiLogger('POST /api/game/create')
      log.info('First player is a bot, triggering bot turn...', { botUserId: currentPlayer.userId })
      
      // Trigger bot turn via separate HTTP request (fire and forget)
      const botApiUrl = `${request.nextUrl.origin}/api/game/${game.id}/bot-turn`
      
      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout
      
      fetch(botApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botUserId: currentPlayer.userId,
          lobbyCode: lobby.code,
        }),
        signal: controller.signal,
      })
        .then(() => clearTimeout(timeoutId))
        .catch(error => {
          clearTimeout(timeoutId)
          if (error.name === 'AbortError') {
            log.error('Bot turn timeout - request aborted after 30s')
          } else {
            log.error('Failed to trigger bot turn', error)
          }
        })
        
      log.info('Bot turn request sent', { botApiUrl })
    }

    return NextResponse.json({
      game: {
        id: game.id,
        type: gameType,
        status: game.status,
        state: gameEngine.getState(),
        players: game.players.map(p => ({
          id: p.userId,
          name: p.user.name || 'Unknown',
          score: p.score,
        })),
      }
    })
  } catch (error) {
    const log = apiLogger('POST /api/game/create')
    log.error('Create game error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
