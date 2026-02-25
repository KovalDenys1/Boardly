// CRITICAL: Load environment variables FIRST using require (not import)
// This ensures dotenv.config() runs BEFORE any module imports
const dotenv = require('dotenv')
const { resolve } = require('path')

// Load .env.local first (local development overrides), then .env
dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true })
dotenv.config({ path: resolve(process.cwd(), '.env') })

// Now import modules that use environment variables
import { createServer, IncomingMessage } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { prisma } from './lib/db'
import { socketLogger, logger } from './lib/logger'
import { validateEnv, printEnvInfo } from './lib/env'
import { socketMonitor } from './lib/socket-monitoring'
import { dbMonitor } from './lib/db-monitoring'
import { registerSocketHttpEndpoints } from './lib/socket/http-endpoints'
import { createSocketAuthMiddleware } from './lib/socket/auth-middleware'
import { createOnlinePresence } from './lib/socket/online-presence'
import { createSocketRateLimiter } from './lib/socket/socket-rate-limit'
import { createDisconnectSyncManager } from './lib/socket/disconnect-sync'
import { createJoinLobbyHandler } from './lib/socket/handlers/join-lobby'
import { createGameActionHandler } from './lib/socket/handlers/game-action'
import { createSendChatMessageHandler } from './lib/socket/handlers/send-chat-message'
import { createPlayerTypingHandler } from './lib/socket/handlers/player-typing'
import { createConnectionLifecycleHandlers } from './lib/socket/handlers/connection-lifecycle'
import { createLeaveLobbyHandler } from './lib/socket/handlers/leave-lobby'
import { createLobbyListMembershipHandlers } from './lib/socket/handlers/lobby-list-membership'
import { createLobbyCreatedHandler } from './lib/socket/handlers/lobby-created'
import { createForbiddenClientEventsHandlers } from './lib/socket/handlers/forbidden-client-events'
import { createSocketErrorHandler } from './lib/socket/handlers/socket-error'
import { EmitsToSelf } from './lib/socket/handlers/types'
import {
  SocketEvents,
  GameActionPayload,
  ServerErrorPayload,
  SocketRooms
} from './types/socket-events'

// Validate environment variables on startup
validateEnv()
printEnvInfo()

const port = Number(process.env.PORT) || 3001
const hostname = process.env.HOSTNAME || '0.0.0.0'

// Event sequence counter for ordering and deduplication (must be declared before server creation)
let eventSequence = 0

const server = createServer()

// Parse allowed origins from env into an array. Use ['*'] as fallback
// but handle '*' safely by echoing the request origin when credentials are used.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : ['*']

