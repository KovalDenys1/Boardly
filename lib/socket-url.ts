const DEFAULT_LOCAL_SOCKET_URL = 'http://localhost:3001'

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0']

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
