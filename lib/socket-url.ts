const DEFAULT_LOCAL_SOCKET_URL = 'http://localhost:3001'

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0']

// Import logger only for server-side use (notifySocket)
// Client-side functions don't need it
let logger: any = null
if (typeof window === 'undefined') {
  try {
    logger = require('./logger').logger
  } catch (e) {
    // Logger not available, will use fallback
  }
}

/**
 * Resolve the Socket.IO endpoint for browser/client usage.
 * Falls back to localhost:3001 during local development so that the
 * standalone socket server is discovered without extra env setup.
 */
export function getBrowserSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL
  }

  if (typeof window === 'undefined') {
    return DEFAULT_LOCAL_SOCKET_URL
  }

  const { protocol, hostname, port } = window.location
  const normalizedHost = hostname.toLowerCase()
  const numericPort = port ? Number(port) : undefined
  const isLocalHostname =
    LOCAL_HOSTNAMES.includes(normalizedHost) ||
    normalizedHost.endsWith('.local') ||
    !hostname.includes('.') // machine names like "Denys"

  const isDevPort = numericPort === 3000 || numericPort === 5173

  if (isLocalHostname || isDevPort) {
    return `${protocol}//${hostname}:3001`
  }

  const derivedPort = port ? `:${port}` : ''
  return `${protocol}//${hostname}${derivedPort}`
}

/**
 * Resolve the Socket.IO endpoint for server-side fetches
 * (API routes, middleware, etc.).
 */
export function getServerSocketUrl(): string {
  return process.env.NEXT_PUBLIC_SOCKET_URL || process.env.SOCKET_SERVER_URL || DEFAULT_LOCAL_SOCKET_URL
}

/**
 * Helper to notify Socket.IO server about state changes
 * Centralizes the fetch logic for socket notifications
 */
export async function notifySocket(
  room: string,
  event: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    const socketUrl = getServerSocketUrl()
    const response = await fetch(`${socketUrl}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, event, data }),
    })
    return response.ok
  } catch (error) {
    // Log error but don't throw - socket notifications are non-critical
    if (logger) {
      logger.error('Failed to notify socket server:', error as Error)
    }
    return false
  }
}

/**
 * Helper to create authentication headers for API requests
 * Handles both guest and authenticated user modes
 */
export function getAuthHeaders(
  isGuest: boolean,
  guestId?: string,
  guestName?: string
): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  
  if (isGuest && guestId && guestName) {
    headers['X-Guest-Id'] = guestId
    headers['X-Guest-Name'] = guestName
  }
  
  return headers
}
