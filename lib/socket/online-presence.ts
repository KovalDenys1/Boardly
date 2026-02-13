import { Server as SocketIOServer } from 'socket.io'
import { SocketEvents } from '../../types/socket-events'

type LoggerLike = {
  info: (...args: any[]) => void
}

export function createOnlinePresence(io: SocketIOServer, logger: LoggerLike) {
  // userId -> socketIds
  const onlineUsers = new Map<string, Set<string>>()

  function markUserOnline(userId: string, socketId: string) {
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set())
    }
    onlineUsers.get(userId)!.add(socketId)

    io.emit(SocketEvents.USER_ONLINE, { userId })
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
      io.emit(SocketEvents.USER_OFFLINE, { userId })
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

