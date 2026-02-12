import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createGameEngine, isRegisteredGameType } from '@/lib/game-registry'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { isBot } from '@/lib/bots'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'

const limiter = rateLimit(rateLimitPresets.game)

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const log = apiLogger('POST /api/game/create')

    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { gameType, lobbyId, config } = await request.json()

    if (!gameType || !lobbyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isRegisteredGameType(gameType)) {
      return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
    }

    // Verify lobby exists and user is the creator
    const lobby = await prisma.lobbies.findUnique({
      where: { id: lobbyId },
      include: {
        games: {
          include: {
            players: {
              include: {
                user: {
                  include: {
                    bot: true  // Include bot relation
                  }
                },
              },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== userId) {
      return NextResponse.json({ error: 'Only lobby creator can start the game' }, { status: 403 })
    }

    // Get or create waiting game
    let waitingGame = lobby.games.find(g => g.status === 'waiting')

    // If no waiting game exists, check for finished game and create new waiting game
    if (!waitingGame) {
      const finishedGame = lobby.games.find(g => g.status === 'finished')
      if (finishedGame) {
        log.info('Creating new waiting game from finished game', {
          finishedGameId: finishedGame.id,
          playerCount: finishedGame.players?.length || 0
        })

        // Create new waiting game with same players
        waitingGame = await prisma.games.create({
          data: {
            lobbyId: lobbyId,
            status: 'waiting',
            state: JSON.stringify({}),
            players: {
              create: finishedGame.players.map((p, index) => ({
                userId: p.userId,
                score: 0,
                position: index, // Preserve player order
              })),
            },
          },
          include: {
            players: {
              include: {
                user: {
                  include: {
                    bot: true  // Include bot relation
                  }
                },
              },
            },
          },
        })
      } else {
        return NextResponse.json({ error: 'No game found in lobby' }, { status: 404 })
      }
    }

    // Type guard - ensure waitingGame is defined
    if (!waitingGame) {
      return NextResponse.json({ error: 'Failed to get or create game' }, { status: 500 })
    }

    // Validate minimum players
    const playerCount = waitingGame.players?.length || 0
    if (playerCount < 2) {
      log.warn('Attempted to start game with insufficient players', {
        playerCount,
        gameId: waitingGame.id
      })
      return NextResponse.json({
        error: 'At least 2 players are required to start the game',
        details: 'Please add a bot or wait for another player to join'
      }, { status: 400 })
    }

    // Create game instance via registry
    const gameEngine = createGameEngine(gameType, `game_${Date.now()}`, config)

    // Add players to the game - sort so bots go last
    const sortedPlayers = [...waitingGame.players].sort((a, b) => {
      const aIsBot = a.user.bot ? 1 : 0
      const bIsBot = b.user.bot ? 1 : 0
      return aIsBot - bIsBot // Non-bots first, bots last
    })

    for (const player of sortedPlayers) {
      gameEngine.addPlayer({
        id: player.userId,
        name: player.user.username || 'Unknown',
        score: player.score,
        isActive: true,
      })
    }

    // Don't shuffle - players are already in correct order (human first, bot last)

    // Start the game
    const gameStarted = gameEngine.startGame()
    if (!gameStarted) {
      return NextResponse.json({ error: 'Not enough players to start the game' }, { status: 400 })
    }

    log.info('Game starting', {
      gameId: waitingGame.id,
      gameType,
      playerCount,
      lobbyCode: lobby.code
    })

    // Update existing game instead of creating new one
    const game = await prisma.games.update({
      where: { id: waitingGame.id },
      data: {
        state: JSON.stringify(gameEngine.getState()),
        status: 'playing',
        updatedAt: new Date(),
      },
      include: {
        players: {
          include: {
            user: {
              include: {
                bot: true,  // Include bot relation for bot detection
              },
            },
          },
        },
      },
    })

    log.info('Game status changed', {
      gameId: game.id,
      oldStatus: 'waiting',
      newStatus: 'playing',
      playerCount: game.players.length
    })

    // Update lobby status
    await prisma.lobbies.update({
      where: { id: lobbyId },
      data: { isActive: false }, // Mark lobby as inactive when game starts
    })

    // Notify all clients via WebSocket that game started
    await notifySocket(
      `lobby:${lobby.code}`,
      'game-started',
      {
        lobbyCode: lobby.code,
        gameId: game.id,
      }
    )

    // Also send game state update
    await notifySocket(
      `lobby:${lobby.code}`,
      'game-update',
      {
        action: 'state-change',
        payload: { state: gameEngine.getState() },
      }
    )

    // Check if first player is a bot and trigger bot turn
    const currentPlayerIndex = gameEngine.getState().currentPlayerIndex
    const gamePlayers = gameEngine.getPlayers() // Use game engine's sorted players
    const currentPlayer = gamePlayers[currentPlayerIndex]

    // Find the corresponding database player
    const dbCurrentPlayer = game.players.find(p => p.userId === currentPlayer?.id)

    if (dbCurrentPlayer && isBot(dbCurrentPlayer)) {
      log.info('First player is a bot, triggering bot turn...', { botUserId: dbCurrentPlayer.userId })

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
          botUserId: dbCurrentPlayer.userId,
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
          userId: p.userId,
          name: p.user.username || 'Unknown',
          score: p.score,
          user: {
            id: p.user.id,
            username: p.user.username,
            email: p.user.email,
            bot: p.user.bot, // Include bot relation for bot detection
          },
        })),
      }
    })
  } catch (error) {
    const log = apiLogger('POST /api/game/create')
    log.error('Create game error', error as Error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
