import { Server as SocketIOServer } from 'socket.io'
import { SocketEvents, SocketRooms } from '../../types/socket-events'
import {
  advanceTurnPastDisconnectedPlayers,
  setPlayerConnectionInState,
  TurnState,
} from '../disconnected-turn'
import { getLobbyPlayerRequirements } from '../lobby-player-requirements'
import { parsePersistedGameState, toPersistedGameStateInput, type PersistedGameStateValue } from '../persisted-game-state'

type LogContext = Record<string, unknown>

type LoggerLike = {
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
}

type RoomBroadcasterLike = Pick<SocketIOServer, 'to'>

type PrismaLike = {
  games: Pick<typeof import('../db').prisma.games, 'findFirst' | 'updateMany'>
  players: Pick<typeof import('../db').prisma.players, 'deleteMany'>
  lobbies: Pick<typeof import('../db').prisma.lobbies, 'updateMany'>
}

interface ActiveGamePlayerRecord {
  userId: string
  position: number
  user: {
    username: string | null
    email: string | null
    bot: unknown
  }
}

interface ActiveLobbyGameRecord {
  id: string
  gameType: string
  state: PersistedGameStateValue
  currentTurn: number
  updatedAt: Date
  startedAt: Date | null
  players: ActiveGamePlayerRecord[]
}

interface WaitingLobbyPlayerRecord {
  id: string
  userId: string
  user: {
    username: string | null
    email: string | null
    bot: unknown
  }
}

interface WaitingLobbyGameRecord {
  id: string
  players: WaitingLobbyPlayerRecord[]
}

interface WaitingLobbyDisconnectCleanupResult {
  handled: boolean
  gameId?: string
  remainingPlayers?: number
  remainingHumanPlayers?: number
  lobbyDeactivated?: boolean
}

interface ConnectionSyncResult {
  updated: boolean
  abandoned: boolean
  turnAdvanced: boolean
  skippedPlayerIds: string[]
  gameId?: string
  updatedState?: TurnState
}

interface DisconnectSyncUser {
  id: string
  username?: string | null
  email?: string | null
}

interface DisconnectSyncOptions {
  io: RoomBroadcasterLike
  prisma: PrismaLike
  logger: LoggerLike
  emitWithMetadata: (room: string, event: string, data: unknown) => void
  hasAnyActiveSocketForUserInLobby: (userId: string, lobbyCode: string) => boolean
  disconnectGraceMs: number
  connectionStateSyncMaxRetries?: number
}

function getAbruptDisconnectKey(lobbyCode: string, userId: string): string {
  return `${lobbyCode}:${userId}`
}

function getUserDisplayName(user: DisconnectSyncUser | undefined): string {
  return user?.username || user?.email || 'Player'
}

// Grace window after game start — players may still be navigating to the game page
const GAME_START_GRACE_MS = 30_000

function shouldAbandonDisconnectedMatch(
  activeGame: Pick<ActiveLobbyGameRecord, 'gameType' | 'startedAt'>,
  parsedState: TurnState,
  isActive: boolean
): boolean {
  if (isActive) {
    return false
  }

  if (!Array.isArray(parsedState.players) || parsedState.players.length === 0) {
    return false
  }

  if (activeGame.startedAt && Date.now() - activeGame.startedAt.getTime() < GAME_START_GRACE_MS) {
    return false
  }

  const minPlayersRequired = getLobbyPlayerRequirements(activeGame.gameType).minPlayersRequired
  const activeParticipants = parsedState.players.filter((player) => player?.isActive !== false).length
  return activeParticipants < minPlayersRequired
}

