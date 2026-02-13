import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getServerSocketUrl, getSocketInternalAuthHeaders } from '@/lib/socket-url'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'

const limiter = rateLimit(rateLimitPresets.api)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
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
          where: {
            OR: [
              { status: 'waiting' },
              { status: 'playing' }
            ]
          },
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
      lobby.games.find((game: any) =>
        game.players.some((p: any) => p.userId === userId)
      ) || null
    const activeGame = playerOwnedGame || pickRelevantLobbyGame(lobby.games as any[])

    if (!activeGame) {
      return NextResponse.json(
        { error: 'No active game found' },
        { status: 404 }
      )
    }

    // Find player in the game
    const player = activeGame.players.find((p: any) => p.userId === userId)

    if (!player) {
      return NextResponse.json({
        message: 'You already left the lobby',
        gameEnded: false,
        lobbyDeactivated: false
      })
    }

    // Remove player from the game
    await prisma.players.delete({
      where: { id: player.id }
    })

    // Get remaining players count
    const remainingPlayers = await prisma.players.count({
      where: { gameId: activeGame.id }
    })

    // Get remaining human players (non-bots)
    const remainingHumanPlayers = await prisma.players.count({
      where: {
        gameId: activeGame.id,
        user: {
          bot: null  // Human players don't have bot relation
        }
      }
    })

    // Different behavior based on game status
    if (activeGame.status === 'waiting') {
      // In waiting state, just remove player
      // If no players or no human players left, deactivate the lobby
      if (remainingPlayers === 0 || remainingHumanPlayers === 0) {
        await prisma.lobbies.update({
          where: { id: lobby.id },
          data: { isActive: false }
        })

        return NextResponse.json({
          message: 'You left the lobby',
          gameEnded: false,
          lobbyDeactivated: true
        })
      }

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: false,
        lobbyDeactivated: false
      })
    }

    // If game is playing and no human players remain (only bots or empty), end the game
    if (remainingHumanPlayers === 0) {
      // Mark game as abandoned since all human players left
      await prisma.games.update({
        where: { id: activeGame.id },
        data: {
          status: 'abandoned',
          abandonedAt: new Date() as any // TypeScript cache issue - field exists in schema
        }
      })

      // Deactivate the lobby
      await prisma.lobbies.update({
        where: { id: lobby.id },
        data: { isActive: false }
      })

      // Notify other players via socket
      try {
        const socketUrl = getServerSocketUrl()
        await fetch(`${socketUrl}/api/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getSocketInternalAuthHeaders(),
          },
          body: JSON.stringify({
            room: `lobby:${code}`,
            event: 'game-abandoned',
            data: { reason: 'no_human_players' }
          })
        })
      } catch (err) {
        console.error('Failed to notify via socket:', err)
      }

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: true,
        gameAbandoned: true,
        lobbyDeactivated: true
      })
    }

    // If only 1 or fewer players remain in total, end the game
    // A game needs at least 2 players to continue
    if (remainingPlayers <= 1) {
      await prisma.games.update({
        where: { id: activeGame.id },
        data: {
          status: 'abandoned',
          abandonedAt: new Date() as any
        }
      })

      // Deactivate the lobby
      await prisma.lobbies.update({
        where: { id: lobby.id },
        data: { isActive: false }
      })

      // Notify remaining player(s) via socket
      try {
        const socketUrl = getServerSocketUrl()
        await fetch(`${socketUrl}/api/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getSocketInternalAuthHeaders(),
          },
          body: JSON.stringify({
            room: `lobby:${code}`,
            event: 'game-abandoned',
            data: { reason: 'insufficient_players' }
          })
        })
      } catch (err) {
        console.error('Failed to notify via socket:', err)
      }

      return NextResponse.json({
        message: 'You left the lobby',
        gameEnded: true,
        gameAbandoned: true,
        lobbyDeactivated: true
      })
    }

    // If multiple players remain (human or bot), continue the game
    // Notify other players via socket
    try {
      const socketUrl = getServerSocketUrl()
      await fetch(`${socketUrl}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSocketInternalAuthHeaders(),
        },
        body: JSON.stringify({
          room: `lobby:${code}`,
          event: 'player-left',
          data: {
            playerId: userId,
            playerName: player.user.username || player.user.email || 'Guest',
            remainingPlayers
          }
        })
      })
    } catch (err) {
      console.error('Failed to notify via socket:', err)
    }

    return NextResponse.json({
      message: 'You left the lobby',
      gameEnded: false,
      lobbyDeactivated: false
    })
  } catch (error: any) {
    const log = apiLogger('POST /api/lobby/[code]/leave')
    log.error('Leave lobby error', error)
    return NextResponse.json(
      { error: 'Failed to leave lobby' },
      { status: 500 }
    )
  }
}
