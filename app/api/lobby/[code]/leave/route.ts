import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { broadcastToLobby } from '@/lib/supabase-server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { parseAndValidateGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { restoreGameEngine } from '@/lib/game-registry'
import { getGameMetadata } from '@/lib/game-catalog'
import { deleteGameTurnReminderNotifications } from '@/lib/in-app-notifications'

const limiter = rateLimit(rateLimitPresets.api)

type ReassignedCreator = {
  userId: string
  username: string
}

async function emitLobbyEvent(
  log: ReturnType<typeof apiLogger>,
  code: string,
  event: string,
  data: Record<string, unknown>
) {
  const sent = await broadcastToLobby(code, event, data)
  if (!sent) log.warn('Failed to broadcast lobby leave event', { code, event })
}

function notifyLobbyListUpdate() {
  // Postgres Changes on Lobbies table handles lobby-list updates globally
}

async function reassignLobbyCreatorIfNeeded(
  log: ReturnType<typeof apiLogger>,
  lobbyId: string,
  gameId: string,
  lobbyCode: string
): Promise<ReassignedCreator | null> {
  const nextCreator = await prisma.players.findFirst({
    where: {
      gameId,
      leftAt: null,
      user: {
        bot: null,
      },
    },
    orderBy: [
      { position: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      userId: true,
      user: {
        select: {
          username: true,
        },
      },
    },
  })

  if (!nextCreator) {
    log.warn('Unable to find replacement lobby creator after leave', {
      lobbyId,
      lobbyCode,
      gameId,
    })
    return null
  }

  await prisma.lobbies.update({
    where: { id: lobbyId },
    data: { creatorId: nextCreator.userId },
  })

  return {
    userId: nextCreator.userId,
    username: nextCreator.user.username || 'Player',
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const log = apiLogger('POST /api/lobby/[code]/leave')

  try {
    // Rate limit leave requests
    const rateLimitResult = await limiter(req)
    if (rateLimitResult) return rateLimitResult

    const requestUser = await getRequestAuthUser(req)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { code } = await params

    // Find lobby with its game and players
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: {
            updatedAt: 'desc',
          },
          include: {
            players: {
              include: {
                user: true
              }
            }
          }
        }
      }
    })

    if (!lobby) {
      return NextResponse.json(
        { error: 'Lobby not found' },
        { status: 404 }
      )
    }

    const playerOwnedGame =
      lobby.games.find((game) =>
        game.players.some((p) => p.userId === userId)
      ) || null
    const activeGame = playerOwnedGame || pickRelevantLobbyGame(lobby.games, { includeFinished: true })

    if (!activeGame) {
      return NextResponse.json(
        { error: 'No active game found' },
        { status: 404 }
      )
    }

    // Find player in the game
    const player = activeGame.players.find((p) => p.userId === userId)

    if (!player) {
      return NextResponse.json({
        message: 'You already left the lobby',
        gameEnded: false,
        lobbyDeactivated: false
      })
    }

    // Remove player: hard-delete for pre-game (waiting), soft-leave for in-progress/terminal games
    if (activeGame.status === 'waiting') {
      await prisma.players.delete({ where: { id: player.id } })
    } else {
      await prisma.players.update({
        where: { id: player.id },
        data: { leftAt: new Date() },
      })
    }

    // Always filter leftAt:null — waiting games hard-delete so all remaining have leftAt:null;
    // playing/terminal games now use soft-leave so leftAt:null gives active count.
    const [remainingPlayers, remainingHumanPlayers] = await Promise.all([
      prisma.players.count({
        where: { gameId: activeGame.id, leftAt: null }
      }),
      prisma.players.count({
        where: {
          gameId: activeGame.id,
          leftAt: null,
          user: {
            bot: null,
          },
        },
      }),
    ])
    const minPlayersRequired = getLobbyPlayerRequirements(activeGame.gameType).minPlayersRequired

    const creatorLeft = lobby.creatorId === userId
    const isTerminalGame = activeGame.status === 'finished' || activeGame.status === 'abandoned' || activeGame.status === 'cancelled'
    const lobbyCanStayActive =
      activeGame.status === 'playing'
        ? remainingPlayers >= minPlayersRequired && remainingHumanPlayers > 0
        : remainingPlayers > 0 && remainingHumanPlayers > 0
    // Don't reassign creator during post-game — only the original host can start the next game
    const reassignedCreator =
      creatorLeft && lobbyCanStayActive && !isTerminalGame
        ? await reassignLobbyCreatorIfNeeded(log, lobby.id, activeGame.id, code)
        : null

    const departedPlayerName = player.user.username || player.user.email || 'Guest'
    const playerLeftEventPayload = {
      userId,
      playerId: userId,
      username: departedPlayerName,
      playerName: departedPlayerName,
      remainingPlayers,
      ...(reassignedCreator
        ? {
            nextCreatorId: reassignedCreator.userId,
            nextCreatorName: reassignedCreator.username,
          }
        : {}),
    }

    // Different behavior based on game status
    if (activeGame.status === 'waiting') {
      // In waiting state, just remove player
      // If no players or no human players left, deactivate the lobby
      if (remainingPlayers === 0 || remainingHumanPlayers === 0) {
        await prisma.lobbies.update({
          where: { id: lobby.id },
          data: { isActive: false }
        })

        notifyLobbyListUpdate()

        return NextResponse.json({
          message: 'You left the lobby',
          gameEnded: false,
          lobbyDeactivated: true
        })
      }

      await Promise.all([
        emitLobbyEvent(log, code, 'player-left', playerLeftEventPayload),
        emitLobbyEvent(log, code, 'lobby-update', {
          lobbyCode: code,
          type: 'player-left',
          ...(reassignedCreator
            ? {
                data: {
                  creatorId: reassignedCreator.userId,
                  creatorName: reassignedCreator.username,
                },
              }
            : {}),
        }),
      ])

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: false,
        lobbyDeactivated: false
      })
    }

    // For terminal games, update lobby membership without mutating the settled result.
    if (
      activeGame.status === 'finished' ||
      activeGame.status === 'abandoned' ||
      activeGame.status === 'cancelled'
    ) {
      if (remainingPlayers === 0 || remainingHumanPlayers === 0) {
        await prisma.lobbies.update({
          where: { id: lobby.id },
          data: { isActive: false }
        })

        notifyLobbyListUpdate()

        return NextResponse.json({
          message: 'You left the lobby',
          gameEnded: false,
          lobbyDeactivated: true
        })
      }

      await emitLobbyEvent(log, code, 'player-left', {
        ...playerLeftEventPayload,
        ...(creatorLeft ? { hostLeft: true } : {}),
        gameTerminal: true,
      })

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: false,
        lobbyDeactivated: false
      })
    }

    // If game is playing and no human players remain (only bots or empty), end the game
    if (remainingHumanPlayers === 0) {
      // Mark game as abandoned since all human players left
      const abandonNow = new Date()
      const abandonDuration = activeGame.startedAt instanceof Date
        ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
        : null
      await prisma.games.update({
        where: { id: activeGame.id },
        data: {
          status: 'abandoned',
          abandonedAt: abandonNow,
          endedAt: abandonNow,
          ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
          terminalMetadata: { outcome: 'abandoned', reason: 'no_human_players' },
        }
      })

      // Deactivate the lobby
      await prisma.lobbies.update({
        where: { id: lobby.id },
        data: { isActive: false }
      })

      await emitLobbyEvent(log, code, 'game-abandoned', { reason: 'no_human_players' })
      void deleteGameTurnReminderNotifications(activeGame.id)
      notifyLobbyListUpdate()

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: true,
        gameAbandoned: true,
        lobbyDeactivated: true
      })
    }

    // End the game when the remaining roster can no longer satisfy this game's minimum player count.
    if (remainingPlayers < minPlayersRequired) {
      const abandonNow = new Date()
      const abandonDuration = activeGame.startedAt instanceof Date
        ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
        : null
      await prisma.games.update({
        where: { id: activeGame.id },
        data: {
          status: 'abandoned',
          abandonedAt: abandonNow,
          endedAt: abandonNow,
          ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
          terminalMetadata: { outcome: 'abandoned', reason: 'insufficient_players' },
        }
      })

      // Deactivate the lobby
      await prisma.lobbies.update({
        where: { id: lobby.id },
        data: { isActive: false }
      })

      await emitLobbyEvent(log, code, 'game-abandoned', { reason: 'insufficient_players' })
      void deleteGameTurnReminderNotifications(activeGame.id)
      notifyLobbyListUpdate()

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: true,
        gameAbandoned: true,
        lobbyDeactivated: true
      })
    }

    // End game if 1 human remains with no bots in a formerly multi-human game.
    // This covers games (e.g. Yahtzee, minPlayers:1) that satisfy minPlayersRequired=1
    // but can't continue meaningfully as a multiplayer session.
    const remainingBots = remainingPlayers - remainingHumanPlayers
    if (remainingHumanPlayers === 1 && remainingBots === 0 && activeGame.players.length > 1) {
      const abandonNow = new Date()
      const abandonDuration = activeGame.startedAt instanceof Date
        ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
        : null
      await prisma.games.update({
        where: { id: activeGame.id },
        data: {
          status: 'abandoned',
          abandonedAt: abandonNow,
          endedAt: abandonNow,
          ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
          terminalMetadata: { outcome: 'abandoned', reason: 'insufficient_players' },
        }
      })
      await prisma.lobbies.update({ where: { id: lobby.id }, data: { isActive: false } })
      await emitLobbyEvent(log, code, 'game-abandoned', { reason: 'insufficient_players' })
      void deleteGameTurnReminderNotifications(activeGame.id)
      notifyLobbyListUpdate()
      return NextResponse.json({ message: 'You left the lobby', gameEnded: true, gameAbandoned: true, lobbyDeactivated: true })
    }

    // Spy: if the spy left the game cannot meaningfully continue even with enough players
    if (activeGame.gameType === 'guess_the_spy') {
      try {
        const spyState = parseAndValidateGameState(activeGame.state)
        const spyPlayerId = (spyState.data as Record<string, unknown> | null)?.spyPlayerId
        if (spyPlayerId === userId) {
          const abandonNow = new Date()
          const abandonDuration = activeGame.startedAt instanceof Date
            ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
            : null
          await prisma.games.update({
            where: { id: activeGame.id },
            data: {
              status: 'abandoned',
              abandonedAt: abandonNow,
              endedAt: abandonNow,
              ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
              terminalMetadata: { outcome: 'abandoned', reason: 'spy_left' },
            },
          })
          await prisma.lobbies.update({ where: { id: lobby.id }, data: { isActive: false } })
          await emitLobbyEvent(log, code, 'game-abandoned', { reason: 'spy_left' })
          void deleteGameTurnReminderNotifications(activeGame.id)
          notifyLobbyListUpdate()
          return NextResponse.json({ message: 'You left the lobby', gameEnded: true, gameAbandoned: true, lobbyDeactivated: true })
        }
      } catch (e) {
        log.warn('Failed to check spy role on player leave', { error: e })
      }
      // Non-spy left: game continues but Spy is phase-based — no currentPlayerIndex to advance
    }

    // For turn-based games: advance to the next player if the departed player was current.
    // Alias uses currentTeamIndex+describerIndex; Liar's Party uses claimantOrder — skip
    // to avoid state corruption. Timer will handle stuck turns for those games.
    const gameMeta = getGameMetadata(activeGame.gameType)
    let turnAdvanced = false
    if (gameMeta?.advanceTurnOnLeave) {
      try {
        const parsedState = parseAndValidateGameState(activeGame.state)
        const currentPlayerId = parsedState.players[parsedState.currentPlayerIndex]?.id
        if (currentPlayerId === userId) {
          parsedState.currentPlayerIndex = (parsedState.currentPlayerIndex + 1) % parsedState.players.length
          const data = parsedState.data as Record<string, unknown> | null | undefined
          if (data && typeof data === 'object') {
            // Yahtzee
            if ('rollsLeft' in data) data.rollsLeft = 3
            if ('held' in data) data.held = [false, false, false, false, false]
            if ('lastRoll' in data) delete data.lastRoll
            // Memory
            if ('flippedCardIds' in data) data.flippedCardIds = []
            if ('pendingMismatchCardIds' in data) data.pendingMismatchCardIds = []
            if ('advanceTurnAfterMove' in data) data.advanceTurnAfterMove = false
          }
          await prisma.games.update({
            where: { id: activeGame.id },
            data: { state: toPersistedGameStateInput(parsedState) },
          })
          turnAdvanced = true
          await emitLobbyEvent(log, code, 'game-update', { action: 'state-change', payload: parsedState })
        }
      } catch (e) {
        log.warn('Failed to advance turn after player left mid-game', { error: e })
      }
    }

    // Engine-managed games: delegate player-leave state mutation to the engine
    if (gameMeta?.engineHandlesLeave) {
      try {
        const engine = restoreGameEngine(activeGame.gameType, activeGame.id, activeGame.state)
        const changed = engine.handlePlayerLeave(userId)
        if (changed) {
          const newState = engine.getState()
          await prisma.games.update({
            where: { id: activeGame.id },
            data: { state: toPersistedGameStateInput(newState) },
          })
          await emitLobbyEvent(log, code, 'game-update', { action: 'state-change', payload: newState })
        }
      } catch (e) {
        log.warn('Failed to apply engine handlePlayerLeave', { error: e, gameType: activeGame.gameType })
      }
    }

    await emitLobbyEvent(log, code, 'player-left', playerLeftEventPayload)
    if (reassignedCreator) {
      await emitLobbyEvent(log, code, 'lobby-update', {
        lobbyCode: code,
        type: 'player-left',
        data: {
          creatorId: reassignedCreator.userId,
          creatorName: reassignedCreator.username,
        },
      })
    }

    log.info('Player left, game continues', { code, userId, remainingPlayers, turnAdvanced })

    return NextResponse.json({
      message: 'You left the lobby',
      gameEnded: false,
      lobbyDeactivated: false
    })
  } catch (error: unknown) {
    log.error('Leave lobby error', error)
    return NextResponse.json(
      { error: 'Failed to leave lobby' },
      { status: 500 }
    )
  }
}