const corsOptions = {
  // Use a function to validate/echo origin. This avoids sending '*' with
  // Access-Control-Allow-Credentials (which browsers forbid).
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow server-side requests or non-browser tools with no origin
    if (!origin) return callback(null, true)

    try {
      // If wildcard is present allow and echo the requesting origin
      if (allowedOrigins.includes('*')) return callback(null, true)

      // Exact match allowed
      if (allowedOrigins.includes(origin)) return callback(null, true)

      // Also allow origin variants (some platforms include port or trailing slash)
      try {
        const parsed = new URL(origin).origin
        if (allowedOrigins.includes(parsed)) return callback(null, true)
      } catch (e) {
        // ignore parse error
      }

      socketLogger('cors').warn('Blocked socket origin by CORS', { origin, allowedOrigins })
      return callback(new Error('Not allowed by CORS'))
    } catch (err) {
      return callback(err as Error)
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
}

const io = new SocketIOServer(server, {
  cors: corsOptions,
  // Optimized for Render free tier (handles cold starts)
  pingTimeout: 120000, // 2 minutes - wait time for client response
  pingInterval: 30000, // 30 seconds - ping message interval
  connectTimeout: 120000, // 2 minutes - timeout for first connection (cold start)
  transports: ['polling', 'websocket'], // Polling is more reliable during cold starts
  allowUpgrades: true, // Allow upgrade from polling to websocket after connection
  upgradeTimeout: 30000, // 30 seconds for upgrade
  maxHttpBufferSize: 1e6, // 1MB - sufficient for game data
  allowEIO3: true, // Support older clients
})

const onlinePresence = createOnlinePresence(io, logger)

// Helper to create event with metadata
type RoomEmitter = {
  to: (room: string) => {
    emit: (event: string, payload?: unknown) => void
  }
}

type DirectEmitter = {
  emit: (event: string, payload?: unknown) => void
}

function emitWithMetadata(
  target: RoomEmitter | DirectEmitter,
  room: string,
  event: string,
  data: unknown
) {
  const metadataCarrier =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const payload = {
    ...metadataCarrier,
    sequenceId: ++eventSequence,
    timestamp: Date.now(),
    version: '1.0.0'
  }
  if ('to' in target) {
    target.to(room).emit(event, payload)
  } else {
    target.emit(event, payload)
  }
  return payload
}

// Helper function to emit structured errors
function emitError(
  socket: EmitsToSelf,
  code: string,
  message: string,
  translationKey?: string,
  details?: Record<string, unknown>
) {
  const error: ServerErrorPayload = {
    code,
    message,
    translationKey,
    details,
    stack: process.env.NODE_ENV === 'development' ? new Error().stack : undefined
  }
  socket.emit(SocketEvents.SERVER_ERROR, error)
  logger.warn('Socket error emitted', { code, message, socketId: socket.id })
}

// Rate limiting for socket events
const socketRateLimiter = createSocketRateLimiter({
  maxEventsPerSecond: 10,
  staleThresholdMs: 60000,
})
const RATE_LIMIT_CLEANUP_INTERVAL = 60000 // Clean up every 60 seconds

function checkRateLimit(socketId: string): boolean {
  return socketRateLimiter.checkRateLimit(socketId)
}

const LOBBY_ROOM_PREFIX = SocketRooms.lobby('')
const SPECTATOR_ROOM_SUFFIX = ':spectators'
const SOCKET_INTERNAL_AUTH_HEADER = 'x-socket-internal-secret'
const SOCKET_INTERNAL_AUTH_BEARER_PREFIX = 'Bearer '

const SOCKET_INTERNAL_SECRET =
  process.env.SOCKET_SERVER_INTERNAL_SECRET ||
  process.env.SOCKET_INTERNAL_SECRET

if (process.env.NODE_ENV === 'production' && !SOCKET_INTERNAL_SECRET) {
  throw new Error('SOCKET_SERVER_INTERNAL_SECRET is required in production for internal socket endpoints')
}

function getLobbyCodesFromRooms(rooms: Iterable<string>): string[] {
  const lobbyCodes: string[] = []
  for (const room of rooms) {
    if (!room.startsWith(LOBBY_ROOM_PREFIX)) continue
    if (room.endsWith(SPECTATOR_ROOM_SUFFIX)) continue
    const lobbyCode = room.slice(LOBBY_ROOM_PREFIX.length)
    if (lobbyCode) {
      lobbyCodes.push(lobbyCode)
    }
  }
  return lobbyCodes
}

function getSpectatorLobbyCodesFromRooms(rooms: Iterable<string>): string[] {
  const lobbyCodes: string[] = []
  for (const room of rooms) {
    if (!room.startsWith(LOBBY_ROOM_PREFIX)) continue
    if (!room.endsWith(SPECTATOR_ROOM_SUFFIX)) continue
    const lobbyCode = room
      .slice(LOBBY_ROOM_PREFIX.length)
      .replace(new RegExp(`${SPECTATOR_ROOM_SUFFIX}$`), '')
      .trim()
    if (lobbyCode) {
      lobbyCodes.push(lobbyCode)
    }
  }
  return lobbyCodes
}

function hasAnotherActiveSocketForUserInLobby(
  userId: string,
  excludingSocketId: string,
  lobbyCode: string
): boolean {
  const lobbyRoom = SocketRooms.lobby(lobbyCode)
  for (const [socketId, activeSocket] of io.sockets.sockets.entries()) {
    if (socketId === excludingSocketId) continue
    if (!activeSocket.connected) continue
    if (activeSocket.data?.user?.id !== userId) continue
    if (!activeSocket.rooms.has(lobbyRoom)) continue
    return true
  }
  return false
}

function hasAnyActiveSocketForUserInLobby(userId: string, lobbyCode: string): boolean {
  const lobbyRoom = SocketRooms.lobby(lobbyCode)
  for (const activeSocket of io.sockets.sockets.values()) {
    if (!activeSocket.connected) continue
    if (activeSocket.data?.user?.id !== userId) continue
    if (!activeSocket.rooms.has(lobbyRoom)) continue
    return true
  }
  return false
}

const disconnectSyncManager = createDisconnectSyncManager({
  io,
  prisma,
  logger,
  emitWithMetadata: (room, event, data) => {
    emitWithMetadata(io, room, event, data)
  },
  hasAnyActiveSocketForUserInLobby,
  disconnectGraceMs: Math.max(0, Number(process.env.SOCKET_DISCONNECT_GRACE_MS || 8000)),
})

function getUserDisplayName(user: { username?: string | null; email?: string | null } | undefined): string {
  return user?.username || user?.email || 'Player'
}

type AuthorizedLobbySocket = {
  data: {
    authorizedLobbies?: Set<string>
    authorizedSpectatorLobbies?: Set<string>
  }
}

type LobbyAuthorizationSocket = AuthorizedLobbySocket & {
  rooms: Set<string>
}

type SpectatorMembershipSocket = AuthorizedLobbySocket & {
  id: string
  data: {
    user?: {
      id?: string
      username?: string | null
      email?: string | null
      isGuest?: boolean
    }
    authorizedLobbies?: Set<string>
    authorizedSpectatorLobbies?: Set<string>
  }
  join: (room: string) => void
  leave: (room: string) => void
  emit: (event: string, payload?: unknown) => void
}

function getAuthorizedLobbySet(socket: AuthorizedLobbySocket): Set<string> {
  if (!(socket.data.authorizedLobbies instanceof Set)) {
    socket.data.authorizedLobbies = new Set<string>()
  }
  return socket.data.authorizedLobbies as Set<string>
}

function markSocketLobbyAuthorized(socket: AuthorizedLobbySocket, lobbyCode: string) {
  const authorizedLobbies = getAuthorizedLobbySet(socket)
  authorizedLobbies.add(lobbyCode)
}

function revokeSocketLobbyAuthorization(socket: AuthorizedLobbySocket, lobbyCode: string) {
  const authorizedLobbies = getAuthorizedLobbySet(socket)
  authorizedLobbies.delete(lobbyCode)
}

function getAuthorizedSpectatorLobbySet(socket: AuthorizedLobbySocket): Set<string> {
  if (!(socket.data.authorizedSpectatorLobbies instanceof Set)) {
    socket.data.authorizedSpectatorLobbies = new Set<string>()
  }
  return socket.data.authorizedSpectatorLobbies as Set<string>
}

function markSocketSpectatorLobbyAuthorized(socket: AuthorizedLobbySocket, lobbyCode: string) {
  const authorizedLobbies = getAuthorizedSpectatorLobbySet(socket)
  authorizedLobbies.add(lobbyCode)
}

function revokeSocketSpectatorLobbyAuthorization(socket: AuthorizedLobbySocket, lobbyCode: string) {
  const authorizedLobbies = getAuthorizedSpectatorLobbySet(socket)
  authorizedLobbies.delete(lobbyCode)
}

function isSocketAuthorizedForLobby(socket: LobbyAuthorizationSocket, lobbyCode: string): boolean {
  const authorizedLobbies = getAuthorizedLobbySet(socket)
  return authorizedLobbies.has(lobbyCode) && socket.rooms.has(SocketRooms.lobby(lobbyCode))
}

function isSocketAuthorizedForSpectatorLobby(socket: LobbyAuthorizationSocket, lobbyCode: string): boolean {
  const authorizedSpectatorLobbies = getAuthorizedSpectatorLobbySet(socket)
  return (
    authorizedSpectatorLobbies.has(lobbyCode) &&
    socket.rooms.has(SocketRooms.spectators(lobbyCode))
  )
}

async function isUserActivePlayerInLobby(lobbyCode: string, userId: string): Promise<boolean> {
  const player = await prisma.players.findFirst({
    where: {
      userId,
      game: {
        status: {
          in: ['waiting', 'playing'],
        },
        lobby: {
          code: lobbyCode,
        },
      },
    },
    select: { id: true },
  })

  return !!player
}

function hasAnotherActiveSocketForUserInSpectatorLobby(
  userId: string,
  excludingSocketId: string,
  lobbyCode: string
): boolean {
  const spectatorRoom = SocketRooms.spectators(lobbyCode)
  for (const [socketId, activeSocket] of io.sockets.sockets.entries()) {
    if (socketId === excludingSocketId) continue
    if (!activeSocket.connected) continue
    if (activeSocket.data?.user?.id !== userId) continue
    if (!activeSocket.rooms.has(spectatorRoom)) continue
    return true
  }
  return false
}

const spectatorMembersByLobby = new Map<string, Map<string, string>>()

async function syncLobbySpectatorCount(lobbyCode: string) {
  const count = spectatorMembersByLobby.get(lobbyCode)?.size ?? 0
  try {
    await prisma.lobbies.updateMany({
      where: { code: lobbyCode },
      data: { spectatorCount: count },
    })
  } catch (error) {
    logger.error('Failed to sync lobby spectator count', error as Error, { lobbyCode, count })
  }
}

function getSpectatorSnapshot(lobbyCode: string) {
  const members = spectatorMembersByLobby.get(lobbyCode)
  if (!members) {
    return { count: 0, spectators: [] as Array<{ userId: string; username: string }> }
  }
  const spectators = Array.from(members.entries()).map(([userId, username]) => ({ userId, username }))
  return { count: spectators.length, spectators }
}

async function handleSpectatorJoin(socket: SpectatorMembershipSocket, lobbyCode: string) {
  socketMonitor.trackEvent('join-spectators')
  try {
    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    const normalizedLobbyCode = typeof lobbyCode === 'string' ? lobbyCode.trim() : ''
    if (!normalizedLobbyCode || normalizedLobbyCode.length > 20) {
      emitError(socket, 'INVALID_LOBBY_CODE', 'Invalid lobby code', 'errors.invalidLobbyCode')
      return
    }

    const lobby = await prisma.lobbies.findUnique({
      where: { code: normalizedLobbyCode },
      select: {
        id: true,
        code: true,
        isActive: true,
        allowSpectators: true,
        maxSpectators: true,
      },
    })

    if (!lobby) {
      emitError(socket, 'LOBBY_NOT_FOUND', 'Lobby not found', 'errors.lobbyNotFound')
      return
    }

    if (!lobby.allowSpectators) {
      emitError(socket, 'SPECTATORS_DISABLED', 'Spectator mode disabled for this lobby')
      return
    }

    const userId = socket.data?.user?.id
    const username = getUserDisplayName(socket.data?.user)
    if (!userId) {
      emitError(socket, 'UNAUTHORIZED', 'Unauthorized')
      return
    }

    const members = spectatorMembersByLobby.get(normalizedLobbyCode) ?? new Map<string, string>()
    const alreadyPresent = members.has(userId)
    if (!alreadyPresent && members.size >= Math.max(1, lobby.maxSpectators || 10)) {
      emitError(socket, 'SPECTATOR_LIMIT_REACHED', 'Spectator limit reached')
      return
    }

    members.set(userId, username)
    spectatorMembersByLobby.set(normalizedLobbyCode, members)

    socket.join(SocketRooms.spectators(normalizedLobbyCode))
    markSocketSpectatorLobbyAuthorized(socket, normalizedLobbyCode)

    await syncLobbySpectatorCount(normalizedLobbyCode)
    io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)

    const snapshot = getSpectatorSnapshot(normalizedLobbyCode)
    socket.emit(SocketEvents.JOINED_SPECTATORS, {
      lobbyCode: normalizedLobbyCode,
      success: true,
      count: snapshot.count,
      spectators: snapshot.spectators,
    })

    emitWithMetadata(io, SocketRooms.spectators(normalizedLobbyCode), SocketEvents.SPECTATOR_JOINED, {
      lobbyCode: normalizedLobbyCode,
      userId,
      username,
      count: snapshot.count,
    })
  } catch (error) {
    logger.error('Error joining spectator room', error as Error, { lobbyCode })
    emitError(socket, 'JOIN_SPECTATORS_ERROR', 'Failed to join spectator room')
  }
}

