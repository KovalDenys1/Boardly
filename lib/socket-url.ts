const DEFAULT_LOCAL_SOCKET_URL = 'http://localhost:3001'

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0']

// Import logger only for server-side use (notifySocket)
// Client-side functions don't need it
type Logger = {
  error: (message: string, error: Error, context?: Record<string, unknown>) => void
  info: (message: string, context?: Record<string, unknown>) => void
  warn?: (message: string, context?: Record<string, unknown>) => void
} | null

let logger: Logger = null
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
  // Explicit URL from environment variables has highest priority
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    console.log('🔌 Using explicit Socket URL from env:', process.env.NEXT_PUBLIC_SOCKET_URL)
    return process.env.NEXT_PUBLIC_SOCKET_URL
  }

  if (typeof window === 'undefined') {
    console.log('🔌 SSR mode: Using default local socket URL')
    return DEFAULT_LOCAL_SOCKET_URL
  }

  const { protocol, hostname, port } = window.location
  const normalizedHost = hostname.toLowerCase()
  const numericPort = port ? Number(port) : undefined
  const isLocalHostname =
    LOCAL_HOSTNAMES.includes(normalizedHost) ||
    normalizedHost.endsWith('.local') ||
    !hostname.includes('.') // machine names without domain

  const isDevPort = numericPort === 3000 || numericPort === 5173

  if (isLocalHostname || isDevPort) {
    const localUrl = `${protocol}//${hostname}:3001`
    console.log('🔌 Local development detected, using:', localUrl)
    return localUrl
  }

  // Production: Socket.IO on the same domain as the app
  const derivedPort = port ? `:${port}` : ''
  const productionUrl = `${protocol}//${hostname}${derivedPort}`
  console.log('🔌 Production mode, using same origin:', productionUrl)
  return productionUrl
}

/**
 * Resolve the Socket.IO endpoint for server-side fetches
 * (API routes, middleware, etc.).
 */
export function getServerSocketUrl(): string {
  const socketUrl = process.env.SOCKET_SERVER_URL || process.env.NEXT_PUBLIC_SOCKET_URL

  if (socketUrl) {
    return socketUrl
  }

  if (process.env.NODE_ENV === 'production' && logger?.warn) {
    logger.warn('SOCKET_SERVER_URL/NEXT_PUBLIC_SOCKET_URL not set in production. Falling back to localhost.')
  }

  return DEFAULT_LOCAL_SOCKET_URL
}

function getSocketInternalSecret(): string | null {
  const secret =
    process.env.SOCKET_SERVER_INTERNAL_SECRET ||
    process.env.SOCKET_INTERNAL_SECRET

  if (!secret || !secret.trim()) {
    if (process.env.NODE_ENV === 'production' && logger?.error) {
      logger.error('SOCKET_SERVER_INTERNAL_SECRET is missing in production', new Error('Missing socket internal secret'))
    }
    return null
  }

  return secret.trim()
}

export function getSocketInternalAuthHeaders(): Record<string, string> {
  const secret = getSocketInternalSecret()
  if (!secret) {
    return {}
  }

  return {
    'x-socket-internal-secret': secret,
    Authorization: `Bearer ${secret}`,
  }
}

type SocketNotificationData = Record<string, unknown>

function extractStateSnapshot(data: SocketNotificationData): Record<string, unknown> | null {
  const payload = data.payload
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const wrappedState = (payload as Record<string, unknown>).state
  if (wrappedState && typeof wrappedState === 'object') {
    return wrappedState as Record<string, unknown>
  }

  return payload as Record<string, unknown>
}

function buildNotificationKey(room: string, event: string, data: SocketNotificationData): string {
  const action = typeof data.action === 'string' ? data.action : ''

  // Use a compact state signature for game state-change events.
  if (event === 'game-update' && action === 'state-change') {
    const state = extractStateSnapshot(data)
    if (state) {
      const currentPlayerIndex =
        typeof state.currentPlayerIndex === 'number' ? state.currentPlayerIndex : 'na'
      const lastMoveAt =
        typeof state.lastMoveAt === 'number' || typeof state.lastMoveAt === 'string'
          ? String(state.lastMoveAt)
          : 'na'
      const updatedAt = state.updatedAt ? String(state.updatedAt) : 'na'
      const stateData = state.data
      const rollsLeft =
        stateData && typeof stateData === 'object' && typeof (stateData as Record<string, unknown>).rollsLeft === 'number'
          ? (stateData as Record<string, unknown>).rollsLeft
          : 'na'

      return `${room}:${event}:${action}:${currentPlayerIndex}:${lastMoveAt}:${rollsLeft}:${updatedAt}`
    }
  }

  let serializedData = '[unserializable]'
  try {
    serializedData = JSON.stringify(data)
  } catch {
    // Keep fallback marker.
  }

  return `${room}:${event}:${serializedData}`
}

// Debounce map to prevent duplicate notifications
const notificationQueue = new Map<string, NodeJS.Timeout>()
const pendingPromises = new Map<string, Promise<boolean>>()

/**
 * Helper to notify Socket.IO server about state changes
 * Centralizes the fetch logic for socket notifications
 * Includes debouncing to prevent duplicate notifications within 100ms
 */
export async function notifySocket(
  room: string,
  event: string,
  data: SocketNotificationData,
  debounceMs: number = 100
): Promise<boolean> {
  const key = buildNotificationKey(room, event, data)

  // If there's a pending request for this room+event, return that promise
  if (pendingPromises.has(key)) {
    return pendingPromises.get(key)!
  }

  // Clear existing timeout for this room+event
  if (notificationQueue.has(key)) {
    clearTimeout(notificationQueue.get(key)!)
  }

  const promise = new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(async () => {
      notificationQueue.delete(key)
      pendingPromises.delete(key)

      try {
        const socketUrl = getServerSocketUrl()
        const response = await fetch(`${socketUrl}/api/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getSocketInternalAuthHeaders(),
          },
          body: JSON.stringify({ room, event, data }),
        })
        resolve(response.ok)
      } catch (error) {
        // Log error but don't throw - socket notifications are non-critical
        if (logger) {
          logger.error('Failed to notify socket server:', error as Error)
        }
        resolve(false)
      }
    }, debounceMs)

    notificationQueue.set(key, timeoutId)
  })

  pendingPromises.set(key, promise)
  return promise
}

/**
 * Helper to create authentication headers for API requests
 * Handles both guest and authenticated user modes
 */
export function getAuthHeaders(
  isGuest: boolean,
  _guestId?: string | null,
  _guestName?: string | null,
  guestToken?: string | null
): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (isGuest) {
    const tokenFromStorage =
      typeof window !== 'undefined' ? localStorage.getItem('boardly_guest_token') : null
    const effectiveToken = guestToken || tokenFromStorage

    if (effectiveToken) {
      headers['X-Guest-Token'] = effectiveToken
    }
  }

  return headers
}
