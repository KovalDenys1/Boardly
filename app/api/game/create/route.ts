import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createGameEngine, getGameMetadata, isSupportedGameType } from '@/lib/game-registry'
import { type GameConfig } from '@/lib/game-engine'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { isBot } from '@/lib/bots'
import { broadcastToLobby } from '@/lib/supabase-server'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { SpyGame } from '@/lib/games/spy-game'
import { getActiveSpyLocations } from '@/lib/spy-locations'
import { getBotDisplayName, normalizeBotDifficulty } from '@/lib/bot-profiles'
import { getOrCreateBotUser, isPrismaUniqueConstraintError } from '@/lib/bot-helpers'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { toPersistedGameType } from '@/lib/game-type-storage'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { buildGameStartFields } from '@/lib/game-persistence'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'

const limiter = rateLimit(rateLimitPresets.game)

function extractTicTacToeTargetRounds(rawState: unknown): number | null | undefined {
  let parsedState = rawState

  if (typeof rawState === 'string') {
    try {
      parsedState = JSON.parse(rawState)
    } catch {
      return undefined
    }
  }

  if (!parsedState || typeof parsedState !== 'object') {
    return undefined
  }

  const stateData = (parsedState as { data?: unknown }).data
  if (!stateData || typeof stateData !== 'object') {
    return undefined
  }

  const matchState = (stateData as { match?: unknown }).match
  if (!matchState || typeof matchState !== 'object') {
    return undefined
  }

  const targetRounds = (matchState as { targetRounds?: unknown }).targetRounds
  if (targetRounds === null) {
    return null
  }
  if (
    typeof targetRounds === 'number' &&
    Number.isInteger(targetRounds) &&
    targetRounds > 0
  ) {
    return targetRounds
  }

  return undefined
}

function extractYahtzeeMode(rawState: unknown): 'classic' | 'short' | undefined {
  let parsedState = rawState

  if (typeof rawState === 'string') {
    try {
      parsedState = JSON.parse(rawState)
    } catch {
      return undefined
    }
  }

  if (!parsedState || typeof parsedState !== 'object') {
    return undefined
  }

  const stateData = (parsedState as { data?: unknown }).data
  if (!stateData || typeof stateData !== 'object') {
    return undefined
  }

  const mode = (stateData as { mode?: unknown }).mode
  if (mode === 'short' || mode === 'classic') {
    return mode
  }

  return undefined
}

