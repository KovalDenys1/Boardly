import { SocketRooms } from '../../../types/socket-events'

type LogContext = Record<string, unknown>

type SocketLoggerFactory = (scope: string) => {
  debug: (message: string, context?: LogContext) => void
}

interface LobbyListMembershipSocket {
  id: string
  join: (room: string) => void
  leave: (room: string) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface LobbyListMembershipDependencies {
  socketMonitor: SocketMonitorLike
  socketLogger: SocketLoggerFactory
}

export function createLobbyListMembershipHandlers({
  socketMonitor,
  socketLogger,
}: LobbyListMembershipDependencies) {
  function handleJoinLobbyList(socket: LobbyListMembershipSocket) {
    socketMonitor.trackEvent('join-lobby-list')
    socket.join(SocketRooms.lobbyList())
    socketLogger('join-lobby-list').debug('Socket joined lobby-list', { socketId: socket.id })
  }

  function handleLeaveLobbyList(socket: LobbyListMembershipSocket) {
    socketMonitor.trackEvent('leave-lobby-list')
    socket.leave(SocketRooms.lobbyList())
    socketLogger('leave-lobby-list').debug('Socket left lobby-list', { socketId: socket.id })
  }

  return {
    handleJoinLobbyList,
    handleLeaveLobbyList,
  }
}
