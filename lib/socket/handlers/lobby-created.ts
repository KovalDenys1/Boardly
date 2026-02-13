type SocketLoggerFactory = (scope: string) => {
  info: (message: string, context?: Record<string, unknown>) => void
}

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface LobbyCreatedDependencies {
  socketMonitor: SocketMonitorLike
  socketLogger: SocketLoggerFactory
  notifyLobbyListUpdate: () => void
}

export function createLobbyCreatedHandler({
  socketMonitor,
  socketLogger,
  notifyLobbyListUpdate,
}: LobbyCreatedDependencies) {
  return () => {
    socketMonitor.trackEvent('lobby-created')
    socketLogger('lobby-created').info('New lobby created, notifying lobby list')
    notifyLobbyListUpdate()
  }
}
