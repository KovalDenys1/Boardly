import { SocketEvents, SocketRooms } from '../../../types/socket-events'

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface PlayerTypingPayload {
  lobbyCode: string
  userId: string
  username: string
}

interface PlayerTypingDependencies {
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  isSocketAuthorizedForLobby: (socket: any, lobbyCode: string) => boolean
  getUserDisplayName: (user: { username?: string | null; email?: string | null } | undefined) => string
}

export function createPlayerTypingHandler({
  socketMonitor,
  checkRateLimit,
  isSocketAuthorizedForLobby,
  getUserDisplayName,
}: PlayerTypingDependencies) {
  return (socket: any, data: PlayerTypingPayload) => {
    socketMonitor.trackEvent('player-typing')

    if (!checkRateLimit(socket.id)) {
      return
    }

    const normalizedLobbyCode = typeof data?.lobbyCode === 'string' ? data.lobbyCode.trim() : ''
    if (!normalizedLobbyCode) {
      return
    }

    if (!isSocketAuthorizedForLobby(socket, normalizedLobbyCode)) {
      return
    }

    socket.to(SocketRooms.lobby(normalizedLobbyCode)).emit(SocketEvents.PLAYER_TYPING, {
      userId: socket.data.user.id,
      username: getUserDisplayName(socket.data.user),
    })
  }
}
