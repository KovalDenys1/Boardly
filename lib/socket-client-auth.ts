import { clientLogger } from './client-logger'

export interface SocketClientAuthPayload {
  authPayload: Record<string, unknown>
  queryPayload: Record<string, string>
}

interface ResolveSocketClientAuthOptions {
  isGuest: boolean
  guestToken?: string | null
}

async function fetchAuthenticatedSocketToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/socket/token', {
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as { token?: unknown }
    if (typeof data.token !== 'string' || !data.token.trim()) {
      throw new Error('Missing token in /api/socket/token response')
    }

    return data.token
  } catch (error) {
    clientLogger.error('Failed to fetch Socket.IO auth token', error)
    return null
  }
}

export async function resolveSocketClientAuth({
  isGuest,
  guestToken,
}: ResolveSocketClientAuthOptions): Promise<SocketClientAuthPayload | null> {
  if (isGuest) {
    if (!guestToken || !guestToken.trim()) {
      return null
    }

    return {
      authPayload: {
        token: guestToken,
        isGuest: true,
      },
      queryPayload: {
        token: guestToken,
        isGuest: 'true',
      },
    }
  }

  const token = await fetchAuthenticatedSocketToken()
  if (!token) {
    return null
  }

  return {
    authPayload: {
      token,
      isGuest: false,
    },
    queryPayload: {
      token,
      isGuest: 'false',
    },
  }
}
