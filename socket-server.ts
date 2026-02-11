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
import { parse } from 'url'
import jwt from 'jsonwebtoken'
import { prisma } from './lib/db'
import { socketLogger, logger } from './lib/logger'
import { validateEnv, printEnvInfo } from './lib/env'
import { socketMonitor } from './lib/socket-monitoring'
import { dbMonitor } from './lib/db-monitoring'
import { verifyGuestToken } from './lib/guest-auth'
import {
  advanceTurnPastDisconnectedPlayers,
  setPlayerConnectionInState,
  TurnState,
} from './lib/disconnected-turn'
import {
  SocketEvents,
  GameActionPayload,
  GameStartedPayload,
  ServerErrorPayload,
  createEventPayload,
  SocketRooms
} from './types/socket-events'

// Validate environment variables on startup
validateEnv()
printEnvInfo()

const port = Number(process.env.PORT) || 3001
const hostname = process.env.HOSTNAME || '0.0.0.0'

// Event sequence counter for ordering and deduplication (must be declared before server creation)
let eventSequence = 0

const server = createServer((req, res) => {
  // Note: /api/notify endpoint is handled in server.on('request') after io initialization
  // This handler is just for basic health checks

  const url = parse(req.url || '/')

  // Minimal root response for sanity checks
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end('Socket.IO server is running')
})

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

// Online users tracking: userId -> Set of socketIds
const onlineUsers = new Map<string, Set<string>>()

// Helper to create event with metadata
function emitWithMetadata(io: SocketIOServer, room: string, event: string, data: any) {
  const payload = {
    ...data,
    sequenceId: ++eventSequence,
    timestamp: Date.now(),
    version: '1.0.0'
  }
  io.to(room).emit(event, payload)
  return payload
}

// Helper function to emit structured errors
function emitError(socket: any, code: string, message: string, translationKey?: string, details?: any) {
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

// Helper functions for online status
function markUserOnline(userId: string, socketId: string) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set())
  }
  onlineUsers.get(userId)!.add(socketId)

  // Broadcast to friends that user is online
  io.emit(SocketEvents.USER_ONLINE, { userId })
  logger.info('User marked online', { userId, socketId, totalOnline: onlineUsers.size })
}

function markUserOffline(userId: string, socketId: string) {
  const userSockets = onlineUsers.get(userId)
  if (userSockets) {
    userSockets.delete(socketId)

    // If no more sockets for this user, remove from online list
    if (userSockets.size === 0) {
      onlineUsers.delete(userId)

      // Broadcast to friends that user is offline
      io.emit(SocketEvents.USER_OFFLINE, { userId })
      logger.info('User marked offline', { userId, socketId, totalOnline: onlineUsers.size })
    }
  }
}

function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys())
}

function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId)
}

// Rate limiting for socket events
const socketRateLimits = new Map<string, { count: number; resetTime: number }>()
const MAX_EVENTS_PER_SECOND = 10
const RATE_LIMIT_CLEANUP_INTERVAL = 60000 // Clean up every 60 seconds

// Deduplicate identical state-change notifications to prevent duplicate UI processing
// during reconnect/cold-start bursts.
const stateChangeNotifyDebounce = new Map<string, number>()
const STATE_CHANGE_NOTIFY_DEBOUNCE_MS = 1500
const STATE_CHANGE_NOTIFY_TTL_MS = 30000

function checkRateLimit(socketId: string): boolean {
  const now = Date.now()
  const limit = socketRateLimits.get(socketId)

  if (!limit || now > limit.resetTime) {
    socketRateLimits.set(socketId, { count: 1, resetTime: now + 1000 })
    return true
  }

  if (limit.count >= MAX_EVENTS_PER_SECOND) {
    return false
  }

  limit.count++
  return true
}

function buildStateChangeNotifyKey(room: string, event: string, data: any): string | null {
  if (event !== SocketEvents.GAME_UPDATE || data?.action !== 'state-change') {
    return null
  }

  const payload = data?.payload
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const currentPlayerIndex =
    typeof payload.currentPlayerIndex === 'number' ? payload.currentPlayerIndex : 'na'
  const lastMoveAt = typeof payload.lastMoveAt === 'number' ? payload.lastMoveAt : 'na'
  const rollsLeft = typeof payload?.data?.rollsLeft === 'number' ? payload.data.rollsLeft : 'na'
  const updatedAt = payload.updatedAt ? String(payload.updatedAt) : 'na'

  return `${room}:${currentPlayerIndex}:${lastMoveAt}:${rollsLeft}:${updatedAt}`
}

