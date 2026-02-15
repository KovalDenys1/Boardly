import { IncomingMessage } from 'http'
import { ServerErrorPayload, SocketEvents, SocketRooms } from '../../types/socket-events'

type LogContext = Record<string, unknown>

type LoggerLike = {
  warn: (message: string, context?: LogContext) => void
  error: (message: string, error?: Error, context?: LogContext) => void
}

type EmitTarget = {
  emit: (event: string, payload: unknown) => void
}

type MetadataCarrier = Record<string, unknown>

type SocketWithEmit = {
  id?: string
  emit: (event: string, payload: unknown) => void
}

type SocketWithLobbyAuthorization = {
  data: {
    authorizedLobbies?: Set<string>
  }
  rooms: Set<string>
}

const SOCKET_INTERNAL_AUTH_HEADER = 'x-socket-internal-secret'
const SOCKET_INTERNAL_AUTH_BEARER_PREFIX = 'Bearer '

function toMetadataCarrier(data: unknown): MetadataCarrier {
  if (!data || typeof data !== 'object') {
    return {}
  }
  return data as MetadataCarrier
}

export function emitWithMetadata(
  target: EmitTarget,
  event: string,
  data: unknown,
  getNextSequenceId: () => number
) {
  const payload = {
    ...toMetadataCarrier(data),
    sequenceId: getNextSequenceId(),
    timestamp: Date.now(),
    version: '1.0.0',
  }
  target.emit(event, payload)
  return payload
}

export function emitError(
  socket: SocketWithEmit,
  logger: LoggerLike,
  code: string,
  message: string,
  translationKey?: string,
  details?: unknown
) {
  const error: ServerErrorPayload = {
    code,
    message,
    translationKey,
    details: details as Record<string, unknown> | undefined,
    stack: process.env.NODE_ENV === 'development' ? new Error().stack : undefined,
  }
  socket.emit(SocketEvents.SERVER_ERROR, error)
  logger.warn('Socket error emitted', { code, message, socketId: socket.id })
}

export function getAuthorizedLobbySet(socket: SocketWithLobbyAuthorization): Set<string> {
  if (!(socket.data.authorizedLobbies instanceof Set)) {
    socket.data.authorizedLobbies = new Set<string>()
  }
  return socket.data.authorizedLobbies
}

export function markSocketLobbyAuthorized(socket: SocketWithLobbyAuthorization, lobbyCode: string) {
  getAuthorizedLobbySet(socket).add(lobbyCode)
}

export function revokeSocketLobbyAuthorization(socket: SocketWithLobbyAuthorization, lobbyCode: string) {
  getAuthorizedLobbySet(socket).delete(lobbyCode)
}

export function isSocketAuthorizedForLobby(socket: SocketWithLobbyAuthorization, lobbyCode: string): boolean {
  const authorizedLobbies = getAuthorizedLobbySet(socket)
  return authorizedLobbies.has(lobbyCode) && socket.rooms.has(SocketRooms.lobby(lobbyCode))
}

export function extractInternalRequestSecret(req: IncomingMessage): string | null {
  const secretHeader = req.headers?.[SOCKET_INTERNAL_AUTH_HEADER]
  if (typeof secretHeader === 'string' && secretHeader.trim()) {
    return secretHeader.trim()
  }
  if (Array.isArray(secretHeader) && secretHeader.length > 0) {
    const firstSecret = secretHeader[0]?.trim()
    return firstSecret || null
  }

  const authorizationHeader = req.headers?.authorization
  if (
    typeof authorizationHeader === 'string' &&
    authorizationHeader.startsWith(SOCKET_INTERNAL_AUTH_BEARER_PREFIX)
  ) {
    return authorizationHeader.slice(SOCKET_INTERNAL_AUTH_BEARER_PREFIX.length).trim() || null
  }
  if (Array.isArray(authorizationHeader) && authorizationHeader.length > 0) {
    const firstAuth = authorizationHeader[0]
    if (
      typeof firstAuth === 'string' &&
      firstAuth.startsWith(SOCKET_INTERNAL_AUTH_BEARER_PREFIX)
    ) {
      return firstAuth.slice(SOCKET_INTERNAL_AUTH_BEARER_PREFIX.length).trim() || null
    }
  }

  return null
}

export function isInternalEndpointAuthorized(
  req: IncomingMessage,
  logger: LoggerLike,
  nodeEnv: string | undefined,
  socketInternalSecret: string | undefined
): boolean {
  if (nodeEnv !== 'production') {
    return true
  }

  if (!socketInternalSecret) {
    logger.error('Protected socket endpoints are enabled in production without internal secret')
    return false
  }

  const providedSecret = extractInternalRequestSecret(req)
  return !!providedSecret && providedSecret === socketInternalSecret
}
