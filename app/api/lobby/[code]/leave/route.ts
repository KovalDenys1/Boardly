import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { broadcastToLobby } from '@/lib/supabase-server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'

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
      notifyLobbyListUpdate()

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: true,
        gameAbandoned: true,
        lobbyDeactivated: true
      })
    }

    // If multiple players remain (human or bot), continue the game
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
