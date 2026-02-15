// CRITICAL: Load environment variables FIRST using require (not import)
// This ensures dotenv.config() runs BEFORE any module imports
const dotenv = require('dotenv')
const { resolve } = require('path')

// Load .env.local first (local development overrides), then .env
dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true })
dotenv.config({ path: resolve(process.cwd(), '.env') })

// Now import modules that use environment variables
import { createServer } from 'http'
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
import {
  emitError as emitSocketError,
  emitWithMetadata,
  isInternalEndpointAuthorized,
  isSocketAuthorizedForLobby,
  markSocketLobbyAuthorized,
  revokeSocketLobbyAuthorization,
} from './lib/socket/socket-server-helpers'
import {
  SocketEvents,
  GameActionPayload,
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
    const lobbyCode = room.slice(LOBBY_ROOM_PREFIX.length)
    if (lobbyCode) {
      lobbyCodes.push(lobbyCode)
    }
  }
  return lobbyCodes
}

function hasAnotherActiveSocketForUser(userId: string, excludingSocketId: string): boolean {
  for (const [socketId, activeSocket] of io.sockets.sockets.entries()) {
    if (socketId === excludingSocketId) continue
    if (!activeSocket.connected) continue
    if (activeSocket.data?.user?.id === userId) {
      return true
    }
  }
  return false
}

function hasAnyActiveSocketForUser(userId: string): boolean {
  for (const activeSocket of io.sockets.sockets.values()) {
    if (!activeSocket.connected) continue
    if (activeSocket.data?.user?.id === userId) {
      return true
    }
  }
  return false
}

const disconnectSyncManager = createDisconnectSyncManager({
  io,
  prisma,
  logger,
  emitWithMetadata: (room, event, data) => {
    emitWithMetadata(io.to(room), event, data, () => ++eventSequence)
  },
  hasAnyActiveSocketForUser,
  disconnectGraceMs: Math.max(0, Number(process.env.SOCKET_DISCONNECT_GRACE_MS || 8000)),
})

function emitError(
  socket: Parameters<typeof emitSocketError>[0],
  code: string,
  message: string,
  translationKey?: string,
  details?: unknown
): void {
  emitSocketError(socket, logger, code, message, translationKey, details)
}

function getUserDisplayName(user: { username?: string | null; email?: string | null } | undefined): string {
  return user?.username || user?.email || 'Player'
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
  prisma,
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
      SocketEvents.GAME_UPDATE,
      payload,
      () => ++eventSequence
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
    emitWithMetadata(io.to(room), event, data, () => ++eventSequence)
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
  hasAnotherActiveSocketForUser,
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
    socketMonitor.trackEvent('lobby-created')
    socketLogger('lobby-created').info('New lobby created, notifying lobby list')
    io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
  })

  // Player and game lifecycle broadcasts must come from trusted server routes only (/api/notify).
  socket.on(SocketEvents.PLAYER_JOINED, () => {
    socketMonitor.trackEvent('blocked-player-joined')
    logger.warn('Blocked client-side player-joined event', {
      socketId: socket.id,
      userId: socket.data.user?.id,
    })
    emitError(socket, 'FORBIDDEN_ACTION', 'Use server API to broadcast player events', 'errors.forbidden')
  })

  socket.on(SocketEvents.GAME_STARTED, () => {
    socketMonitor.trackEvent('blocked-game-started')
    logger.warn('Blocked client-side game-started event', {
      socketId: socket.id,
      userId: socket.data.user?.id,
    })
    emitError(socket, 'FORBIDDEN_ACTION', 'Use server API to broadcast game events', 'errors.forbidden')
  })

  socket.on(
    SocketEvents.SEND_CHAT_MESSAGE,
    async (data: { lobbyCode: string; message: string; userId: string; username: string }) => {
      await handleSendChatMessage(socket, data)
    }
  )

  socket.on(SocketEvents.PLAYER_TYPING, (data: { lobbyCode: string; userId: string; username: string }) => {
    handlePlayerTyping(socket, data)
  })

  socket.on('disconnecting', () => {
    handleDisconnecting(socket)
  })

  socket.on('disconnect', (reason) => {
    handleDisconnect(socket, reason)
  })

  socket.on('error', (error) => {
    logger.error('Socket error', error, { socketId: socket.id })
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
  isInternalEndpointAuthorized: (req) =>
    isInternalEndpointAuthorized(req, logger, process.env.NODE_ENV, SOCKET_INTERNAL_SECRET),
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
