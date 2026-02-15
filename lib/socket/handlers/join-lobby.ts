import type { PrismaClient } from '@prisma/client'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'
import { parseJoinLobbyCode } from './payload-validation'

type LogContext = Record<string, unknown>

type LoggerLike = {
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, error?: Error, context?: LogContext) => void
}

type SocketLoggerFactory = (scope: string) => {
  info: (message: string, context?: LogContext) => void
}

interface JoinLobbySocketUser {
  id: string
  username?: string | null
}

interface JoinLobbySocket {
  id: string
  data: {
    user: JoinLobbySocketUser
    authorizedLobbies?: Set<string>
  }
  rooms: Set<string>
  join: (room: string) => void
  emit: (event: string, payload: unknown) => void
}

interface PrismaLike {
  lobbies: Pick<PrismaClient['lobbies'], 'findUnique'>
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface DisconnectSyncManagerLike {
  clearPendingAbruptDisconnect: (lobbyCode: string, userId: string, reason?: string) => void
  syncPlayerConnectionStateInLobby: (
    lobbyCode: string,
    userId: string,
    isActive: boolean,
    options: { advanceTurnIfCurrent: boolean }
  ) => Promise<unknown>
}

interface JoinLobbyDependencies {
  logger: LoggerLike
  socketLogger: SocketLoggerFactory
  prisma: PrismaLike
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  emitError: (
    socket: JoinLobbySocket,
    code: string,
    message: string,
    translationKey?: string,
    details?: unknown
  ) => void
  isUserActivePlayerInLobby: (lobbyCode: string, userId: string) => Promise<boolean>
  markSocketLobbyAuthorized: (socket: JoinLobbySocket, lobbyCode: string) => void
  disconnectSyncManager: DisconnectSyncManagerLike
}

export function createJoinLobbyHandler({
  logger,
  socketLogger,
  prisma,
  socketMonitor,
  checkRateLimit,
  emitError,
  isUserActivePlayerInLobby,
  markSocketLobbyAuthorized,
  disconnectSyncManager,
}: JoinLobbyDependencies) {
  return async (socket: JoinLobbySocket, lobbyCode: unknown) => {
    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    socketMonitor.trackEvent('join-lobby')

    const normalizedLobbyCode = parseJoinLobbyCode(lobbyCode)
    if (!normalizedLobbyCode) {
      logger.warn('Invalid lobby code received', { lobbyCode, socketId: socket.id })
      emitError(socket, 'INVALID_LOBBY_CODE', 'Invalid lobby code', 'errors.invalidLobbyCode')
      return
    }

    try {
      const lobby = await prisma.lobbies.findUnique({
        where: { code: normalizedLobbyCode },
        select: {
          id: true,
          code: true,
          isActive: true,
        },
      })

      if (!lobby) {
        emitError(socket, 'LOBBY_NOT_FOUND', 'Lobby not found', 'errors.lobbyNotFound', { lobbyCode: normalizedLobbyCode })
        return
      }

      const isLobbyPlayer = await isUserActivePlayerInLobby(normalizedLobbyCode, socket.data.user.id)
      if (!isLobbyPlayer) {
        logger.warn('Socket join denied: user is not an active lobby player', {
          socketId: socket.id,
          lobbyCode: normalizedLobbyCode,
          userId: socket.data.user.id,
        })
        emitError(socket, 'LOBBY_ACCESS_DENIED', 'You are not a member of this lobby', 'errors.lobbyAccessDenied')
        return
      }

      socket.join(SocketRooms.lobby(normalizedLobbyCode))
      markSocketLobbyAuthorized(socket, normalizedLobbyCode)
      disconnectSyncManager.clearPendingAbruptDisconnect(normalizedLobbyCode, socket.data.user.id, 'rejoined-lobby')
      socketLogger('join-lobby').info('Socket joined lobby', {
        socketId: socket.id,
        lobbyCode: normalizedLobbyCode,
        userId: socket.data.user.id,
        username: socket.data.user.username,
      })

      await disconnectSyncManager.syncPlayerConnectionStateInLobby(normalizedLobbyCode, socket.data.user.id, true, {
        advanceTurnIfCurrent: false,
      })

      socket.emit(SocketEvents.JOINED_LOBBY, { lobbyCode: normalizedLobbyCode, success: true })
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('Error joining lobby', err, { lobbyCode: normalizedLobbyCode })
      emitError(socket, 'JOIN_LOBBY_ERROR', 'Failed to join lobby', 'errors.joinLobbyFailed')
    }
  }
}

