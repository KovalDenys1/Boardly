import { SocketEvents, SocketRooms } from '../../../types/socket-events'

type LoggerLike = {
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}

type SocketLoggerFactory = (scope: string) => {
  info: (...args: any[]) => void
}

interface PrismaLike {
  lobbies: {
    findUnique: (args: any) => Promise<any>
  }
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
  emitError: (socket: any, code: string, message: string, translationKey?: string, details?: any) => void
  isUserActivePlayerInLobby: (lobbyCode: string, userId: string) => Promise<boolean>
  markSocketLobbyAuthorized: (socket: any, lobbyCode: string) => void
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
  return async (socket: any, lobbyCode: string) => {
    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    socketMonitor.trackEvent('join-lobby')

    const normalizedLobbyCode = typeof lobbyCode === 'string' ? lobbyCode.trim() : ''

    if (!normalizedLobbyCode || normalizedLobbyCode.length > 20) {
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
    } catch (error) {
      logger.error('Error joining lobby', error as Error, { lobbyCode: normalizedLobbyCode })
      emitError(socket, 'JOIN_LOBBY_ERROR', 'Failed to join lobby', 'errors.joinLobbyFailed')
    }
  }
}

