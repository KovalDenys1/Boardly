import { ConnectionLifecycleSocket } from './types'

type LoggerLike = {
  info: (message: string, context?: Record<string, unknown>) => void
}

interface SocketMonitorLike {
  onDisconnect: (socketId: string) => void
}

interface OnlinePresenceLike {
  markUserOffline: (userId: string, socketId: string) => void
}

interface DisconnectSyncManagerLike {
  scheduleAbruptDisconnectForLobby: (
    lobbyCode: string,
    user: { id: string; username?: string | null; email?: string | null }
  ) => void
}

interface ConnectionLifecycleDependencies {
  logger: LoggerLike
  socketMonitor: SocketMonitorLike
  onlinePresence: OnlinePresenceLike
  clearSocketRateLimit: (socketId: string) => void
  hasAnotherActiveSocketForUserInLobby: (
    userId: string,
    excludingSocketId: string,
    lobbyCode: string
  ) => boolean
  getLobbyCodesFromRooms: (rooms: Iterable<string>) => string[]
  disconnectSyncManager: DisconnectSyncManagerLike
}

export function createConnectionLifecycleHandlers({
  logger,
  socketMonitor,
  onlinePresence,
  clearSocketRateLimit,
  hasAnotherActiveSocketForUserInLobby,
  getLobbyCodesFromRooms,
  disconnectSyncManager,
}: ConnectionLifecycleDependencies) {
  function handleDisconnecting(socket: ConnectionLifecycleSocket) {
    const disconnectingUser = socket.data.user
    if (!disconnectingUser?.id) {
      return
    }

    const lobbyCodes = getLobbyCodesFromRooms(socket.rooms)
    if (lobbyCodes.length === 0) {
      return
    }

    for (const lobbyCode of lobbyCodes) {
      if (hasAnotherActiveSocketForUserInLobby(disconnectingUser.id, socket.id, lobbyCode)) {
        logger.info('Skipping disconnect state sync because another socket is active in lobby', {
          userId: disconnectingUser.id,
          socketId: socket.id,
          lobbyCode,
        })
        continue
      }

      disconnectSyncManager.scheduleAbruptDisconnectForLobby(lobbyCode, disconnectingUser)
    }
  }

  function handleDisconnect(socket: ConnectionLifecycleSocket, reason: string) {
    logger.info('Client disconnected', { socketId: socket.id, reason })

    socketMonitor.onDisconnect(socket.id)

    const userId = socket.data.user?.id
    if (userId && !socket.data.user?.isGuest) {
      onlinePresence.markUserOffline(userId, socket.id)
    }

    clearSocketRateLimit(socket.id)
  }

  return {
    handleDisconnecting,
    handleDisconnect,
  }
}
