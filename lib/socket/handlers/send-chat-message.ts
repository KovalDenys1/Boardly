import { SocketEvents, SocketRooms } from '../../../types/socket-events'

type LoggerLike = {
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface SendChatMessagePayload {
  lobbyCode: string
  message: string
  userId: string
  username: string
}

interface SendChatMessageDependencies {
  logger: LoggerLike
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  emitError: (socket: any, code: string, message: string, translationKey?: string, details?: any) => void
  isSocketAuthorizedForLobby: (socket: any, lobbyCode: string) => boolean
  isUserActivePlayerInLobby: (lobbyCode: string, userId: string) => Promise<boolean>
  getUserDisplayName: (user: { username?: string | null; email?: string | null } | undefined) => string
  emitWithMetadata: (room: string, event: string, data: any) => void
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
  return async (socket: any, data: SendChatMessagePayload) => {
    socketMonitor.trackEvent('send-chat-message')

    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    const normalizedLobbyCode = typeof data?.lobbyCode === 'string' ? data.lobbyCode.trim() : ''
    const normalizedMessage = typeof data?.message === 'string' ? data.message.trim() : ''

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

      const isLobbyPlayer = await isUserActivePlayerInLobby(normalizedLobbyCode, socket.data.user.id)
      if (!isLobbyPlayer) {
        logger.warn('Rejected chat message from non-member', {
          socketId: socket.id,
          lobbyCode: normalizedLobbyCode,
          userId: socket.data.user.id,
        })
        emitError(socket, 'LOBBY_ACCESS_DENIED', 'Not authorized for this lobby', 'errors.lobbyAccessDenied')
        return
      }

      const senderUserId = socket.data.user.id
      const senderUsername = getUserDisplayName(socket.data.user)

      emitWithMetadata(SocketRooms.lobby(normalizedLobbyCode), SocketEvents.CHAT_MESSAGE, {
        id: Date.now().toString(),
        userId: senderUserId,
        username: senderUsername,
        message: normalizedMessage,
        lobbyCode: normalizedLobbyCode,
      })
    } catch (error) {
      logger.error('Error handling chat message', error as Error, {
        socketId: socket.id,
        lobbyCode: normalizedLobbyCode,
        userId: socket.data.user?.id,
      })
      emitError(socket, 'CHAT_MESSAGE_ERROR', 'Failed to process chat message', 'errors.chatMessageFailed')
    }
  }
}