async function removeSpectatorFromLobby(socket: SpectatorMembershipSocket, lobbyCode: string, reason: string) {
  const normalizedLobbyCode = typeof lobbyCode === 'string' ? lobbyCode.trim() : ''
  if (!normalizedLobbyCode) return

  socket.leave(SocketRooms.spectators(normalizedLobbyCode))
  revokeSocketSpectatorLobbyAuthorization(socket, normalizedLobbyCode)

  const userId = socket.data?.user?.id
  if (!userId) return
  if (hasAnotherActiveSocketForUserInSpectatorLobby(userId, socket.id, normalizedLobbyCode)) {
    return
  }

  const members = spectatorMembersByLobby.get(normalizedLobbyCode)
  if (!members) return

  const removed = members.delete(userId)
  if (!removed) return
  if (members.size === 0) {
    spectatorMembersByLobby.delete(normalizedLobbyCode)
  }

  await syncLobbySpectatorCount(normalizedLobbyCode)
  io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
  const snapshot = getSpectatorSnapshot(normalizedLobbyCode)
  emitWithMetadata(io, SocketRooms.spectators(normalizedLobbyCode), SocketEvents.SPECTATOR_LEFT, {
    lobbyCode: normalizedLobbyCode,
    userId,
    count: snapshot.count,
    reason,
  })
}

