import { SendChatMessagePayload, SocketEvents, SocketRooms } from '../../../types/socket-events'
import { parseSendChatMessageInput } from './payload-validation'

type LogContext = Record<string, unknown>

type LoggerLike = {
  warn: (message: string, context?: LogContext) => void
  error: (message: string, error?: Error, context?: LogContext) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface SendChatMessageSocketUser {
  id: string
  username?: string | null
  email?: string | null
}

interface SendChatMessageSocket {
  id: string
  data: {
    user?: SendChatMessageSocketUser
    authorizedLobbies?: Set<string>
  }
  rooms: Set<string>
  emit: (event: string, payload: unknown) => void
}

interface SendChatMessageDependencies {
  logger: LoggerLike
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  emitError: (
    socket: SendChatMessageSocket,
    code: string,
    message: string,
    translationKey?: string,
    details?: unknown
  ) => void
  isSocketAuthorizedForLobby: (socket: SendChatMessageSocket, lobbyCode: string) => boolean
  isUserActivePlayerInLobby: (lobbyCode: string, userId: string) => Promise<boolean>
  getUserDisplayName: (user: { username?: string | null; email?: string | null } | undefined) => string
  emitWithMetadata: (room: string, event: string, data: unknown) => void
}

export function createSendChatMessageHandler({
  logger,
  socketMonitor,
  checkRateLimit,
  emitError,
  isSocketAuthorizedForLobby,
  isUserActivePlayerInLobby,
  getUserDisplayName,
  emitWithMetadata,
}: SendChatMessageDependencies) {
  return async (socket: SendChatMessageSocket, data: SendChatMessagePayload) => {
    socketMonitor.trackEvent('send-chat-message')

    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    const parsedData = parseSendChatMessageInput(data)
    if (!parsedData) {
      logger.warn('Invalid chat message data', { socketId: socket.id })
      return
    }

    const normalizedLobbyCode = parsedData.lobbyCode.trim()
    const normalizedMessage = parsedData.message.trim()

    if (!normalizedLobbyCode || !normalizedMessage || normalizedMessage.length > 500) {
      logger.warn('Invalid chat message data', { socketId: socket.id })
      return
    }

    try {
      if (!isSocketAuthorizedForLobby(socket, normalizedLobbyCode)) {
        logger.warn('Unauthorized chat message attempt', {
          socketId: socket.id,
          lobbyCode: normalizedLobbyCode,
          userId: socket.data.user?.id,
        })
        emitError(socket, 'LOBBY_ACCESS_DENIED', 'Not authorized for this lobby', 'errors.lobbyAccessDenied')
        return
      }

      const senderUserId = socket.data.user?.id
      if (!senderUserId) {
        throw new Error('Socket user is missing')
      }

      const isLobbyPlayer = await isUserActivePlayerInLobby(normalizedLobbyCode, senderUserId)
      if (!isLobbyPlayer) {
        logger.warn('Rejected chat message from non-member', {
          socketId: socket.id,
          lobbyCode: normalizedLobbyCode,
          userId: senderUserId,
        })
        emitError(socket, 'LOBBY_ACCESS_DENIED', 'Not authorized for this lobby', 'errors.lobbyAccessDenied')
        return
      }

      const senderUsername = getUserDisplayName(socket.data.user)

      emitWithMetadata(SocketRooms.lobby(normalizedLobbyCode), SocketEvents.CHAT_MESSAGE, {
        id: Date.now().toString(),
        userId: senderUserId,
        username: senderUsername,
        message: normalizedMessage,
        lobbyCode: normalizedLobbyCode,
      })
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('Error handling chat message', err, {
        socketId: socket.id,
        lobbyCode: normalizedLobbyCode,
        userId: socket.data.user?.id,
      })
      emitError(socket, 'CHAT_MESSAGE_ERROR', 'Failed to process chat message', 'errors.chatMessageFailed')
    }
  }
}

