import jwt from 'jsonwebtoken'
import { getToken } from 'next-auth/jwt'
import { verifyGuestToken } from '@/lib/guest-auth'
import { createSocketAuthMiddleware } from '@/lib/socket/auth-middleware'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('@/lib/guest-auth', () => ({
  verifyGuestToken: jest.fn(),
}))

describe('createSocketAuthMiddleware', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const prisma = {
    users: {
      findUnique: jest.fn(),
    },
  }

  type SocketMiddleware = ReturnType<typeof createSocketAuthMiddleware>
  type MiddlewareSocket = Parameters<SocketMiddleware>[0]

  function createSocket(overrides?: Partial<MiddlewareSocket>): MiddlewareSocket {
    return {
      request: { headers: {} } as MiddlewareSocket['request'],
      handshake: {
        auth: {},
        query: {},
      },
      data: {},
      ...overrides,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXTAUTH_SECRET = 'test-secret'
  })

  it('rejects guest socket without token', async () => {
    const middleware = createSocketAuthMiddleware({ logger, prisma })
    const socket = createSocket({
      handshake: { auth: { isGuest: true }, query: {} },
    })
    const next = jest.fn()

    await middleware(socket, next)

    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect((next.mock.calls[0][0] as Error).message).toBe('Guest authentication required')
  })

  it('authenticates guest socket with valid guest token', async () => {
    const middleware = createSocketAuthMiddleware({ logger, prisma })
    const socket = createSocket({
      handshake: { auth: { isGuest: true, token: 'guest-token' }, query: {} },
    })
    const next = jest.fn()

    ;(verifyGuestToken as jest.MockedFunction<typeof verifyGuestToken>).mockReturnValue({
      guestId: 'guest-1',
      guestName: 'Guest One',
    })
    prisma.users.findUnique.mockResolvedValue({
      id: 'guest-1',
      username: null,
      email: null,
      isGuest: true,
      bot: null,
    })

    await middleware(socket, next)

    expect(next).toHaveBeenCalledWith()
    expect(socket.data.user).toEqual({
      id: 'guest-1',
      username: 'Guest One',
      email: null,
      isGuest: true,
      bot: null,
    })
  })

  it('falls back to NextAuth session when JWT verification fails', async () => {
    const middleware = createSocketAuthMiddleware({ logger, prisma })
    const socket = createSocket({
      handshake: { auth: { token: 'invalid-jwt' }, query: {} },
    })
    const next = jest.fn()

    ;(getToken as jest.MockedFunction<typeof getToken>).mockResolvedValue({
      sub: 'user-2',
    } as Awaited<ReturnType<typeof getToken>>)
    prisma.users.findUnique.mockResolvedValue({
      id: 'user-2',
      username: 'User Two',
      email: 'user2@example.com',
      bot: null,
    })

    await middleware(socket, next)

    expect(next).toHaveBeenCalledWith()
    expect(socket.data.user?.id).toBe('user-2')
  })

  it('authenticates via signed JWT token', async () => {
    const middleware = createSocketAuthMiddleware({ logger, prisma })
    const token = jwt.sign({ id: 'user-1' }, process.env.NEXTAUTH_SECRET as string)
    const socket = createSocket({
      handshake: { auth: { token }, query: {} },
    })
    const next = jest.fn()

    prisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'User One',
      email: 'user1@example.com',
      bot: null,
    })

    await middleware(socket, next)

    expect(next).toHaveBeenCalledWith()
    expect(socket.data.user?.id).toBe('user-1')
    expect(getToken).not.toHaveBeenCalled()
  })
})