function isDuplicateStateChangeNotify(key: string): boolean {
  const now = Date.now()
  const lastSeen = stateChangeNotifyDebounce.get(key)
  if (lastSeen && now - lastSeen < STATE_CHANGE_NOTIFY_DEBOUNCE_MS) {
    return true
  }

  stateChangeNotifyDebounce.set(key, now)

  for (const [storedKey, timestamp] of stateChangeNotifyDebounce.entries()) {
    if (now - timestamp > STATE_CHANGE_NOTIFY_TTL_MS) {
      stateChangeNotifyDebounce.delete(storedKey)
    }
  }

  return false
}

interface ActiveGamePlayerRecord {
  userId: string
  position: number
  user: {
    username: string | null
    email: string | null
    bot: unknown
  }
}

interface ActiveLobbyGameRecord {
  id: string
  state: string
  currentTurn: number
  updatedAt: Date
  players: ActiveGamePlayerRecord[]
}

interface ConnectionSyncResult {
  updated: boolean
  turnAdvanced: boolean
  skippedPlayerIds: string[]
  gameId?: string
  updatedState?: TurnState
}

const LOBBY_ROOM_PREFIX = SocketRooms.lobby('')
const CONNECTION_STATE_SYNC_MAX_RETRIES = 3

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

function getUserDisplayName(user: { username?: string | null; email?: string | null } | undefined): string {
  return user?.username || user?.email || 'Player'
}

async function loadActiveGameForLobby(lobbyCode: string): Promise<ActiveLobbyGameRecord | null> {
  return prisma.games.findFirst({
    where: {
      status: 'playing',
      lobby: {
        code: lobbyCode,
      },
    },
    select: {
      id: true,
      state: true,
      currentTurn: true,
      updatedAt: true,
      players: {
        orderBy: {
          position: 'asc',
        },
        select: {
          userId: true,
          position: true,
          user: {
            select: {
              username: true,
              email: true,
              bot: true,
            },
          },
        },
      },
    },
  })
}

async function syncPlayerConnectionStateInLobby(
  lobbyCode: string,
  userId: string,
  isActive: boolean,
  options: { advanceTurnIfCurrent: boolean }
): Promise<ConnectionSyncResult> {
  for (let attempt = 1; attempt <= CONNECTION_STATE_SYNC_MAX_RETRIES; attempt += 1) {
    const activeGame = await loadActiveGameForLobby(lobbyCode)
    if (!activeGame) {
      return { updated: false, turnAdvanced: false, skippedPlayerIds: [] }
    }

    let parsedState: TurnState
    try {
      parsedState = JSON.parse(activeGame.state) as TurnState
    } catch (error) {
      logger.warn('Failed to parse game state during connection sync', {
        lobbyCode,
        gameId: activeGame.id,
        userId,
      })
      return { updated: false, turnAdvanced: false, skippedPlayerIds: [] }
    }

    if (!Array.isArray(parsedState.players) || parsedState.players.length === 0) {
      return { updated: false, turnAdvanced: false, skippedPlayerIds: [] }
    }

    const now = Date.now()
    const connectionChanged = setPlayerConnectionInState(parsedState, userId, isActive, now)

    let turnAdvanced = false
    let skippedPlayerIds: string[] = []

    if (options.advanceTurnIfCurrent) {
      const botUserIds = new Set(
        activeGame.players
          .filter((player) => !!player.user.bot)
          .map((player) => player.userId)
      )
      const turnResult = advanceTurnPastDisconnectedPlayers(parsedState, botUserIds, now)
      turnAdvanced = turnResult.changed
      skippedPlayerIds = turnResult.skippedPlayerIds
    }

    if (!connectionChanged && !turnAdvanced) {
      return {
        updated: false,
        turnAdvanced: false,
        skippedPlayerIds: [],
        gameId: activeGame.id,
      }
    }

    const nextCurrentTurn =
      typeof parsedState.currentPlayerIndex === 'number' && Number.isFinite(parsedState.currentPlayerIndex)
        ? parsedState.currentPlayerIndex
        : activeGame.currentTurn

    const updateData: {
      state: string
      currentTurn: number
      updatedAt: Date
      lastMoveAt?: Date
    } = {
      state: JSON.stringify(parsedState),
      currentTurn: nextCurrentTurn,
      updatedAt: new Date(),
    }

    if (turnAdvanced) {
      updateData.lastMoveAt = new Date(now)
    }

    const updateResult = await prisma.games.updateMany({
      where: {
        id: activeGame.id,
        currentTurn: activeGame.currentTurn,
        updatedAt: activeGame.updatedAt,
      },
      data: updateData,
    })

    if (updateResult.count > 0) {
      return {
        updated: true,
        turnAdvanced,
        skippedPlayerIds,
        gameId: activeGame.id,
        updatedState: parsedState,
      }
    }

    logger.warn('Connection state sync conflict, retrying', {
      lobbyCode,
      gameId: activeGame.id,
      userId,
      attempt,
      isActive,
    })
  }

  return { updated: false, turnAdvanced: false, skippedPlayerIds: [] }
}

