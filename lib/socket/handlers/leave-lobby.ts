import { SocketRooms } from '../../../types/socket-events'

type SocketLoggerFactory = (scope: string) => {
  debug: (...args: any[]) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface DisconnectSyncManagerLike {
  clearPendingAbruptDisconnect: (lobbyCode: string, userId: string, reason?: string) => void
}

interface LeaveLobbyDependencies {
  socketMonitor: SocketMonitorLike
  socketLogger: SocketLoggerFactory
  revokeSocketLobbyAuthorization: (socket: any, lobbyCode: string) => void
  disconnectSyncManager: DisconnectSyncManagerLike
}

export function createLeaveLobbyHandler({
  socketMonitor,
  socketLogger,
  revokeSocketLobbyAuthorization,
  disconnectSyncManager,
}: LeaveLobbyDependencies) {
  return (socket: any, lobbyCode: string) => {
    const normalizedLobbyCode = typeof lobbyCode === 'string' ? lobbyCode.trim() : ''
    if (!normalizedLobbyCode) {
      return
    }

    socketMonitor.trackEvent('leave-lobby')
    socket.leave(SocketRooms.lobby(normalizedLobbyCode))
    revokeSocketLobbyAuthorization(socket, normalizedLobbyCode)

    if (socket.data.user?.id) {
      disconnectSyncManager.clearPendingAbruptDisconnect(
        normalizedLobbyCode,
        socket.data.user.id,
        'left-lobby-explicitly'
      )
    }

    socketLogger('leave-lobby').debug('Socket left lobby', {
      socketId: socket.id,
      lobbyCode: normalizedLobbyCode,
    })
  }
}
