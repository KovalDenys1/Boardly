import jwt, { JwtPayload } from 'jsonwebtoken'
import { getToken } from 'next-auth/jwt'
import { IncomingMessage } from 'http'
import { verifyGuestToken } from '../guest-auth'

type LogContext = Record<string, unknown>

type LoggerLike = {
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, error?: Error, context?: LogContext) => void
}

interface SocketUserRecord {
  id: string
  username: string | null
  email: string | null
  isGuest?: boolean
  bot: unknown
}

interface SocketRequestContext {
  request: IncomingMessage
  handshake: {
    auth: Record<string, unknown>
    query: Record<string, unknown>
  }
  data: {
    user?: SocketUserRecord
  }
}

interface PrismaLike {
  users: {
    findUnique: (args: {
      where: { id: string }
      select: {
        id: true
        username: true
        email: true
        isGuest?: true
        bot: true
      }
    }) => Promise<SocketUserRecord | null>
  }
}

interface CreateSocketAuthMiddlewareOptions {
  logger: LoggerLike
  prisma: PrismaLike
}

interface JwtSocketClaims extends JwtPayload {
  id?: string
  userId?: string
}

async function getSessionUserIdForSocket(
  socket: SocketRequestContext,
  secret: string,
  logger: LoggerLike
): Promise<string | null> {
  try {
    const token = await getToken({
      req: socket.request as Parameters<typeof getToken>[0]['req'],
      secret,
    })
    if (typeof token?.id === 'string' && token.id) {
      return token.id
    }
    if (typeof token?.sub === 'string' && token.sub) {
      return token.sub
    }
    return null
  } catch (error) {
    logger.warn('Failed to decode session token from socket request')
    return null
  }
}

function getHandshakeValue(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

export function createSocketAuthMiddleware({
  logger,
  prisma,
}: CreateSocketAuthMiddlewareOptions) {
  return async (socket: SocketRequestContext, next: (error?: Error) => void) => {
    const token =
      getHandshakeValue(socket.handshake.auth, 'token') || getHandshakeValue(socket.handshake.query, 'token')
    const isGuest =
      socket.handshake.auth.isGuest === true || getHandshakeValue(socket.handshake.query, 'isGuest') === 'true'

    try {
      logger.info('Socket authentication attempt', {
        hasToken: !!token,
        tokenPreview: token ? String(token).substring(0, 20) + '...' : 'none',
        isGuest,
        authKeys: Object.keys(socket.handshake.auth),
        queryKeys: Object.keys(socket.handshake.query),
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

      const secret = process.env.NEXTAUTH_SECRET
      if (!secret) {
        logger.error('Socket connection rejected: NEXTAUTH_SECRET is not configured')
        return next(new Error('Authentication unavailable'))
      }

      let userId: string | null = null

      // Prefer explicit signed token when provided.
      if (token && token !== 'null' && token !== 'undefined') {
        try {
          const decoded = jwt.verify(token, secret) as JwtPayload | string
          if (typeof decoded === 'string') {
            userId = decoded
          } else {
            const claims = decoded as JwtSocketClaims
            userId = claims.id || claims.userId || claims.sub || null
          }
          logger.info('JWT token verified successfully', { userId })
        } catch (jwtError) {
          logger.warn('Socket token verification failed, trying session cookie auth', {
            tokenPreview: String(token).substring(0, 20) + '...',
            tokenLength: String(token).length,
          })
        }
      }

      // Fallback to NextAuth session cookie for browser clients.
      if (!userId) {
        userId = await getSessionUserIdForSocket(socket, secret, logger)
        if (userId) {
          logger.info('Socket authenticated via NextAuth session cookie', { userId })
        }
      }

      if (!userId) {
        logger.warn('Socket connection rejected: Could not extract authenticated user id')
        return next(new Error('Authentication required'))
      }

      logger.info('Attempting to find user in database', { userId })

      // Verify user exists in database
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          bot: true, // Include bot relation instead of isBot
        },
      })

      if (!user) {
        logger.warn('Socket connection rejected: User not found in database', {
          userId,
          tokenPreview: String(token).substring(0, 20) + '...',
          isGuest,
          tokenLength: String(token).length,
          tokenType: typeof token,
        })
        return next(new Error('User not found'))
      }

      socket.data.user = user
      logger.info('Socket authenticated', { userId: user.id, username: user.username, isBot: !!user.bot })
      next()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('Socket authentication error', err, {
        isGuest,
        hasToken: !!token,
        tokenType: token ? typeof token : 'undefined',
      })
      next(new Error('Authentication failed'))
    }
  }
}