async function handleSpectatorChatMessage(
  socket: SpectatorMembershipSocket & { rooms: Set<string> },
  data: { lobbyCode?: string; message?: string }
) {
  socketMonitor.trackEvent('send-spectator-chat-message')

  if (!checkRateLimit(socket.id)) {
    emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
    return
  }

  const lobbyCode = typeof data?.lobbyCode === 'string' ? data.lobbyCode.trim() : ''
  const message = typeof data?.message === 'string' ? data.message.trim() : ''

  if (!lobbyCode || lobbyCode.length > 20) {
    emitError(socket, 'INVALID_LOBBY_CODE', 'Invalid lobby code', 'errors.invalidLobbyCode')
    return
  }

  if (!isSocketAuthorizedForSpectatorLobby(socket as LobbyAuthorizationSocket, lobbyCode)) {
    emitError(socket, 'SPECTATOR_ACCESS_DENIED', 'You are not joined as a spectator')
    return
  }

  if (!message || message.length > 500) {
    emitError(socket, 'INVALID_CHAT_MESSAGE', 'Invalid spectator chat message')
    return
  }

  const userId = socket.data.user?.id
  if (!userId) {
    emitError(socket, 'UNAUTHORIZED', 'Unauthorized')
    return
  }

  const username = getUserDisplayName(socket.data.user)
  emitWithMetadata(io, SocketRooms.spectators(lobbyCode), SocketEvents.SPECTATOR_CHAT_MESSAGE, {
    id: `spectator-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lobbyCode,
    userId,
    username,
    message,
    type: 'user',
  })
}

function extractHeaderValue(header: string | string[] | undefined): string | null {
  if (typeof header === 'string') {
    return header.trim() || null
  }
  if (Array.isArray(header) && header.length > 0) {
    const first = header[0]
    return typeof first === 'string' ? first.trim() || null : null
  }
  return null
}

function extractInternalRequestSecret(req: IncomingMessage): string | null {
  const secretHeader = extractHeaderValue(req.headers?.[SOCKET_INTERNAL_AUTH_HEADER])
  if (secretHeader) {
    return secretHeader
  }

  const authorizationHeader = extractHeaderValue(req.headers?.authorization)

  if (
    typeof authorizationHeader === 'string' &&
    authorizationHeader.startsWith(SOCKET_INTERNAL_AUTH_BEARER_PREFIX)
  ) {
    return authorizationHeader.slice(SOCKET_INTERNAL_AUTH_BEARER_PREFIX.length).trim() || null
  }

  return null
}

function isInternalEndpointAuthorized(req: IncomingMessage): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  if (!SOCKET_INTERNAL_SECRET) {
    logger.error('Protected socket endpoints are enabled in production without internal secret')
    return false
  }

  const providedSecret = extractInternalRequestSecret(req)
  return !!providedSecret && providedSecret === SOCKET_INTERNAL_SECRET
}

// Clean up expired rate limit entries to prevent memory leaks
setInterval(() => {
  const { cleaned, remaining } = socketRateLimiter.cleanupStaleLimits()
  if (cleaned > 0) {
    logger.debug('Rate limit cleanup', { cleaned, remaining })
  }
}, RATE_LIMIT_CLEANUP_INTERVAL)

// Authentication middleware
io.use(
  createSocketAuthMiddleware({
    logger,
    prisma,
  })
)

const handleJoinLobby = createJoinLobbyHandler({
  logger,
  socketLogger,
  findLobbyByCode: (lobbyCode) => {
    return prisma.lobbies.findUnique({
      where: { code: lobbyCode },
      select: {
        id: true,
        code: true,
        isActive: true,
      },
    })
  },
  socketMonitor,
  checkRateLimit,
  emitError,
  isUserActivePlayerInLobby,
  markSocketLobbyAuthorized,
  disconnectSyncManager,
})

const handleGameAction = createGameActionHandler({
  logger,
  socketMonitor,
  checkRateLimit,
  emitError,
  isSocketAuthorizedForLobby,
  isUserActivePlayerInLobby,
  emitGameUpdateToOthers: (socket, lobbyCode, payload) => {
    emitWithMetadata(
      socket.to(SocketRooms.lobby(lobbyCode)),
      SocketRooms.lobby(lobbyCode),
      SocketEvents.GAME_UPDATE,
      payload
    )
  },
  notifyLobbyListUpdate: () => {
    io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
  },
})

const handleSendChatMessage = createSendChatMessageHandler({
  logger,
  socketMonitor,
  checkRateLimit,
  emitError,
  isSocketAuthorizedForLobby,
  isUserActivePlayerInLobby,
  getUserDisplayName,
  emitWithMetadata: (room, event, data) => {
    emitWithMetadata(io, room, event, data)
  },
})

const handlePlayerTyping = createPlayerTypingHandler({
  socketMonitor,
  checkRateLimit,
  isSocketAuthorizedForLobby,
  getUserDisplayName,
})

const { handleDisconnecting, handleDisconnect } = createConnectionLifecycleHandlers({
  logger,
  socketMonitor,
  onlinePresence,
  clearSocketRateLimit: (socketId) => {
    socketRateLimiter.clearSocket(socketId)
  },
  hasAnotherActiveSocketForUserInLobby,
  getLobbyCodesFromRooms,
  disconnectSyncManager,
})

const handleLeaveLobby = createLeaveLobbyHandler({
  socketMonitor,
  socketLogger,
  revokeSocketLobbyAuthorization,
  disconnectSyncManager,
})

const { handleJoinLobbyList, handleLeaveLobbyList } = createLobbyListMembershipHandlers({
  socketMonitor,
  socketLogger,
})

const handleLobbyCreated = createLobbyCreatedHandler({
  socketMonitor,
  socketLogger,
  notifyLobbyListUpdate: () => {
    io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
  },
})

const { handleBlockedPlayerJoined, handleBlockedGameStarted } = createForbiddenClientEventsHandlers({
  logger,
  socketMonitor,
  emitError,
})

const handleSocketError = createSocketErrorHandler({
  logger,
})

// Keep-alive mechanism to prevent Render.com free tier from sleeping
// Ping self every 10 minutes (within the 15 min sleep window)
if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
  const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000 // 10 minutes
  setInterval(() => {
    const keepAliveHost = hostname === '0.0.0.0' ? '127.0.0.1' : hostname
    const url = `http://${keepAliveHost}:${port}/health`
    logger.info('Keep-alive ping to prevent sleep')
    fetch(url).catch(err => logger.error('Keep-alive ping failed', err))
  }, KEEP_ALIVE_INTERVAL)
}

