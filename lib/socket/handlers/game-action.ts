import { GameActionPayload } from '../../../types/socket-events'
import { parseGameActionInput } from './payload-validation'

type LogContext = Record<string, unknown>

type LoggerLike = {
  warn: (message: string, context?: LogContext) => void
  error: (message: string, error?: Error, context?: LogContext) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface GameActionSocketUser {
  id: string
}

interface GameActionSocket {
  id: string
  data: {
    user?: GameActionSocketUser
    authorizedLobbies?: Set<string>
  }
  rooms: Set<string>
  emit: (event: string, payload: unknown) => void
  to: (room: string) => {
    emit: (event: string, payload: unknown) => void
  }
}

interface GameActionDependencies {
  logger: LoggerLike
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  emitError: (
    socket: GameActionSocket,
    code: string,
    message: string,
    translationKey?: string,
    details?: unknown
  ) => void
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

    const parsedData = parseGameActionInput(data)
    if (!parsedData || !parsedData.lobbyCode || !parsedData.action) {
      logger.warn('Invalid game-action data received', { socketId: socket.id })
      emitError(socket, 'INVALID_ACTION_DATA', 'Invalid action data', 'errors.invalidActionData')
      return
    }

    const normalizedLobbyCode = parsedData.lobbyCode.trim()
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

      const userId = socket.data.user?.id
      if (!userId) {
        throw new Error('Socket user is missing')
      }

      const isLobbyPlayer = await isUserActivePlayerInLobby(normalizedLobbyCode, userId)
      if (!isLobbyPlayer) {
        logger.warn('Rejected game-action from non-member', {
          socketId: socket.id,
          lobbyCode: normalizedLobbyCode,
          userId,
        })
        emitError(socket, 'LOBBY_ACCESS_DENIED', 'Not authorized for this lobby', 'errors.lobbyAccessDenied')
        return
      }

      const validActions = ['state-change']
      if (typeof parsedData.action !== 'string' || !validActions.includes(parsedData.action)) {
        logger.warn('Invalid action type', { action: parsedData.action, socketId: socket.id })
        return
      }

      emitGameUpdateToOthers(socket, normalizedLobbyCode, {
        action: parsedData.action,
        payload: parsedData.payload,
        lobbyCode: normalizedLobbyCode,
      })

      notifyLobbyListUpdate()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('Error handling game-action', err, {
        socketId: socket.id,
        lobbyCode: normalizedLobbyCode,
        userId: socket.data.user?.id,
      })
      emitError(socket, 'GAME_ACTION_ERROR', 'Failed to process game action', 'errors.gameActionFailed')
    }
  }
}

