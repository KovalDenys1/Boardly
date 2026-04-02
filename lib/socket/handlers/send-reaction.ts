import { randomUUID } from 'crypto'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'
import { SendReactionSocket } from './types'

const ALLOWED_EMOJIS = new Set(['👍', '😂', '😮', '🎉', '🔥'])
const DEFAULT_REACTION_THROTTLE_MS = 3000
const DEFAULT_REACTION_THROTTLE_STALE_MS = 60000

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface SendReactionPayload {
  lobbyCode: string
  emoji: string
}

interface SendReactionDependencies {
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  isSocketAuthorizedForLobby: (socket: SendReactionSocket, lobbyCode: string) => boolean
  getUserDisplayName: (user: { username?: string | null; email?: string | null } | undefined) => string
  emitWithMetadata: (room: string, event: string, data: Record<string, unknown>) => void
  now?: () => number
  reactionThrottleMs?: number
  reactionThrottleStaleMs?: number
}

export function createSendReactionHandler({
  socketMonitor,
  checkRateLimit,
  isSocketAuthorizedForLobby,
  getUserDisplayName,
  emitWithMetadata,
  now = () => Date.now(),
  reactionThrottleMs = DEFAULT_REACTION_THROTTLE_MS,
  reactionThrottleStaleMs = DEFAULT_REACTION_THROTTLE_STALE_MS,
}: SendReactionDependencies) {
  const lastReactionAtByUser = new Map<string, number>()
  let lastCleanupAt = 0

  function cleanupStale(timestamp: number) {
    if (timestamp - lastCleanupAt < reactionThrottleStaleMs) return
    lastCleanupAt = timestamp
    for (const [key, last] of lastReactionAtByUser.entries()) {
      if (timestamp - last >= reactionThrottleStaleMs) {
        lastReactionAtByUser.delete(key)
      }
    }
  }

  return (socket: SendReactionSocket, data: SendReactionPayload) => {
    socketMonitor.trackEvent('send-reaction')

    if (!checkRateLimit(socket.id)) return

    const lobbyCode = typeof data?.lobbyCode === 'string' ? data.lobbyCode.trim() : ''
    if (!lobbyCode) return

    const emoji = typeof data?.emoji === 'string' ? data.emoji : ''
    if (!ALLOWED_EMOJIS.has(emoji)) return

    if (!isSocketAuthorizedForLobby(socket, lobbyCode)) return

    const userId = socket.data.user.id
    const nowTs = now()
    const lastAt = lastReactionAtByUser.get(userId)
    if (typeof lastAt === 'number' && nowTs - lastAt < reactionThrottleMs) return

    lastReactionAtByUser.set(userId, nowTs)
    cleanupStale(nowTs)

    emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.REACTION, {
      id: randomUUID(),
      userId,
      username: getUserDisplayName(socket.data.user),
      emoji,
      timestamp: nowTs,
    })
  }
}