io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id })

  // Track connection in monitor
  socketMonitor.onConnect(socket.id)

  // Mark user as online if authenticated
  const userId = socket.data.user?.id
  if (userId && !socket.data.user?.isGuest) {
    onlinePresence.markUserOnline(userId, socket.id)
  }

  // Send online users list to newly connected user
  socket.emit(SocketEvents.ONLINE_USERS, { userIds: onlinePresence.getOnlineUserIds() })

  socket.on(SocketEvents.JOIN_LOBBY, async (lobbyCode: string) => {
    await handleJoinLobby(socket, lobbyCode)
  })

  socket.on(SocketEvents.LEAVE_LOBBY, (lobbyCode: string) => {
    handleLeaveLobby(socket, lobbyCode)
  })

  socket.on(SocketEvents.JOIN_SPECTATORS, async (lobbyCode: string) => {
    await handleSpectatorJoin(socket, lobbyCode)
  })

  socket.on(SocketEvents.LEAVE_SPECTATORS, async (lobbyCode: string) => {
    await removeSpectatorFromLobby(socket, lobbyCode, 'left-spectators-explicitly')
  })

  socket.on(SocketEvents.JOIN_LOBBY_LIST, () => {
    handleJoinLobbyList(socket)
  })

  socket.on(SocketEvents.LEAVE_LOBBY_LIST, () => {
    handleLeaveLobbyList(socket)
  })

  socket.on(SocketEvents.GAME_ACTION, async (data: GameActionPayload) => {
    await handleGameAction(socket, data)
  })

  socket.on(SocketEvents.LOBBY_CREATED, () => {
    handleLobbyCreated()
  })

  // Player and game lifecycle broadcasts must come from trusted server routes only (/api/notify).
  socket.on(SocketEvents.PLAYER_JOINED, () => {
    handleBlockedPlayerJoined(socket)
  })

  socket.on(SocketEvents.GAME_STARTED, () => {
    handleBlockedGameStarted(socket)
  })

  socket.on(
    SocketEvents.SEND_CHAT_MESSAGE,
    async (data: { lobbyCode: string; message: string; userId: string; username: string }) => {
      await handleSendChatMessage(socket, data)
    }
  )

  socket.on(
    SocketEvents.SEND_SPECTATOR_CHAT_MESSAGE,
    async (data: { lobbyCode?: string; message?: string }) => {
      await handleSpectatorChatMessage(socket as SpectatorMembershipSocket & { rooms: Set<string> }, data)
    }
  )

  socket.on(SocketEvents.PLAYER_TYPING, (data: { lobbyCode: string; userId: string; username: string }) => {
    handlePlayerTyping(socket, data)
  })

  socket.on('disconnecting', () => {
    const spectatorLobbyCodes = getSpectatorLobbyCodesFromRooms(socket.rooms)
    if (spectatorLobbyCodes.length > 0) {
      void Promise.all(
        spectatorLobbyCodes.map((lobbyCode) =>
          removeSpectatorFromLobby(socket, lobbyCode, 'socket-disconnecting')
        )
      )
    }
    handleDisconnecting(socket)
  })

  socket.on('disconnect', (reason) => {
    handleDisconnect(socket, reason)
  })

  socket.on('error', (error) => {
    handleSocketError(socket, error as Error)
  })
})

