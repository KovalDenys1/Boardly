import { Server as SocketIOServer } from 'socket.io'
import { Socket as ClientSocket, io as ioc } from 'socket.io-client'
import { createServer, Server as HttpServer } from 'http'
import { AddressInfo } from 'net'
import jwt from 'jsonwebtoken'

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    lobby: {
      findUnique: jest.fn(),
    },
  },
}))

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  socketLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}))

import { prisma } from '@/lib/db'

describe('Socket.IO Events', () => {
  let httpServer: HttpServer
  let io: SocketIOServer
  let clientSocket: ClientSocket
  let serverPort: number
  let authToken: string

  const mockUser = {
    id: 'user-123',
    username: 'TestUser',
    email: 'test@example.com',
    isBot: false,
  }

  const mockLobby = {
    id: 'lobby-123',
    code: 'ABC123',
    name: 'Test Lobby',
    status: 'waiting',
    games: [],
  }

  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer()
    
    // Create Socket.IO server
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket'],
    })

    // Add authentication middleware (simplified version)
    io.use(async (socket, next) => {
      const token = socket.handshake.auth.token
      
      if (!token) {
        return next(new Error('No token provided'))
      }

      try {
        // For testing, just extract userId directly
        const userId = token.startsWith('jwt-') ? token.split('-')[1] : token
        
        // Mock user lookup
        const user = await (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
        
        socket.data.user = mockUser
        next()
      } catch (error) {
        next(new Error('Authentication failed'))
      }
    })

    // Add event handlers
    io.on('connection', (socket) => {
      socket.on('join-lobby', async (lobbyCode: string) => {
        if (!lobbyCode || typeof lobbyCode !== 'string') {
          socket.emit('error', { message: 'Invalid lobby code' })
          return
        }

        try {
          const lobby = await (prisma.lobby.findUnique as jest.Mock).mockResolvedValue(mockLobby)
          
          if (!lobby) {
            socket.emit('error', { message: 'Lobby not found' })
            return
          }

          socket.join(`lobby:${lobbyCode}`)
          socket.emit('lobby-joined', { lobbyCode })
          io.to(`lobby:${lobbyCode}`).emit('player-joined', {
            userId: socket.data.user.id,
            username: socket.data.user.username,
          })
        } catch (error) {
          socket.emit('error', { message: 'Failed to join lobby' })
        }
      })

      socket.on('leave-lobby', (lobbyCode: string) => {
        socket.leave(`lobby:${lobbyCode}`)
        socket.emit('lobby-left', { lobbyCode })
      })

      socket.on('join-lobby-list', () => {
        socket.join('lobby-list')
        socket.emit('lobby-list-joined')
      })

      socket.on('leave-lobby-list', () => {
        socket.leave('lobby-list')
        socket.emit('lobby-list-left')
      })

      socket.on('game-action', (data: { lobbyCode: string; action: string; payload: any }) => {
        if (!data.lobbyCode || !data.action) {
          socket.emit('error', { message: 'Invalid game action' })
          return
        }

        io.to(`lobby:${data.lobbyCode}`).emit('game-update', {
          action: data.action,
          payload: data.payload,
          userId: socket.data.user.id,
        })
      })

      socket.on('send-chat-message', (data: { lobbyCode: string; message: string }) => {
        if (!data.message || data.message.trim().length === 0) {
          socket.emit('error', { message: 'Empty message' })
          return
        }

        const chatMessage = {
          id: Date.now().toString(),
          message: data.message,
          userId: socket.data.user.id,
          username: socket.data.user.username,
          timestamp: new Date().toISOString(),
        }

        io.to(`lobby:${data.lobbyCode}`).emit('chat-message', chatMessage)
      })

      socket.on('player-typing', (data: { lobbyCode: string; isTyping: boolean }) => {
        socket.to(`lobby:${data.lobbyCode}`).emit('player-typing', {
          userId: socket.data.user.id,
          username: socket.data.user.username,
          isTyping: data.isTyping,
        })
      })

      socket.on('disconnect', () => {
        // Cleanup handled by Socket.IO
      })
    })

    // Start server on random port
    httpServer.listen(() => {
      const address = httpServer.address() as AddressInfo
      serverPort = address.port
      done()
    })
  })

  afterAll((done) => {
    io.close()
    httpServer.close(done)
  })

  beforeEach((done) => {
    // Generate auth token
    authToken = `jwt-${mockUser.id}`

    // Create client socket
    clientSocket = ioc(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      auth: { token: authToken },
    })

    clientSocket.on('connect', done)
  })

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect()
    }
    jest.clearAllMocks()
  })

  describe('Connection', () => {
    it('should connect with valid token', (done) => {
      expect(clientSocket.connected).toBe(true)
      done()
    })

    it('should reject connection without token', (done) => {
      const invalidSocket = ioc(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        auth: {},
      })

      invalidSocket.on('connect_error', (error) => {
        expect(error.message).toContain('No token provided')
        invalidSocket.disconnect()
        done()
      })
    })
  })

  describe('Lobby Management', () => {
    it('should join lobby successfully', (done) => {
      clientSocket.emit('join-lobby', 'ABC123')

      clientSocket.on('lobby-joined', (data) => {
        expect(data.lobbyCode).toBe('ABC123')
        done()
      })
    })

    it('should receive player-joined event after joining', (done) => {
      clientSocket.emit('join-lobby', 'ABC123')

      clientSocket.on('player-joined', (data) => {
        expect(data.userId).toBe(mockUser.id)
        expect(data.username).toBe(mockUser.username)
        done()
      })
    })

    it('should reject invalid lobby code', (done) => {
      clientSocket.emit('join-lobby', '')

      clientSocket.on('error', (data) => {
        expect(data.message).toBe('Invalid lobby code')
        done()
      })
    })

    it('should reject non-existent lobby', (done) => {
      (prisma.lobby.findUnique as jest.Mock).mockResolvedValueOnce(null)

      clientSocket.emit('join-lobby', 'INVALID')

      clientSocket.on('error', (data) => {
        expect(data.message).toBe('Lobby not found')
        done()
      })
    })

    it('should leave lobby successfully', (done) => {
      clientSocket.emit('join-lobby', 'ABC123')

      clientSocket.once('lobby-joined', () => {
        clientSocket.emit('leave-lobby', 'ABC123')

        clientSocket.on('lobby-left', (data) => {
          expect(data.lobbyCode).toBe('ABC123')
          done()
        })
      })
    })
  })

  describe('Lobby List', () => {
    it('should join lobby list', (done) => {
      clientSocket.emit('join-lobby-list')

      clientSocket.on('lobby-list-joined', () => {
        done()
      })
    })

    it('should leave lobby list', (done) => {
      clientSocket.emit('join-lobby-list')

      clientSocket.once('lobby-list-joined', () => {
        clientSocket.emit('leave-lobby-list')

        clientSocket.on('lobby-list-left', () => {
          done()
        })
      })
    })
  })

  describe('Game Actions', () => {
    it('should broadcast game action to lobby', (done) => {
      // Create second client to receive broadcast
      const client2 = ioc(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        auth: { token: authToken },
      })

      client2.on('connect', () => {
        // Both clients join lobby
        clientSocket.emit('join-lobby', 'ABC123')
        client2.emit('join-lobby', 'ABC123')

        // Wait for both to join
        let joinedCount = 0
        const checkJoined = () => {
          joinedCount++
          if (joinedCount === 2) {
            // Client 1 sends game action
            clientSocket.emit('game-action', {
              lobbyCode: 'ABC123',
              action: 'roll-dice',
              payload: { dice: [1, 2, 3, 4, 5] },
            })
          }
        }

        clientSocket.on('lobby-joined', checkJoined)
        client2.on('lobby-joined', checkJoined)

        // Client 2 receives update
        client2.on('game-update', (data) => {
          expect(data.action).toBe('roll-dice')
          expect(data.payload.dice).toEqual([1, 2, 3, 4, 5])
          expect(data.userId).toBe(mockUser.id)
          client2.disconnect()
          done()
        })
      })
    })

    it('should reject invalid game action', (done) => {
      clientSocket.emit('game-action', {
        lobbyCode: '',
        action: '',
        payload: {},
      })

      clientSocket.on('error', (data) => {
        expect(data.message).toBe('Invalid game action')
        done()
      })
    })
  })

  describe('Chat', () => {
    it('should broadcast chat message to lobby', (done) => {
      const client2 = ioc(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        auth: { token: authToken },
      })

      client2.on('connect', () => {
        clientSocket.emit('join-lobby', 'ABC123')
        client2.emit('join-lobby', 'ABC123')

        let joinedCount = 0
        const checkJoined = () => {
          joinedCount++
          if (joinedCount === 2) {
            clientSocket.emit('send-chat-message', {
              lobbyCode: 'ABC123',
              message: 'Hello world!',
            })
          }
        }

        clientSocket.on('lobby-joined', checkJoined)
        client2.on('lobby-joined', checkJoined)

        client2.on('chat-message', (data) => {
          expect(data.message).toBe('Hello world!')
          expect(data.username).toBe(mockUser.username)
          expect(data.userId).toBe(mockUser.id)
          client2.disconnect()
          done()
        })
      })
    })

    it('should reject empty chat message', (done) => {
      clientSocket.emit('send-chat-message', {
        lobbyCode: 'ABC123',
        message: '   ',
      })

      clientSocket.on('error', (data) => {
        expect(data.message).toBe('Empty message')
        done()
      })
    })
  })

  describe('Typing Indicator', () => {
    it('should broadcast typing status to other players', (done) => {
      const client2 = ioc(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        auth: { token: authToken },
      })

      client2.on('connect', () => {
        clientSocket.emit('join-lobby', 'ABC123')
        client2.emit('join-lobby', 'ABC123')

        let joinedCount = 0
        const checkJoined = () => {
          joinedCount++
          if (joinedCount === 2) {
            clientSocket.emit('player-typing', {
              lobbyCode: 'ABC123',
              isTyping: true,
            })
          }
        }

        clientSocket.on('lobby-joined', checkJoined)
        client2.on('lobby-joined', checkJoined)

        client2.on('player-typing', (data) => {
          expect(data.userId).toBe(mockUser.id)
          expect(data.username).toBe(mockUser.username)
          expect(data.isTyping).toBe(true)
          client2.disconnect()
          done()
        })
      })
    })

    it('should not send typing status to sender', (done) => {
      clientSocket.emit('join-lobby', 'ABC123')

      clientSocket.once('lobby-joined', () => {
        let typingReceived = false

        clientSocket.on('player-typing', () => {
          typingReceived = true
        })

        clientSocket.emit('player-typing', {
          lobbyCode: 'ABC123',
          isTyping: true,
        })

        // Wait to ensure no event is received
        setTimeout(() => {
          expect(typingReceived).toBe(false)
          done()
        }, 100)
      })
    })
  })

  describe('Disconnect', () => {
    it('should handle disconnect gracefully', (done) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false)
        done()
      })

      clientSocket.disconnect()
    })
  })
})