export function createDisconnectSyncManager({
  io,
  prisma,
  logger,
  emitWithMetadata,
  hasAnyActiveSocketForUserInLobby,
  disconnectGraceMs,
  connectionStateSyncMaxRetries = 3,
}: DisconnectSyncOptions) {
  const pendingAbruptDisconnects = new Map<string, NodeJS.Timeout>()

  async function loadActiveGameForLobby(lobbyCode: string): Promise<ActiveLobbyGameRecord | null> {
    return (await prisma.games.findFirst({
      where: {
        status: 'playing',
        lobby: {
          code: lobbyCode,
        },
      },
      select: {
        id: true,
        gameType: true,
        state: true,
        currentTurn: true,
        updatedAt: true,
        startedAt: true,
        players: {
          orderBy: {
            position: 'asc',
          },
          select: {
            userId: true,
            position: true,
            user: {
              select: {
                username: true,
                email: true,
                bot: true,
              },
            },
          },
        },
      },
    })) as ActiveLobbyGameRecord | null
  }

  async function syncPlayerConnectionStateInLobby(
    lobbyCode: string,
    userId: string,
    isActive: boolean,
    options: { advanceTurnIfCurrent: boolean }
  ): Promise<ConnectionSyncResult> {
    for (let attempt = 1; attempt <= connectionStateSyncMaxRetries; attempt += 1) {
      const activeGame = await loadActiveGameForLobby(lobbyCode)
      if (!activeGame) {
        return { updated: false, abandoned: false, turnAdvanced: false, skippedPlayerIds: [] }
      }

      let parsedState: TurnState
      try {
        parsedState = parsePersistedGameState<TurnState>(activeGame.state)
      } catch (error) {
        logger.warn('Failed to parse game state during connection sync', {
          lobbyCode,
          gameId: activeGame.id,
          userId,
        })
        return { updated: false, abandoned: false, turnAdvanced: false, skippedPlayerIds: [] }
      }

      if (!Array.isArray(parsedState.players) || parsedState.players.length === 0) {
        return { updated: false, abandoned: false, turnAdvanced: false, skippedPlayerIds: [] }
      }

      const now = Date.now()
      const connectionChanged = setPlayerConnectionInState(parsedState, userId, isActive, now)
      const shouldAbandon = shouldAbandonDisconnectedMatch(activeGame, parsedState, isActive)

      let turnAdvanced = false
      let skippedPlayerIds: string[] = []

      if (!shouldAbandon && options.advanceTurnIfCurrent) {
        const botUserIds = new Set(
          activeGame.players
            .filter((player) => !!player.user.bot)
            .map((player) => player.userId)
        )
        const turnResult = advanceTurnPastDisconnectedPlayers(parsedState, botUserIds, now)
        turnAdvanced = turnResult.changed
        skippedPlayerIds = turnResult.skippedPlayerIds
      }

      if (!connectionChanged && !turnAdvanced && !shouldAbandon) {
        return {
          updated: false,
          abandoned: false,
          turnAdvanced: false,
          skippedPlayerIds: [],
          gameId: activeGame.id,
        }
      }

      const nextCurrentTurn = turnAdvanced ? activeGame.currentTurn + 1 : activeGame.currentTurn

      const abandonNow = new Date(now)
      const startedAt = shouldAbandon ? activeGame.startedAt : null
      const abandonDurationSeconds =
        shouldAbandon && startedAt instanceof Date
          ? Math.floor((abandonNow.getTime() - startedAt.getTime()) / 1000)
          : null

      const baseUpdateData = {
        state: toPersistedGameStateInput(parsedState),
        currentTurn: nextCurrentTurn,
        updatedAt: new Date(),
        ...(turnAdvanced ? { lastMoveAt: new Date(now) } : {}),
        ...(shouldAbandon
          ? {
              status: 'abandoned' as const,
              abandonedAt: abandonNow,
              endedAt: abandonNow,
              ...(abandonDurationSeconds !== null ? { durationSeconds: abandonDurationSeconds } : {}),
              terminalMetadata: JSON.parse(JSON.stringify({ outcome: 'abandoned', reason: 'disconnect' })),
            }
          : {}),
      }

      const updateResult = await prisma.games.updateMany({
        where: {
          id: activeGame.id,
          currentTurn: activeGame.currentTurn,
          updatedAt: activeGame.updatedAt,
        },
        data: baseUpdateData,
      })

      if (updateResult.count > 0) {
        if (shouldAbandon) {
          await prisma.lobbies.updateMany({
            where: { code: lobbyCode, isActive: true },
            data: { isActive: false, spectatorCount: 0 },
          })
        }

        return {
          updated: true,
          abandoned: shouldAbandon,
          turnAdvanced,
          skippedPlayerIds,
          gameId: activeGame.id,
          updatedState: parsedState,
        }
      }

      logger.warn('Connection state sync conflict, retrying', {
        lobbyCode,
        gameId: activeGame.id,
        userId,
        attempt,
        isActive,
      })
    }

    logger.warn('Connection state sync failed after max retries', {
      lobbyCode,
      userId,
      isActive,
      maxRetries: connectionStateSyncMaxRetries,
    })

    return { updated: false, abandoned: false, turnAdvanced: false, skippedPlayerIds: [] }
  }

  async function cleanupWaitingLobbyAfterDisconnect(
    lobbyCode: string,
    user: DisconnectSyncUser
  ): Promise<WaitingLobbyDisconnectCleanupResult> {
    const waitingGame = (await prisma.games.findFirst({
      where: {
        status: 'waiting',
        lobby: {
          code: lobbyCode,
        },
        players: {
          some: {
            userId: user.id,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        players: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                username: true,
                email: true,
                bot: true,
              },
            },
          },
        },
      },
    })) as WaitingLobbyGameRecord | null

    if (!waitingGame) {
      return { handled: false }
    }

    const disconnectingPlayer = waitingGame.players.find((player) => player.userId === user.id)
    if (!disconnectingPlayer) {
      return { handled: false, gameId: waitingGame.id }
    }

    const deleteResult = await prisma.players.deleteMany({
      where: {
        gameId: waitingGame.id,
        userId: user.id,
        game: {
          status: 'waiting',
        },
      },
    })

    if (deleteResult.count === 0) {
      return { handled: false, gameId: waitingGame.id }
    }

    const remainingPlayers = waitingGame.players.filter((player) => player.userId !== user.id)
    const remainingHumanPlayers = remainingPlayers.filter((player) => !player.user.bot).length

    let lobbyDeactivated = false
    if (remainingPlayers.length === 0 || remainingHumanPlayers === 0) {
      const updateResult = await prisma.lobbies.updateMany({
        where: {
          code: lobbyCode,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      })
      lobbyDeactivated = updateResult.count > 0
    }

    return {
      handled: true,
      gameId: waitingGame.id,
      remainingPlayers: remainingPlayers.length,
      remainingHumanPlayers,
      lobbyDeactivated,
    }
  }

  async function handleAbruptDisconnectForLobby(lobbyCode: string, user: DisconnectSyncUser) {
    const syncResult = await syncPlayerConnectionStateInLobby(lobbyCode, user.id, false, {
      advanceTurnIfCurrent: true,
    })

    if (!syncResult.updated || !syncResult.updatedState) {
      const waitingCleanup = await cleanupWaitingLobbyAfterDisconnect(lobbyCode, user)
      if (!waitingCleanup.handled) {
        return
      }

      const playerName = getUserDisplayName(user)

      emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.PLAYER_LEFT, {
        lobbyCode,
        userId: user.id,
        username: playerName,
        reason: 'disconnect',
      })

      emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.LOBBY_UPDATE, {
        lobbyCode,
        type: 'state-refresh',
        data: {
          userId: user.id,
          disconnected: true,
          reason: 'abrupt-disconnect',
          gameId: waitingCleanup.gameId,
        },
      })

      io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)

      logger.info('Cleaned up waiting lobby after abrupt disconnect', {
        lobbyCode,
        gameId: waitingCleanup.gameId,
        userId: user.id,
        remainingPlayers: waitingCleanup.remainingPlayers,
        remainingHumanPlayers: waitingCleanup.remainingHumanPlayers,
        lobbyDeactivated: waitingCleanup.lobbyDeactivated,
      })
      return
    }

    const playerName = getUserDisplayName(user)

    emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.PLAYER_LEFT, {
      lobbyCode,
      userId: user.id,
      username: playerName,
      reason: 'error',
    })

    emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.LOBBY_UPDATE, {
      lobbyCode,
      type: 'state-refresh',
      data: {
        userId: user.id,
        disconnected: true,
        reason: 'abrupt-disconnect',
      },
    })

    if (syncResult.abandoned && syncResult.gameId) {
      emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.GAME_ABANDONED, {
        lobbyCode,
        gameId: syncResult.gameId,
        reason: 'insufficient_players',
        abandonedBy: user.id,
      })
    } else {
      emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.GAME_UPDATE, {
        action: 'state-change',
        payload: syncResult.updatedState,
        lobbyCode,
      })
    }

    io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)

    logger.info('Applied disconnect state sync', {
      lobbyCode,
      gameId: syncResult.gameId,
      userId: user.id,
      abandoned: syncResult.abandoned,
      turnAdvanced: syncResult.turnAdvanced,
      skippedPlayerIds: syncResult.skippedPlayerIds,
    })
  }

  function clearPendingAbruptDisconnect(lobbyCode: string, userId: string, reason?: string) {
    const key = getAbruptDisconnectKey(lobbyCode, userId)
    const timer = pendingAbruptDisconnects.get(key)
    if (!timer) {
      return
    }

    clearTimeout(timer)
    pendingAbruptDisconnects.delete(key)

    logger.info('Cancelled pending disconnect sync', {
      lobbyCode,
      userId,
      reason: reason || 'unknown',
    })
  }

  function scheduleAbruptDisconnectForLobby(lobbyCode: string, user: DisconnectSyncUser) {
    const key = getAbruptDisconnectKey(lobbyCode, user.id)
    const existingTimer = pendingAbruptDisconnects.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timeoutId = setTimeout(() => {
      pendingAbruptDisconnects.delete(key)

      if (hasAnyActiveSocketForUserInLobby(user.id, lobbyCode)) {
        logger.info('Skipping delayed disconnect sync because user reconnected', {
          lobbyCode,
          userId: user.id,
        })
        return
      }

      void handleAbruptDisconnectForLobby(lobbyCode, user).catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error))
        logger.warn('Delayed disconnect sync failed', {
          lobbyCode,
          userId: user.id,
          error: err.message,
        })
      })
    }, disconnectGraceMs)

    pendingAbruptDisconnects.set(key, timeoutId)
    logger.info('Scheduled delayed disconnect sync', {
      lobbyCode,
      userId: user.id,
      delayMs: disconnectGraceMs,
    })
  }

  function dispose() {
    for (const timer of pendingAbruptDisconnects.values()) {
      clearTimeout(timer)
    }
    pendingAbruptDisconnects.clear()
  }

  return {
    clearPendingAbruptDisconnect,
    scheduleAbruptDisconnectForLobby,
    syncPlayerConnectionStateInLobby,
    dispose,
  }
}
