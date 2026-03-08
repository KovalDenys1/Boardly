import { SocketEvents, SocketRooms } from '../../../types/socket-events'
import { PlayerTypingSocket } from './types'

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

const DEFAULT_TYPING_THROTTLE_MS = 2000
const DEFAULT_TYPING_THROTTLE_STALE_MS = 60000

interface PlayerTypingPayload {
  lobbyCode: string
  userId: string
  username: string
}

interface PlayerTypingDependencies {
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  isSocketAuthorizedForLobby: (socket: PlayerTypingSocket, lobbyCode: string) => boolean
  getUserDisplayName: (user: { username?: string | null; email?: string | null } | undefined) => string
  emitWithMetadata: (room: string, event: string, data: unknown) => void
  now?: () => number
  typingThrottleMs?: number
  typingThrottleStaleMs?: number
}

export function createPlayerTypingHandler({
  socketMonitor,
  checkRateLimit,
  isSocketAuthorizedForLobby,
  getUserDisplayName,
  emitWithMetadata,
  now = () => Date.now(),
  typingThrottleMs = DEFAULT_TYPING_THROTTLE_MS,
  typingThrottleStaleMs = DEFAULT_TYPING_THROTTLE_STALE_MS,
}: PlayerTypingDependencies) {
  const lastTypingEventAtByMember = new Map<string, number>()
  let lastCleanupAt = 0

  const throttleMs = Math.max(0, typingThrottleMs)
  const throttleStaleMs = Math.max(throttleMs, typingThrottleStaleMs)

  function cleanupStaleThrottleEntries(timestamp: number) {
    if (timestamp - lastCleanupAt < throttleStaleMs) {
      return
    }

    lastCleanupAt = timestamp

    for (const [key, lastTimestamp] of lastTypingEventAtByMember.entries()) {
      if (timestamp - lastTimestamp >= throttleStaleMs) {
        lastTypingEventAtByMember.delete(key)
      }
    }
  }

  return (socket: PlayerTypingSocket, data: PlayerTypingPayload) => {
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

    const userId = socket.data.user.id
    const nowTimestamp = now()
    const throttledMemberKey = `${normalizedLobbyCode}:${userId}`
    const lastTypingTimestamp = lastTypingEventAtByMember.get(throttledMemberKey)

    if (
      typeof lastTypingTimestamp === 'number' &&
      nowTimestamp - lastTypingTimestamp < throttleMs
    ) {
      return
    }

    lastTypingEventAtByMember.set(throttledMemberKey, nowTimestamp)
    cleanupStaleThrottleEntries(nowTimestamp)

    emitWithMetadata(SocketRooms.lobby(normalizedLobbyCode), SocketEvents.PLAYER_TYPING, {
      userId,
      username: getUserDisplayName(socket.data.user),
    })
  }
}
