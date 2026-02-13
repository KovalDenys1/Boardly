type LoggerLike = {
  info: (...args: any[]) => void
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
  hasAnotherActiveSocketForUser: (userId: string, excludingSocketId: string) => boolean
  getLobbyCodesFromRooms: (rooms: Iterable<string>) => string[]
  disconnectSyncManager: DisconnectSyncManagerLike
}

export function createConnectionLifecycleHandlers({
  logger,
  socketMonitor,
  onlinePresence,
  clearSocketRateLimit,
  hasAnotherActiveSocketForUser,
  getLobbyCodesFromRooms,
  disconnectSyncManager,
}: ConnectionLifecycleDependencies) {
  function handleDisconnecting(socket: any) {
    const disconnectingUser = socket.data.user
    if (!disconnectingUser?.id) {
      return
    }

    if (hasAnotherActiveSocketForUser(disconnectingUser.id, socket.id)) {
      logger.info('Skipping disconnect state sync because another socket is active', {
        userId: disconnectingUser.id,
        socketId: socket.id,
      })
      return
    }

    const lobbyCodes = getLobbyCodesFromRooms(socket.rooms)
    if (lobbyCodes.length === 0) {
      return
    }

    for (const lobbyCode of lobbyCodes) {
      disconnectSyncManager.scheduleAbruptDisconnectForLobby(lobbyCode, disconnectingUser)
    }
  }

  function handleDisconnect(socket: any, reason: string) {
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
