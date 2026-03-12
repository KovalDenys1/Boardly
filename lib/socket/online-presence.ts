import { Server as SocketIOServer } from 'socket.io'

type LogContext = Record<string, unknown>

type LoggerLike = {
  info: (message: string, context?: LogContext) => void
}

export function createOnlinePresence(_io: Pick<SocketIOServer, 'emit'>, logger: LoggerLike) {
  // userId -> socketIds
  const onlineUsers = new Map<string, Set<string>>()

  function markUserOnline(userId: string, socketId: string) {
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set())
    }
    onlineUsers.get(userId)!.add(socketId)

    logger.info('User marked online', { userId, socketId, totalOnline: onlineUsers.size })
  }

  function markUserOffline(userId: string, socketId: string) {
    const userSockets = onlineUsers.get(userId)
    if (!userSockets) {
      return
    }

    userSockets.delete(socketId)
    if (userSockets.size === 0) {
      onlineUsers.delete(userId)
      logger.info('User marked offline', { userId, socketId, totalOnline: onlineUsers.size })
    }
  }

  function getOnlineUserIds(): string[] {
    return Array.from(onlineUsers.keys())
  }

  function isUserOnline(userId: string): boolean {
    return onlineUsers.has(userId)
  }

  return {
    markUserOnline,
    markUserOffline,
    getOnlineUserIds,
    isUserOnline,
  }
}
