import { SocketErrorContext } from './types'

type LoggerLike = {
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void
}

interface SocketErrorDependencies {
  logger: LoggerLike
}

export function createSocketErrorHandler({ logger }: SocketErrorDependencies) {
  return (socket: SocketErrorContext, error: Error) => {
    logger.error('Socket error', error, { socketId: socket.id })
  }
}