async function handleAbruptDisconnectForLobby(
  lobbyCode: string,
  user: { id: string; username?: string | null; email?: string | null }
) {
  const syncResult = await syncPlayerConnectionStateInLobby(lobbyCode, user.id, false, {
    advanceTurnIfCurrent: true,
  })

  if (!syncResult.updated || !syncResult.updatedState) {
    return
  }

  const playerName = getUserDisplayName(user)

  emitWithMetadata(io, SocketRooms.lobby(lobbyCode), SocketEvents.PLAYER_LEFT, {
    lobbyCode,
    userId: user.id,
    username: playerName,
    reason: 'error',
  })

  emitWithMetadata(io, SocketRooms.lobby(lobbyCode), SocketEvents.LOBBY_UPDATE, {
    lobbyCode,
    type: 'state-refresh',
    data: {
      userId: user.id,
      disconnected: true,
      reason: 'abrupt-disconnect',
    },
  })

  emitWithMetadata(io, SocketRooms.lobby(lobbyCode), SocketEvents.GAME_UPDATE, {
    action: 'state-change',
    payload: syncResult.updatedState,
    lobbyCode,
  })

  io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)

  logger.info('Applied disconnect state sync', {
    lobbyCode,
    gameId: syncResult.gameId,
    userId: user.id,
    turnAdvanced: syncResult.turnAdvanced,
    skippedPlayerIds: syncResult.skippedPlayerIds,
  })
}

// Clean up expired rate limit entries to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  let cleaned = 0
  for (const [socketId, limit] of socketRateLimits.entries()) {
    if (now > limit.resetTime + 60000) { // Clean entries older than 1 minute
      socketRateLimits.delete(socketId)
      cleaned++
    }
  }
  if (cleaned > 0) {
    logger.debug('Rate limit cleanup', { cleaned, remaining: socketRateLimits.size })
  }
}, RATE_LIMIT_CLEANUP_INTERVAL)

// Authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token
  const isGuest = socket.handshake.auth.isGuest === true || socket.handshake.query.isGuest === 'true'

  try {
    logger.info('Socket authentication attempt', {
      hasToken: !!token,
      tokenPreview: token ? String(token).substring(0, 20) + '...' : 'none',
      isGuest,
      authKeys: Object.keys(socket.handshake.auth),
      queryKeys: Object.keys(socket.handshake.query)
    })

    // Require signed guest JWTs to prevent header/token spoofing.
    if (isGuest) {
      if (!token || token === 'null' || token === 'undefined' || token === '') {
        logger.warn('Socket connection rejected: Missing guest token')
        return next(new Error('Guest authentication required'))
      }

      const guestClaims = verifyGuestToken(String(token))
      if (!guestClaims) {
        logger.warn('Socket connection rejected: Invalid guest token')
        return next(new Error('Invalid guest token'))
      }

      const guestUser = await prisma.users.findUnique({
        where: { id: guestClaims.guestId },
        select: {
          id: true,
          username: true,
          email: true,
          isGuest: true,
          bot: true,
        },
      })

      if (!guestUser || !guestUser.isGuest) {
        logger.warn('Socket connection rejected: Guest user not found', {
          guestId: guestClaims.guestId,
        })
        return next(new Error('Guest user not found'))
      }

      socket.data.user = {
        ...guestUser,
        username: guestUser.username || guestClaims.guestName,
        isGuest: true,
      }
      logger.info('Guest socket authenticated', {
        guestId: guestUser.id,
        guestName: guestUser.username || guestClaims.guestName,
      })
      return next()
    }

    if (!token || token === 'null' || token === 'undefined' || token === '') {
      logger.warn('Socket connection rejected: No valid token provided', {
        token: token,
        isGuest: isGuest,
        auth: socket.handshake.auth,
        query: socket.handshake.query,
        headers: {
          origin: socket.handshake.headers.origin,
          userAgent: socket.handshake.headers['user-agent']
        }
      })
      return next(new Error('Authentication required'))
    }

    // Try to verify as JWT first
    const secret = process.env.NEXTAUTH_SECRET
    let userId: string | null = null

    if (secret) {
      try {
        const decoded = jwt.verify(token, secret) as any
        userId = decoded.id || decoded.sub
        logger.info('JWT token verified successfully', { userId })
      } catch (jwtError) {
        // If JWT verification fails, treat token as userId directly
        // This handles the case where client sends userId instead of JWT
        logger.info('Token is not a JWT, treating as userId', {
          tokenPreview: String(token).substring(0, 20) + '...',
          tokenLength: String(token).length
        })
        userId = String(token)
      }
    } else {
      logger.warn('No NEXTAUTH_SECRET configured, treating token as userId')
      // No secret configured, treat token as userId
      userId = String(token)
    }

    if (!userId) {
      logger.warn('Socket connection rejected: Could not extract userId')
      return next(new Error('Invalid authentication'))
    }

    logger.info('Attempting to find user in database', { userId })

    // Verify user exists in database
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        bot: true  // Include bot relation instead of isBot
      }
    })

    if (!user) {
      logger.warn('Socket connection rejected: User not found in database', {
        userId,
        tokenPreview: String(token).substring(0, 20) + '...',
        isGuest: isGuest,
        tokenLength: String(token).length,
        tokenType: typeof token
      })
      return next(new Error('User not found'))
    }

    socket.data.user = user
    logger.info('Socket authenticated', { userId: user.id, username: user.username, isBot: !!user.bot })
    next()
  } catch (error) {
    const err = error as Error
    logger.error('Socket authentication error', err, {
      isGuest,
      hasToken: !!token,
      tokenType: token ? typeof token : 'undefined'
    })
    next(new Error('Authentication failed'))
  }
})

