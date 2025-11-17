import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { parse } from 'url'
import { socketLogger, logger } from './lib/logger'
import { validateEnv, printEnvInfo } from './lib/env'

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
  pingTimeout: 60000, // How long to wait for pong before disconnect (60s)
  pingInterval: 25000, // How often to send ping (25s)
  transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
  allowUpgrades: true, // Allow transport upgrades
  upgradeTimeout: 10000, // Timeout for transport upgrade
  maxHttpBufferSize: 1e6, // 1MB max buffer
  connectTimeout: 45000, // Connection timeout
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

  socket.on('join-lobby', (lobbyCode: string) => {
    // Basic validation
    if (!lobbyCode || typeof lobbyCode !== 'string' || lobbyCode.length > 20) {
      logger.warn('Invalid lobby code received', { lobbyCode, socketId: socket.id })
      return
    }
    socket.join(`lobby:${lobbyCode}`)
    socketLogger('join-lobby').debug('Socket joined lobby', { socketId: socket.id, lobbyCode })
  })

  socket.on('leave-lobby', (lobbyCode: string) => {
    socket.leave(`lobby:${lobbyCode}`)
    socketLogger('leave-lobby').debug('Socket left lobby', { socketId: socket.id, lobbyCode })
  })

  socket.on('join-lobby-list', () => {
    socket.join('lobby-list')
    socketLogger('join-lobby-list').debug('Socket joined lobby-list', { socketId: socket.id })
  })

  socket.on('leave-lobby-list', () => {
    socket.leave('lobby-list')
    socketLogger('leave-lobby-list').debug('Socket left lobby-list', { socketId: socket.id })
  })

  socket.on('game-action', (data: { lobbyCode: string; action: string; payload: any }) => {
    // Validate input
    if (!data?.lobbyCode || !data?.action || typeof data.lobbyCode !== 'string') {
      logger.warn('Invalid game-action data received', { socketId: socket.id })
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
    socketLogger('lobby-created').info('New lobby created, notifying lobby list')
    io.to('lobby-list').emit('lobby-list-update')
  })

  socket.on('player-joined', (data: { lobbyCode: string; username?: string; userId?: string }) => {
    socketLogger('player-joined').info('Player joined lobby, notifying lobby list and lobby members', { 
      lobbyCode: data?.lobbyCode,
      username: data?.username 
    })
    
    // Notify lobby list about update
    io.to('lobby-list').emit('lobby-list-update')
    
    // Notify all players in the lobby about the new player
    if (data?.lobbyCode) {
      io.to(`lobby:${data.lobbyCode}`).emit('game-update', {
        action: 'player-joined',
        payload: {
          username: data.username,
          userId: data.userId,
        },
      })
    }
  })

  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected', { socketId: socket.id, reason })
  })

  socket.on('error', (error) => {
    logger.error('Socket error', error, { socketId: socket.id })
  })
})

server.listen(port, hostname, () => {
  logger.info(`Socket.IO server ready`, { url: `http://${hostname}:${port}` })
})