// Initialize monitoring
socketMonitor.initialize(io, 30000) // Log metrics every 30 seconds
dbMonitor.initialize(60000) // Log DB metrics every 60 seconds

registerSocketHttpEndpoints({
  server,
  io,
  logger,
  socketMonitor,
  dbMonitor,
  isInternalEndpointAuthorized,
  getNextSequenceId: () => ++eventSequence,
})

server.listen(port, hostname, () => {
  const displayUrl = hostname === '0.0.0.0' ? 'localhost' : hostname
  logger.info(`Socket.IO server ready`, { url: `http://${displayUrl}:${port}` })
})

// Graceful shutdown handler
let isShuttingDown = false

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    logger.warn('Force shutdown - already shutting down')
    process.exit(1)
  }

  isShuttingDown = true
  logger.info(`${signal} received - starting graceful shutdown`)

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed')
  })

  // Close all socket connections
  io.close(() => {
    logger.info('Socket.IO connections closed')
  })

  // Disconnect Prisma
  try {
    await prisma.$disconnect()
    logger.info('Prisma disconnected')
  } catch (error) {
    logger.error('Error disconnecting Prisma', error as Error)
  }

  // Give connections 10 seconds to close gracefully
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout')
    process.exit(0)
  }, 10000)
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception - server will continue running', error)
  // Don't exit - log and continue (unless it's critical)
  if (error.message.includes('EADDRINUSE')) {
    logger.error('Port already in use - exiting')
    process.exit(1)
  }
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  const err = reason instanceof Error ? reason : new Error(String(reason))
  logger.error('Unhandled Promise Rejection - server will continue running', err, {
    promise: String(promise)
  })
  // Don't exit - log and continue
})

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle process warnings
process.on('warning', (warning) => {
  logger.warn('Process warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  })
})
