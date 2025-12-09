// Load environment variables from .env.local (for local development)
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load .env.local first (local development overrides), then .env
// Use override: true to ensure .env.local values take precedence
dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true })
dotenv.config({ path: resolve(process.cwd(), '.env') })

import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { parse } from 'url'
import jwt from 'jsonwebtoken'
import { prisma } from './lib/db'
import { socketLogger, logger } from './lib/logger'
import { validateEnv, printEnvInfo } from './lib/env'
import { socketMonitor } from './lib/socket-monitoring'
import { dbMonitor } from './lib/db-monitoring'

// Validate environment variables on startup
try {
  validateEnv()
  printEnvInfo()
} catch (error) {
  logger.error('Failed to start socket server due to environment validation error', error as Error)
  process.exit(1)
}

const port = Number(process.env.PORT) || 3001
const hostname = process.env.HOSTNAME || '0.0.0.0'

const server = createServer((req, res) => {
  const url = parse(req.url || '/')
  
  if (url.pathname === '/health') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }
  
  // API endpoint for server-side bot notifications
  if (url.pathname === '/api/notify' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const { room, event, data } = JSON.parse(body)
        
        if (!room || !event) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Missing room or event' }))
          return
        }
        
        logger.info('Server notification received', { room, event })
        
        // Broadcast to all clients in the room
        io.to(room).emit(event, data)
        
        // Notify lobby list if it's a state change
        if (data?.action === 'state-change') {
          io.to('lobby-list').emit('lobby-list-update')
        }
        
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true }))
      } catch (error) {
        logger.error('Error processing notification', error as Error)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
    })
    return
  }
  
  // Minimal root response for sanity checks
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end('Socket.IO server is running')
})

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : '*'

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
  },
  pingTimeout: 120000, // Збільшено до 120s для Render free tier
  pingInterval: 25000,
  connectTimeout: 90000, // Збільшено timeout для підключення
  transports: ['polling', 'websocket'], // Спочатку polling (надійніший для Render), потім upgrade до WebSocket
  allowUpgrades: true,
  upgradeTimeout: 30000, // Збільшено timeout для upgrade
  maxHttpBufferSize: 1e6, // 1MB max buffer
})

// Online users tracking: userId -> Set of socketIds
const onlineUsers = new Map<string, Set<string>>()

// Helper functions for online status
function markUserOnline(userId: string, socketId: string) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set())
  }
  onlineUsers.get(userId)!.add(socketId)
  
  // Broadcast to friends that user is online
  io.emit('user-online', { userId })
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
      io.emit('user-offline', { userId })
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

// Authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token
    const isGuest = socket.handshake.auth.isGuest === true || socket.handshake.query.isGuest === 'true'
    
    logger.info('Socket authentication attempt', { 
      hasToken: !!token, 
      tokenPreview: token ? String(token).substring(0, 20) + '...' : 'none',
      isGuest,
      authKeys: Object.keys(socket.handshake.auth),
      queryKeys: Object.keys(socket.handshake.query)
    })
    
    // Allow guests without token validation
    if (isGuest) {
      const guestId = token || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const guestName = socket.handshake.auth.guestName || socket.handshake.query.guestName || 'Guest'
      
      socket.data.user = {
        id: guestId,
        username: guestName,
        isGuest: true,
      }
      logger.info('Guest socket authenticated', { guestId, guestName })
      return next()
    }
    
    if (!token || token === 'null' || token === 'undefined' || token === '') {
      logger.warn('Socket connection rejected: No valid token provided', {
        token: token,
        auth: socket.handshake.auth,
        query: socket.handshake.query
      })
      return next(new Error('Authentication required'))
    }
    
    // Try to verify as JWT first
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET
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
      logger.warn('No NEXTAUTH_SECRET or JWT_SECRET configured, treating token as userId')
      // No secret configured, treat token as userId
      userId = String(token)
    }
    
    if (!userId) {
      logger.warn('Socket connection rejected: Could not extract userId')
      return next(new Error('Invalid authentication'))
    }
    
    logger.info('Attempting to find user in database', { userId })
    
    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, isBot: true }
    })
    
    if (!user) {
      logger.warn('Socket connection rejected: User not found in database', { 
        userId,
        tokenPreview: String(token).substring(0, 20) + '...'
      })
      return next(new Error('User not found'))
    }
    
    socket.data.user = user
    logger.info('Socket authenticated', { userId: user.id, username: user.username })
    next()
  } catch (error) {
    logger.error('Socket authentication error', error as Error)
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
  socket.emit('online-users', { userIds: getOnlineUserIds() })

  socket.on('join-lobby', async (lobbyCode: string) => {
    // Rate limiting
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: 'Too many requests' })
      return
    }
    
    // Track event
    socketMonitor.trackEvent('join-lobby')
    
    // Basic validation
    if (!lobbyCode || typeof lobbyCode !== 'string' || lobbyCode.length > 20) {
      logger.warn('Invalid lobby code received', { lobbyCode, socketId: socket.id })
      socket.emit('error', { message: 'Invalid lobby code' })
      return
    }
    
    try {
      // Verify lobby exists in database
      const lobby = await prisma.lobby.findUnique({
        where: { code: lobbyCode },
        include: {
          games: {
            where: { status: { in: ['waiting', 'playing'] } },
            include: {
              players: {
                select: { userId: true }
              }
            }
          }
        }
      })
      
      if (!lobby) {
        socket.emit('error', { message: 'Lobby not found' })
        return
      }
      
      // Always allow joining the room to receive updates
      // Access control will be handled at the action level
      socket.join(`lobby:${lobbyCode}`)
      socketLogger('join-lobby').info('Socket joined lobby', { 
        socketId: socket.id, 
        lobbyCode,
        userId: socket.data.user.id,
        username: socket.data.user.username
      })
    } catch (error) {
      logger.error('Error joining lobby', error as Error, { lobbyCode })
      socket.emit('error', { message: 'Failed to join lobby' })
    }
  })

  socket.on('leave-lobby', (lobbyCode: string) => {
    socketMonitor.trackEvent('leave-lobby')
    socket.leave(`lobby:${lobbyCode}`)
    socketLogger('leave-lobby').debug('Socket left lobby', { socketId: socket.id, lobbyCode })
  })

  socket.on('join-lobby-list', () => {
    socketMonitor.trackEvent('join-lobby-list')
    socket.join('lobby-list')
    socketLogger('join-lobby-list').debug('Socket joined lobby-list', { socketId: socket.id })
  })

  socket.on('leave-lobby-list', () => {
    socketMonitor.trackEvent('leave-lobby-list')
    socket.leave('lobby-list')
    socketLogger('leave-lobby-list').debug('Socket left lobby-list', { socketId: socket.id })
  })

  socket.on('game-action', (data: { lobbyCode: string; action: string; payload: any }) => {
    socketMonitor.trackEvent('game-action')
    
    // Rate limiting
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: 'Too many requests' })
      return
    }
    
    // Validate input
    if (!data?.lobbyCode || !data?.action || typeof data.lobbyCode !== 'string') {
      logger.warn('Invalid game-action data received', { socketId: socket.id })
      socket.emit('error', { message: 'Invalid action data' })
      return
    }
    
    // Validate action type
    const validActions = ['state-change', 'player-left', 'player-joined', 'chat-message']
    if (!validActions.includes(data.action)) {
      logger.warn('Invalid action type', { action: data.action, socketId: socket.id })
      return
    }
    
    // Broadcast to all clients in the lobby EXCEPT the sender
    // This prevents the sender from processing their own update twice
    socket.to(`lobby:${data.lobbyCode}`).emit('game-update', {
      action: data.action,
      payload: data.payload,
    })

    // Notify lobby list page about changes
    if (data.action === 'player-left' || data.action === 'state-change') {
      io.to('lobby-list').emit('lobby-list-update')
    }
  })

  socket.on('lobby-created', () => {
    socketMonitor.trackEvent('lobby-created')
    socketLogger('lobby-created').info('New lobby created, notifying lobby list')
    io.to('lobby-list').emit('lobby-list-update')
  })

  socket.on('player-joined', (data: { lobbyCode: string; username?: string; userId?: string }) => {
    socketMonitor.trackEvent('player-joined')
    socketLogger('player-joined').info('Player joined lobby, notifying all players', { 
      lobbyCode: data?.lobbyCode, 
      username: data?.username 
    })
    
    // Notify lobby list about update
    io.to('lobby-list').emit('lobby-list-update')
    
    // Notify all players in the lobby about the new player
    if (data?.lobbyCode) {
      io.to(`lobby:${data.lobbyCode}`).emit('player-joined', {
        username: data.username,
        userId: data.userId,
      })
      
      // Also send lobby-update event to refresh player list
      io.to(`lobby:${data.lobbyCode}`).emit('lobby-update', {
        lobbyCode: data.lobbyCode,
      })
    }
  })

  socket.on('game-started', (data: { lobbyCode: string; game?: any }) => {
    socketMonitor.trackEvent('game-started')
    socketLogger('game-started').info('Game started, notifying all players', { 
      lobbyCode: data?.lobbyCode 
    })
    
    if (data?.lobbyCode) {
      // Notify all players in the lobby that game has started
      io.to(`lobby:${data.lobbyCode}`).emit('game-started', {
        lobbyCode: data.lobbyCode,
        game: data.game,
      })
      
      // Also update lobby list
      io.to('lobby-list').emit('lobby-list-update')
    }
  })

  socket.on('send-chat-message', (data: { lobbyCode: string; message: string; userId: string; username: string }) => {
    socketMonitor.trackEvent('send-chat-message')
    
    if (!data?.lobbyCode || !data?.message) {
      logger.warn('Invalid chat message data', { socketId: socket.id })
      return
    }
    
    // Broadcast chat message to all clients in the lobby
    io.to(`lobby:${data.lobbyCode}`).emit('chat-message', {
      id: Date.now().toString(),
      userId: data.userId,
      username: data.username,
      message: data.message,
      timestamp: Date.now(),
    })
  })

  socket.on('player-typing', (data: { lobbyCode: string; userId: string; username: string }) => {
    socketMonitor.trackEvent('player-typing')
    if (!data?.lobbyCode) return
    
    // Broadcast typing indicator to other clients (not sender)
    socket.to(`lobby:${data.lobbyCode}`).emit('player-typing', {
      userId: data.userId,
      username: data.username,
    })
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
  })

  socket.on('error', (error) => {
    logger.error('Socket error', error, { socketId: socket.id })
  })
})

// Initialize monitoring
socketMonitor.initialize(io, 30000) // Log metrics every 30 seconds
dbMonitor.initialize(60000) // Log DB metrics every 60 seconds

// Add health endpoint with monitoring data
server.on('request', (req, res) => {
  const url = parse(req.url || '/')
  
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