// Keep-alive mechanism to prevent Render.com free tier from sleeping
// Ping self every 10 minutes (within the 15 min sleep window)
if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
  const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000 // 10 minutes
  setInterval(() => {
    const url = `http://${hostname}:${port}/health`
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
    markUserOnline(userId, socket.id)
  }

  // Send online users list to newly connected user
  socket.emit(SocketEvents.ONLINE_USERS, { userIds: getOnlineUserIds() })

  socket.on(SocketEvents.JOIN_LOBBY, async (lobbyCode: string) => {
    // Rate limiting
    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    // Track event
    socketMonitor.trackEvent('join-lobby')

    // Basic validation
    if (!lobbyCode || typeof lobbyCode !== 'string' || lobbyCode.length > 20) {
      logger.warn('Invalid lobby code received', { lobbyCode, socketId: socket.id })
      emitError(socket, 'INVALID_LOBBY_CODE', 'Invalid lobby code', 'errors.invalidLobbyCode')
      return
    }

    try {
      // Verify lobby exists in database (optimized - only check existence)
      const lobby = await prisma.lobbies.findUnique({
        where: { code: lobbyCode },
        select: {
          id: true,
          code: true,
          isActive: true
        }
      })

      if (!lobby) {
        emitError(socket, 'LOBBY_NOT_FOUND', 'Lobby not found', 'errors.lobbyNotFound', { lobbyCode })
        return
      }

      // Always allow joining the room to receive updates
      // Access control will be handled at the action level
      socket.join(SocketRooms.lobby(lobbyCode))
      socketLogger('join-lobby').info('Socket joined lobby', {
        socketId: socket.id,
        lobbyCode,
        userId: socket.data.user.id,
        username: socket.data.user.username
      })

      await syncPlayerConnectionStateInLobby(lobbyCode, socket.data.user.id, true, {
        advanceTurnIfCurrent: false,
      })

      // Send success confirmation
      socket.emit(SocketEvents.JOINED_LOBBY, { lobbyCode, success: true })
    } catch (error) {
      logger.error('Error joining lobby', error as Error, { lobbyCode })
      emitError(socket, 'JOIN_LOBBY_ERROR', 'Failed to join lobby', 'errors.joinLobbyFailed')
    }
  })

  socket.on(SocketEvents.LEAVE_LOBBY, (lobbyCode: string) => {
    socketMonitor.trackEvent('leave-lobby')
    socket.leave(SocketRooms.lobby(lobbyCode))
    socketLogger('leave-lobby').debug('Socket left lobby', { socketId: socket.id, lobbyCode })
  })

  socket.on(SocketEvents.JOIN_LOBBY_LIST, () => {
    socketMonitor.trackEvent('join-lobby-list')
    socket.join(SocketRooms.lobbyList())
    socketLogger('join-lobby-list').debug('Socket joined lobby-list', { socketId: socket.id })
  })

  socket.on(SocketEvents.LEAVE_LOBBY_LIST, () => {
    socketMonitor.trackEvent('leave-lobby-list')
    socket.leave(SocketRooms.lobbyList())
    socketLogger('leave-lobby-list').debug('Socket left lobby-list', { socketId: socket.id })
  })

  socket.on(SocketEvents.GAME_ACTION, (data: GameActionPayload) => {
    socketMonitor.trackEvent('game-action')

    // Rate limiting
    if (!checkRateLimit(socket.id)) {
      emitError(socket, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'errors.rateLimitExceeded')
      return
    }

    // Validate input
    if (!data?.lobbyCode || !data?.action || typeof data.lobbyCode !== 'string') {
      logger.warn('Invalid game-action data received', { socketId: socket.id })
      emitError(socket, 'INVALID_ACTION_DATA', 'Invalid action data', 'errors.invalidActionData')
      return
    }

    // Validate action type
    const validActions = ['state-change', 'player-left', 'player-joined', 'chat-message', 'game-abandoned']
    if (!validActions.includes(data.action)) {
      logger.warn('Invalid action type', { action: data.action, socketId: socket.id })
      return
    }

    // Broadcast with metadata to all clients in the lobby EXCEPT the sender
    // This prevents the sender from processing their own update twice
    emitWithMetadata(
      socket.to(SocketRooms.lobby(data.lobbyCode)) as any,
      SocketRooms.lobby(data.lobbyCode),
      SocketEvents.GAME_UPDATE,
      {
        action: data.action,
        payload: data.payload,
        lobbyCode: data.lobbyCode
      }
    )

    // Notify lobby list page about changes
    if (data.action === 'player-left' || data.action === 'state-change' || data.action === 'game-abandoned') {
      io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
    }
  })

  socket.on(SocketEvents.LOBBY_CREATED, () => {
    socketMonitor.trackEvent('lobby-created')
    socketLogger('lobby-created').info('New lobby created, notifying lobby list')
    io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
  })

  socket.on(SocketEvents.PLAYER_JOINED, (data: { lobbyCode: string; username?: string; userId?: string }) => {
    socketMonitor.trackEvent('player-joined')
    socketLogger('player-joined').info('Player joined lobby, notifying all players', {
      lobbyCode: data?.lobbyCode,
      username: data?.username
    })

    // Notify lobby list about update
    io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)

    // Notify all players in the lobby about the new player with metadata
    if (data?.lobbyCode) {
      emitWithMetadata(
        io,
        SocketRooms.lobby(data.lobbyCode),
        SocketEvents.PLAYER_JOINED,
        {
          username: data.username,
          userId: data.userId,
          lobbyCode: data.lobbyCode
        }
      )

      // Also send lobby-update event to refresh player list
      emitWithMetadata(
        io,
        SocketRooms.lobby(data.lobbyCode),
        SocketEvents.LOBBY_UPDATE,
        {
          lobbyCode: data.lobbyCode,
          type: 'player-joined'
        }
      )
    }
  })

  socket.on(SocketEvents.GAME_STARTED, (data: GameStartedPayload) => {
    socketMonitor.trackEvent('game-started')
    socketLogger('game-started').info('Game started, notifying all players', {
      lobbyCode: data?.lobbyCode
    })

    if (data?.lobbyCode) {
      // Notify all players in the lobby that game has started with metadata
      emitWithMetadata(
        io,
        SocketRooms.lobby(data.lobbyCode),
        SocketEvents.GAME_STARTED,
        {
          lobbyCode: data.lobbyCode,
          game: data.game
        }
      )

      // Also update lobby list
      io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
    }
  })

  socket.on(SocketEvents.SEND_CHAT_MESSAGE, (data: { lobbyCode: string; message: string; userId: string; username: string }) => {
    socketMonitor.trackEvent('send-chat-message')

    if (!data?.lobbyCode || !data?.message) {
      logger.warn('Invalid chat message data', { socketId: socket.id })
      return
    }

    // Broadcast chat message with metadata to all clients in the lobby
    emitWithMetadata(
      io,
      SocketRooms.lobby(data.lobbyCode),
      SocketEvents.CHAT_MESSAGE,
      {
        id: Date.now().toString(),
        userId: data.userId,
        username: data.username,
        message: data.message,
        lobbyCode: data.lobbyCode
      }
    )
  })

  socket.on(SocketEvents.PLAYER_TYPING, (data: { lobbyCode: string; userId: string; username: string }) => {
    socketMonitor.trackEvent('player-typing')
    if (!data?.lobbyCode) return

    // Broadcast typing indicator to other clients (not sender)
    socket.to(SocketRooms.lobby(data.lobbyCode)).emit(SocketEvents.PLAYER_TYPING, {
      userId: data.userId,
      username: data.username,
    })
  })

  socket.on('disconnecting', (reason) => {
    const disconnectingUser = socket.data.user
    if (!disconnectingUser?.id) {
      return
    }

    if (hasAnotherActiveSocketForUser(disconnectingUser.id, socket.id)) {
      logger.info('Skipping disconnect state sync because another socket is active', {
        userId: disconnectingUser.id,
        socketId: socket.id,
      })
      return
    }

    const lobbyCodes = getLobbyCodesFromRooms(socket.rooms)
    if (lobbyCodes.length === 0) {
      return
    }

    for (const lobbyCode of lobbyCodes) {
      void handleAbruptDisconnectForLobby(lobbyCode, disconnectingUser)
    }
  })

  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected', { socketId: socket.id, reason })

    // Track disconnection in monitor
    socketMonitor.onDisconnect(socket.id)

    // Mark user as offline if authenticated
    const userId = socket.data.user?.id
    if (userId && !socket.data.user?.isGuest) {
      markUserOffline(userId, socket.id)
    }

    // Clean up rate limit entry for this socket
    socketRateLimits.delete(socket.id)
  })

  socket.on('error', (error) => {
    logger.error('Socket error', error, { socketId: socket.id })
  })
})

