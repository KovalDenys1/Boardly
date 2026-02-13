import { GameActionPayload } from '../../../types/socket-events'
import { EmitSocketErrorFn, GameActionSocket } from './types'

type LoggerLike = {
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface GameActionDependencies {
  logger: LoggerLike
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  emitError: EmitSocketErrorFn
  isSocketAuthorizedForLobby: (socket: GameActionSocket, lobbyCode: string) => boolean
  isUserActivePlayerInLobby: (lobbyCode: string, userId: string) => Promise<boolean>
  emitGameUpdateToOthers: (
    socket: GameActionSocket,
    lobbyCode: string,
    payload: { action: string; payload: unknown; lobbyCode: string }
  ) => void
  notifyLobbyListUpdate: () => void
}

export function createGameActionHandler({
  logger,
  socketMonitor,
  checkRateLimit,
  emitError,
  isSocketAuthorizedForLobby,
  isUserActivePlayerInLobby,
  emitGameUpdateToOthers,
  notifyLobbyListUpdate,
}: GameActionDependencies) {
  return async (socket: GameActionSocket, data: GameActionPayload) => {
    socketMonitor.trackEvent('game-action')

    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    if (!data?.lobbyCode || !data?.action || typeof data.lobbyCode !== 'string') {
      logger.warn('Invalid game-action data received', { socketId: socket.id })
      emitError(socket, 'INVALID_ACTION_DATA', 'Invalid action data', 'errors.invalidActionData')
      return
    }

    const normalizedLobbyCode = data.lobbyCode.trim()
    if (!normalizedLobbyCode) {
      emitError(socket, 'INVALID_LOBBY_CODE', 'Invalid lobby code', 'errors.invalidLobbyCode')
      return
    }

    try {
      if (!isSocketAuthorizedForLobby(socket, normalizedLobbyCode)) {
        logger.warn('Unauthorized game-action attempt', {
          socketId: socket.id,
          lobbyCode: normalizedLobbyCode,
          userId: socket.data.user?.id,
        })
        emitError(socket, 'LOBBY_ACCESS_DENIED', 'Not authorized for this lobby', 'errors.lobbyAccessDenied')
        return
      }

      const isLobbyPlayer = await isUserActivePlayerInLobby(normalizedLobbyCode, socket.data.user.id)
      if (!isLobbyPlayer) {
        logger.warn('Rejected game-action from non-member', {
          socketId: socket.id,
          lobbyCode: normalizedLobbyCode,
          userId: socket.data.user.id,
        })
        emitError(socket, 'LOBBY_ACCESS_DENIED', 'Not authorized for this lobby', 'errors.lobbyAccessDenied')
        return
      }

      const validActions = ['state-change']
      if (!validActions.includes(data.action)) {
        logger.warn('Invalid action type', { action: data.action, socketId: socket.id })
        return
      }

      emitGameUpdateToOthers(socket, normalizedLobbyCode, {
        action: data.action,
        payload: data.payload,
        lobbyCode: normalizedLobbyCode,
      })

      notifyLobbyListUpdate()
    } catch (error) {
      logger.error('Error handling game-action', error as Error, {
        socketId: socket.id,
        lobbyCode: normalizedLobbyCode,
        userId: socket.data.user?.id,
      })
      emitError(socket, 'GAME_ACTION_ERROR', 'Failed to process game action', 'errors.gameActionFailed')
    }
  }
}
