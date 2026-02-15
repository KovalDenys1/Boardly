import { SocketEvents, SocketRooms } from '../../../types/socket-events'
import { parsePlayerTypingInput } from './payload-validation'

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface PlayerTypingSocket {
  id: string
  data: {
    user: {
      id: string
      username?: string | null
      email?: string | null
    }
    authorizedLobbies?: Set<string>
  }
  rooms: Set<string>
  to: (room: string) => {
    emit: (event: string, payload: unknown) => void
  }
}

interface PlayerTypingDependencies {
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  isSocketAuthorizedForLobby: (socket: PlayerTypingSocket, lobbyCode: string) => boolean
  getUserDisplayName: (user: { username?: string | null; email?: string | null } | undefined) => string
}

export function createPlayerTypingHandler({
  socketMonitor,
  checkRateLimit,
  isSocketAuthorizedForLobby,
  getUserDisplayName,
}: PlayerTypingDependencies) {
  return (socket: PlayerTypingSocket, data: unknown) => {
    socketMonitor.trackEvent('player-typing')

    if (!checkRateLimit(socket.id)) {
      return
    }

    const parsedData = parsePlayerTypingInput(data)
    if (!parsedData) {
      return
    }

    const normalizedLobbyCode = parsedData.lobbyCode.trim()
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