function extractMemoryDifficulty(rawState: unknown): 'easy' | 'medium' | 'hard' | undefined {
  let parsedState = rawState

  if (typeof rawState === 'string') {
    try {
      parsedState = JSON.parse(rawState)
    } catch {
      return undefined
    }
  }

  if (!parsedState || typeof parsedState !== 'object') {
    return undefined
  }

  const stateData = (parsedState as { data?: unknown }).data
  if (!stateData || typeof stateData !== 'object') {
    return undefined
  }

  const difficulty = (stateData as { difficulty?: unknown }).difficulty
  if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
    return difficulty
  }

  return undefined
}

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

    if (typeof gameType !== 'string' || typeof lobbyId !== 'string' || lobbyId.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (isTemporarilyUnavailableGameType(gameType)) {
      return NextResponse.json({ error: 'Game type is coming soon' }, { status: 400 })
    }
    if (!isSupportedGameType(gameType)) {
      return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
    }
    const persistedGameType = toPersistedGameType(gameType)

    // Verify lobby exists and user is the creator
    const lobby = await prisma.lobbies.findUnique({
      where: { id: lobbyId },
      // kickedUserIds is omitted globally (lib/db.ts). "Play again" rebuilds a roster from an
      // older game, which can still hold somebody the host has since thrown out (#1013).
      omit: { kickedUserIds: false },
      include: {
        games: {
          // A lobby accumulates finished games. "Play again" has to rebuild the roster
          // from the match everyone just played, not from whichever finished row Postgres
          // happened to return first, which in practice was the oldest one (#1011).
          orderBy: { updatedAt: 'desc' },
          include: {
            players: {
              // Leaving a playing or finished game is a soft-leave: the Players row stays
              // and only leftAt is stamped (lib/lobby-leave.ts). Copied unfiltered into the
              // next game it seats somebody who is not there, so the turn reaches a player
              // no client can time out and ~30s later the heartbeat sweep abandons the game
              // everyone just started (#1011).
              where: { leftAt: null },
              orderBy: { position: 'asc' },
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

    const metadata = getGameMetadata(gameType)
    // For games with bot support, allow starting with the actual minPlayers (e.g., 1 for Yahtzee)
    // The client-side logic will auto-add a bot if needed
    const supportsBots = metadata.supportsBots
    const requiredMinPlayers = supportsBots ? metadata.minPlayers : Math.max(2, metadata.minPlayers)

    // Get or create waiting game
    let waitingGame = lobby.games.find(g => g.status === 'waiting')

    // If no waiting game exists, check for finished game and create new waiting game
    if (!waitingGame) {
      const finishedGame = lobby.games.find(g => g.status === 'finished')
      if (finishedGame) {
        // The `where` on the include drops departures; the kick list drops anyone the host
        // removed after that game was played, so neither comes back through "Play again".
        const kickedUserIds = new Set(lobby.kickedUserIds)
        const returningPlayers = finishedGame.players.filter((p) => !kickedUserIds.has(p.userId))

        log.info('Creating new waiting game from finished game', {
          finishedGameId: finishedGame.id,
          playerCount: returningPlayers.length
        })

        const finishedGameTargetRounds =
          gameType === 'tic_tac_toe' ? extractTicTacToeTargetRounds(finishedGame.state) : undefined
        const finishedGameMemoryDifficulty =
          gameType === 'memory' ? extractMemoryDifficulty(finishedGame.state) : undefined
        const finishedGameYahtzeeMode =
          gameType === 'yahtzee' ? extractYahtzeeMode(finishedGame.state) : undefined
        const initialWaitingState = createGameEngine(
          gameType,
          `waiting_${Date.now()}`,
          gameType === 'tic_tac_toe' && finishedGameTargetRounds !== undefined
            ? {
                rules: {
                  targetRounds: finishedGameTargetRounds,
                },
              }
            : gameType === 'memory' && finishedGameMemoryDifficulty !== undefined
              ? {
                  rules: {
                    difficulty: finishedGameMemoryDifficulty,
                  },
                }
              : gameType === 'yahtzee' && finishedGameYahtzeeMode !== undefined
                ? {
                    rules: {
                      mode: finishedGameYahtzeeMode,
                    },
                  }
                : undefined
        ).getState()

        // Create new waiting game with same players
        waitingGame = await prisma.games.create({
          data: {
            lobbyId: lobbyId,
            status: 'waiting',
            gameType: persistedGameType,
            state: toPersistedGameStateInput(initialWaitingState),
            players: {
              create: returningPlayers.map((p, index) => ({
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

    const hasBotInWaitingGame = waitingGame.players.some((player) => isBot(player))
    if (
      supportsBots &&
      waitingGame.status === 'waiting' &&
      !hasBotInWaitingGame &&
      waitingGame.players.length > 0 &&
      waitingGame.players.length < requiredMinPlayers &&
      waitingGame.players.length < lobby.maxPlayers
    ) {
      const fallbackDifficulty = normalizeBotDifficulty('medium')
      const fallbackBotDisplayName = getBotDisplayName(gameType, fallbackDifficulty)
      const fallbackBotUser = await getOrCreateBotUser(
        fallbackBotDisplayName,
        gameType,
        fallbackDifficulty,
      )

      try {
        await prisma.players.create({
          data: {
            gameId: waitingGame.id,
            userId: fallbackBotUser.id,
            position: waitingGame.players.length,
            isReady: true,
            score: 0,
          },
        })
      } catch (error) {
        // Concurrent start requests may race to add the same bot.
        if (!isPrismaUniqueConstraintError(error)) {
          throw error
        }
      }

      const refreshedWaitingGame = await prisma.games.findUnique({
        where: { id: waitingGame.id },
        include: {
          players: {
            include: {
              user: {
                include: {
                  bot: true,
                },
              },
            },
          },
        },
      })

      if (refreshedWaitingGame) {
        waitingGame = refreshedWaitingGame
      }
    }

    // Validate minimum players
    const playerCount = waitingGame.players?.length || 0
    if (playerCount < requiredMinPlayers) {
      log.warn('Attempted to start game with insufficient players', {
        playerCount,
        requiredMinPlayers,
        gameId: waitingGame.id
      })
      return NextResponse.json({
        error: `At least ${requiredMinPlayers} players are required to start this game`,
        details: 'Please add a bot or wait for another player to join'
      }, { status: 400 })
    }

    const startConfig =
      config && typeof config === 'object' && !Array.isArray(config)
        ? { ...(config as Record<string, unknown>) }
        : {}
    if (gameType === 'tic_tac_toe') {
      const waitingTargetRounds = extractTicTacToeTargetRounds(waitingGame.state)
      if (waitingTargetRounds !== undefined) {
        const existingRules =
          startConfig.rules && typeof startConfig.rules === 'object' && !Array.isArray(startConfig.rules)
            ? (startConfig.rules as Record<string, unknown>)
            : {}
        startConfig.rules = {
          ...existingRules,
          targetRounds: waitingTargetRounds,
        }
      }
    }
    if (gameType === 'memory') {
      const waitingDifficulty = extractMemoryDifficulty(waitingGame.state)
      if (waitingDifficulty !== undefined) {
        const existingRules =
          startConfig.rules && typeof startConfig.rules === 'object' && !Array.isArray(startConfig.rules)
            ? (startConfig.rules as Record<string, unknown>)
            : {}
        startConfig.rules = {
          ...existingRules,
          difficulty: waitingDifficulty,
        }
      }
    }
    if (gameType === 'yahtzee') {
      const waitingYahtzeeMode = extractYahtzeeMode(waitingGame.state)
      if (waitingYahtzeeMode !== undefined) {
        const existingRules =
          startConfig.rules && typeof startConfig.rules === 'object' && !Array.isArray(startConfig.rules)
            ? (startConfig.rules as Record<string, unknown>)
            : {}
        startConfig.rules = {
          ...existingRules,
          mode: waitingYahtzeeMode,
        }
      }
    }

    // Create game instance via registry
    const gameEngine = createGameEngine(
      gameType,
      `game_${Date.now()}`,
      Object.keys(startConfig).length > 0 ? (startConfig as Partial<GameConfig>) : undefined
    )

    // Add players to the game - sort so bots go last
    const sortedPlayers = [...waitingGame.players].sort((a, b) => {
      const aIsBot = a.user.bot ? 1 : 0
      const bIsBot = b.user.bot ? 1 : 0
      return aIsBot - bIsBot // Non-bots first, bots last
    })

    const unseatedPlayers: string[] = []
    for (const player of sortedPlayers) {
      const seated = gameEngine.addPlayer({
        id: player.userId,
        name: player.user.username || 'Unknown',
        score: player.score,
        isActive: true,
      })
      if (!seated) {
        unseatedPlayers.push(player.userId)
      }
    }

    // addPlayer returns false once the engine is at capacity. Discarding that return
    // started games missing whoever did not fit: they kept their Players row, so the
    // client showed them a live board they could never take a turn on (#1004). A roster
    // the game cannot seat is a lobby problem – say so instead of dropping people.
    if (unseatedPlayers.length > 0) {
      log.warn('Refused to start a game that cannot seat the whole lobby', {
        gameId: waitingGame.id,
        lobbyCode: lobby.code,
        playerCount: sortedPlayers.length,
        seats: sortedPlayers.length - unseatedPlayers.length,
        unseatedPlayers,
      })
      return NextResponse.json(
        {
          error: `This game seats ${sortedPlayers.length - unseatedPlayers.length} players, but ${sortedPlayers.length} are in the lobby`,
          code: 'LOBBY_OVER_CAPACITY',
          details: 'Remove a player or switch back to a game that fits the room',
        },
        { status: 400 }
      )
    }

    // Don't shuffle - players are already in correct order (human first, bot last)

    // Start the game
    const gameStarted = gameEngine.startGame()
    if (!gameStarted) {
      return NextResponse.json({
        error: `At least ${requiredMinPlayers} players are required to start this game`
      }, { status: 400 })
    }

    // Guess the Spy requires an initialized round (roles/location) before clients can interact.
    if (gameType === 'guess_the_spy' && gameEngine instanceof SpyGame) {
      let activeLocations
      try {
        activeLocations = await getActiveSpyLocations()
      } catch (error) {
        log.error('Cannot start Spy game: failed to resolve locations', error as Error, {
          gameId: waitingGame.id,
          lobbyCode: lobby.code,
        })
        return NextResponse.json(
          {
            error: 'Spy locations are not configured',
            code: 'SPY_LOCATIONS_UNAVAILABLE',
          },
          { status: 500 }
        )
      }

      if (activeLocations.source === 'fallback') {
        log.warn('No active Spy locations configured in DB, using fallback set', {
          gameId: waitingGame.id,
          lobbyCode: lobby.code,
          fallbackCount: activeLocations.locations.length,
        })
      }

      gameEngine.initializeRound(activeLocations.locations)
    }

    log.info('Game starting', {
      gameId: waitingGame.id,
      gameType,
      playerCount,
      lobbyCode: lobby.code
    })

    // Update existing game instead of creating new one
    const startedState = gameEngine.getState()
    // startedAt and lastMoveAt are written together: this is the only place a
    // game becomes `playing`, so it is the only place the move clock can be
    // started (#1048). See buildGameStartFields for what leaving it behind cost.
    const startFields = buildGameStartFields()
    const game = await prisma.games.update({
      where: { id: waitingGame.id },
      data: {
        state: toPersistedGameStateInput(startedState),
        status: 'playing',
        gameType: persistedGameType,
        ...startFields,
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

    await appendGameReplaySnapshot({
      gameId: game.id,
      playerId: userId,
      actionType: 'game:start',
      actionPayload: {
        gameType,
        playerCount: game.players.length,
      },
      state: gameEngine.getState(),
    })

    log.info('Game status changed', {
      gameId: game.id,
      oldStatus: 'waiting',
      newStatus: 'playing',
      playerCount: game.players.length
    })

    // Keep lobby active so it stays discoverable in the list while the game is playing.
    // isActive is set to false by the leave route when all players leave or the game ends.
    await prisma.lobbies.update({
      where: { id: lobbyId },
      data: { isActive: true },
    })

    void broadcastToLobby(lobby.code, 'game-started', {
      lobbyCode: lobby.code,
      gameId: game.id,
    })
    // Sanitized like every other state broadcast. This is the first state a
    // lobby ever sees and it is the one that was missed: a Sketch & Guess game
    // row is created with round 1's prompt already in it, so this payload put
    // the word on the lobby topic - the channel every seated player is joined
    // to - before the drawer had touched the canvas (#1032, third pass; found
    // by the #1037 smoke spec). No single viewer for a shared broadcast, so it
    // redacts for everyone; each client re-fetches its own viewer-sanitized
    // snapshot from GET /api/lobby/[code].
    void broadcastToLobby(lobby.code, 'game-update', {
      action: 'state-change',
      payload: { state: sanitizeStateForBroadcast(gameType, gameEngine.getState(), null) },
    })

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
      const internalSecret = process.env.BOARDLY_INTERNAL_SECRET
      const forwardedAuthorization = request.headers.get('authorization')
      const forwardedGuestToken = request.headers.get('X-Guest-Token')
      const botTurnHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (internalSecret) {
        botTurnHeaders['X-Internal-Secret'] = internalSecret
      }

      if (forwardedAuthorization) {
        botTurnHeaders.authorization = forwardedAuthorization
      }

      if (forwardedGuestToken) {
        botTurnHeaders['X-Guest-Token'] = forwardedGuestToken
      }

      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

      fetch(botApiUrl, {
        method: 'POST',
        headers: botTurnHeaders,
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
            image: p.user.image,
            avatarUrl: p.user.avatarUrl,
            bot: p.user.bot,
          },
        })),
      }
    })
  } catch (error) {
    const log = apiLogger('POST /api/game/create')
    log.error('Create game error', error as Error)
    return NextResponse.json({
      error: 'Internal server error',
      code: 'GAME_CREATE_FAILED'
    }, { status: 500 })
  }
}