// Initialize monitoring
socketMonitor.initialize(io, 30000) // Log metrics every 30 seconds
dbMonitor.initialize(60000) // Log DB metrics every 60 seconds

// Health check endpoint for metrics
server.on('request', (req, res) => {
  const url = parse(req.url || '/')

  if (url.pathname === '/health') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // API endpoint for server-side bot notifications (moved here after io initialization)
  if (url.pathname === '/api/notify' && req.method === 'POST') {
    let body = ''
    let responseSent = false // Track if response has been sent

    const sendResponse = (statusCode: number, responseData: any) => {
      if (responseSent || res.headersSent) return
      responseSent = true
      res.statusCode = statusCode
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(responseData))
    }

    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', () => {
      // Prevent multiple handler executions
      if (responseSent) return

      try {
        const { room, event, data } = JSON.parse(body)

        if (!room || !event) {
          sendResponse(400, { error: 'Missing room or event' })
          return
        }

        const stateChangeKey = buildStateChangeNotifyKey(room, event, data)
        if (stateChangeKey && isDuplicateStateChangeNotify(stateChangeKey)) {
          logger.info('Duplicate state-change notification ignored', { room, event, stateChangeKey })
          sendResponse(200, { success: true, deduped: true })
          return
        }

        logger.info('Server notification received', { room, event, dataKeys: Object.keys(data || {}) })

        // Add metadata to the event
        const payloadWithMetadata = {
          ...data,
          sequenceId: ++eventSequence,
          timestamp: Date.now(),
          version: '1.0.0'
        }

        // Broadcast to all clients in the room
        io.to(room).emit(event, payloadWithMetadata)

        // Notify lobby list if it's a state change
        if (data?.action === 'state-change' || event === SocketEvents.LOBBY_LIST_UPDATE) {
          io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
        }

        sendResponse(200, { success: true, sequenceId: payloadWithMetadata.sequenceId })
      } catch (error) {
        logger.error('Error processing notification', error as Error)
        sendResponse(500, { error: 'Internal server error' })
      }
    })

    // Handle request errors
    req.on('error', (error) => {
      logger.error('Request error in /api/notify', error)
      sendResponse(500, { error: 'Request error' })
    })

    return
  }

  if (url.pathname === '/metrics') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')

    const socketMetrics = socketMonitor.getMetrics()
    const dbMetrics = dbMonitor.getMetrics()
    const socketHealth = socketMonitor.isHealthy()

    res.end(JSON.stringify({
      timestamp: new Date().toISOString(),
      socket: socketMetrics,
      database: dbMetrics,
      health: {
        socket: socketHealth,
      },
      lobbies: socketMonitor.getLobbies(),
    }, null, 2))
    return
  }
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
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
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
