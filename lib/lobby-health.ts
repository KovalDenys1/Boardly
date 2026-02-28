import { prisma } from './db'
import { logger } from './logger'
import { pickRelevantLobbyGame } from './lobby-snapshot'

type CleanupStaleLobbyGamesOptions = {
  now?: Date
  waitingStaleHours?: number
  playingStaleHours?: number
  batchLimit?: number
}

export type CleanupStaleLobbyGamesResult = {
  success: boolean
  scannedLobbies: number
  scannedActiveGames: number
  deactivatedLobbies: number
  cancelledWaitingGames: number
  abandonedPlayingGames: number
  waitingStaleHours: number
  playingStaleHours: number
  batchLimit: number
}

type CleanupLobbyGame = {
  id: string
  status: string
  updatedAt: Date
  players: Array<{
    user: {
      bot: unknown
    }
  }>
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getWaitingStaleHours(options: CleanupStaleLobbyGamesOptions): number {
  return options.waitingStaleHours ?? parsePositiveInt(process.env.LOBBY_CLEANUP_WAITING_STALE_HOURS, 1)
}

function getPlayingStaleHours(options: CleanupStaleLobbyGamesOptions): number {
  return options.playingStaleHours ?? parsePositiveInt(process.env.LOBBY_CLEANUP_PLAYING_STALE_HOURS, 2)
}

function getBatchLimit(options: CleanupStaleLobbyGamesOptions): number {
  return options.batchLimit ?? parsePositiveInt(process.env.LOBBY_CLEANUP_BATCH_LIMIT, 500)
}

export async function cleanupStaleLobbiesAndGames(
  options: CleanupStaleLobbyGamesOptions = {}
): Promise<CleanupStaleLobbyGamesResult> {
  const now = options.now ?? new Date()
  const waitingStaleHours = getWaitingStaleHours(options)
  const playingStaleHours = getPlayingStaleHours(options)
  const batchLimit = getBatchLimit(options)

  const result: CleanupStaleLobbyGamesResult = {
    success: true,
    scannedLobbies: 0,
    scannedActiveGames: 0,
    deactivatedLobbies: 0,
    cancelledWaitingGames: 0,
    abandonedPlayingGames: 0,
    waitingStaleHours,
    playingStaleHours,
    batchLimit,
  }

  const lobbies = await prisma.lobbies.findMany({
    where: {
      isActive: true,
    },
    take: batchLimit,
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      code: true,
      games: {
        where: {
          status: {
            in: ['waiting', 'playing'],
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          players: {
            select: {
              user: {
                select: {
                  bot: true,
                },
              },
            },
          },
        },
      },
    },
  })

  result.scannedLobbies = lobbies.length

  const lobbiesToDeactivate = new Set<string>()
  const waitingGamesToCancel = new Set<string>()
  const playingGamesToAbandon = new Set<string>()

  for (const lobby of lobbies) {
    const activeGame = pickRelevantLobbyGame<CleanupLobbyGame>(lobby.games as CleanupLobbyGame[])

    if (!activeGame) {
      lobbiesToDeactivate.add(lobby.id)
      continue
    }

    result.scannedActiveGames += 1

    const playersCount = activeGame.players.length
    const humanPlayers = activeGame.players.filter((player) => !player.user.bot).length
    const hoursSinceUpdate = (now.getTime() - new Date(activeGame.updatedAt).getTime()) / (1000 * 60 * 60)

    if (activeGame.status === 'waiting') {
      const shouldCancel = playersCount === 0 || humanPlayers === 0 || hoursSinceUpdate > waitingStaleHours
      if (shouldCancel) {
        waitingGamesToCancel.add(activeGame.id)
        lobbiesToDeactivate.add(lobby.id)
      }
      continue
    }

    if (activeGame.status === 'playing') {
      const shouldAbandon = playersCount === 0 || humanPlayers === 0 || hoursSinceUpdate > playingStaleHours
      if (shouldAbandon) {
        playingGamesToAbandon.add(activeGame.id)
        lobbiesToDeactivate.add(lobby.id)
      }
      continue
    }
  }

  if (waitingGamesToCancel.size > 0) {
    const updated = await prisma.games.updateMany({
      where: {
        id: { in: Array.from(waitingGamesToCancel) },
        status: 'waiting',
      },
      data: {
        status: 'cancelled',
      },
    })
    result.cancelledWaitingGames = updated.count
  }

  if (playingGamesToAbandon.size > 0) {
    const updated = await prisma.games.updateMany({
      where: {
        id: { in: Array.from(playingGamesToAbandon) },
        status: 'playing',
      },
      data: {
        status: 'abandoned',
        abandonedAt: now,
      },
    })
    result.abandonedPlayingGames = updated.count
  }

  if (lobbiesToDeactivate.size > 0) {
    const updated = await prisma.lobbies.updateMany({
      where: {
        id: { in: Array.from(lobbiesToDeactivate) },
        isActive: true,
      },
      data: {
        isActive: false,
        spectatorCount: 0,
      },
    })
    result.deactivatedLobbies = updated.count
  }

  logger.info('Lobby health cleanup cycle completed', {
    scannedLobbies: result.scannedLobbies,
    scannedActiveGames: result.scannedActiveGames,
    deactivatedLobbies: result.deactivatedLobbies,
    cancelledWaitingGames: result.cancelledWaitingGames,
    abandonedPlayingGames: result.abandonedPlayingGames,
    waitingStaleHours,
    playingStaleHours,
    batchLimit,
  })

  return result
}
