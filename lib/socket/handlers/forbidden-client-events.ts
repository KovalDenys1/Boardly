import { EmitSocketErrorFn, ForbiddenClientEventSocket } from './types'

type LoggerLike = {
  warn: (message: string, context?: Record<string, unknown>) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface ForbiddenClientEventsDependencies {
  logger: LoggerLike
  socketMonitor: SocketMonitorLike
  emitError: EmitSocketErrorFn
}

export function createForbiddenClientEventsHandlers({
  logger,
  socketMonitor,
  emitError,
}: ForbiddenClientEventsDependencies) {
  function handleBlockedPlayerJoined(socket: ForbiddenClientEventSocket) {
    socketMonitor.trackEvent('blocked-player-joined')
    logger.warn('Blocked client-side player-joined event', {
      socketId: socket.id,
      userId: socket.data.user?.id,
    })
    emitError(socket, 'FORBIDDEN_ACTION', 'Use server API to broadcast player events', 'errors.forbidden')
  }

  function handleBlockedGameStarted(socket: ForbiddenClientEventSocket) {
    socketMonitor.trackEvent('blocked-game-started')
    logger.warn('Blocked client-side game-started event', {
      socketId: socket.id,
      userId: socket.data.user?.id,
    })
    emitError(socket, 'FORBIDDEN_ACTION', 'Use server API to broadcast game events', 'errors.forbidden')
  }

  return {
    handleBlockedPlayerJoined,
    handleBlockedGameStarted,
  }
}
