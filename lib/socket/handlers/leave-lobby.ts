import { SocketRooms } from '../../../types/socket-events'
import { parseJoinLobbyCode } from './payload-validation'

type LogContext = Record<string, unknown>

type SocketLoggerFactory = (scope: string) => {
  debug: (message: string, context?: LogContext) => void
}

interface LeaveLobbySocket {
  id: string
  rooms: Set<string>
  leave: (room: string) => void
  data: {
    user?: {
      id?: string
    }
    authorizedLobbies?: Set<string>
  }
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
  revokeSocketLobbyAuthorization: (socket: LeaveLobbySocket, lobbyCode: string) => void
  disconnectSyncManager: DisconnectSyncManagerLike
}

export function createLeaveLobbyHandler({
  socketMonitor,
  socketLogger,
  revokeSocketLobbyAuthorization,
  disconnectSyncManager,
}: LeaveLobbyDependencies) {
  return (socket: LeaveLobbySocket, lobbyCode: unknown) => {
    const normalizedLobbyCode = parseJoinLobbyCode(lobbyCode)
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
