import { IncomingMessage, Server as HttpServer, ServerResponse } from 'http'
import { parse } from 'url'
import { SocketEvents, SocketRooms } from '../../types/socket-events'

type LogContext = Record<string, unknown>

type LoggerLike = {
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, error?: Error, context?: LogContext) => void
}

type SocketMonitorLike = {
  getMetrics: () => unknown
  isHealthy: () => unknown
  getLobbies: () => unknown
}

type DbMonitorLike = {
  getMetrics: () => unknown
}

type RoomBroadcasterLike = {
  to: (room: string) => {
    emit: (event: string, payload?: unknown) => void
  }
}

interface RegisterSocketHttpEndpointsOptions {
  server: HttpServer
  io: RoomBroadcasterLike
  logger: LoggerLike
  socketMonitor: SocketMonitorLike
  dbMonitor: DbMonitorLike
  isInternalEndpointAuthorized: (req: IncomingMessage) => boolean
  getNextSequenceId: () => number
}

const stateChangeNotifyDebounce = new Map<string, number>()
const STATE_CHANGE_NOTIFY_DEBOUNCE_MS = 1500
const STATE_CHANGE_NOTIFY_TTL_MS = 30000

function extractStatePayload(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const payload = (data as Record<string, unknown>).payload
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const wrappedState = (payload as Record<string, unknown>).state
  if (wrappedState && typeof wrappedState === 'object') {
    return wrappedState as Record<string, unknown>
  }

  return payload as Record<string, unknown>
}

function buildStateChangeNotifyKey(room: string, event: string, data: unknown): string | null {
  if (event !== SocketEvents.GAME_UPDATE) {
    return null
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  const action = (data as Record<string, unknown>).action
  if (action !== 'state-change') {
    return null
  }

  const state = extractStatePayload(data)
  if (!state) {
    return null
  }

  const currentPlayerIndex =
    typeof state.currentPlayerIndex === 'number' ? state.currentPlayerIndex : 'na'
  const lastMoveAt =
    typeof state.lastMoveAt === 'number' || typeof state.lastMoveAt === 'string'
      ? String(state.lastMoveAt)
      : 'na'
  const stateData = state.data
  const rollsLeft =
    stateData &&
    typeof stateData === 'object' &&
    typeof (stateData as Record<string, unknown>).rollsLeft === 'number'
      ? (stateData as Record<string, unknown>).rollsLeft
      : 'na'
  const updatedAt = state.updatedAt ? String(state.updatedAt) : 'na'

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

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export function registerSocketHttpEndpoints({
  server,
  io,
  logger,
  socketMonitor,
  dbMonitor,
  isInternalEndpointAuthorized,
  getNextSequenceId,
}: RegisterSocketHttpEndpointsOptions) {
  // Important: do not pre-respond to every request before /api/notify is processed,
  // otherwise state-change notifications may be acknowledged without broadcasting.
  server.on('request', (req, res) => {
    const url = parse(req.url || '/')
    const pathname = url.pathname || '/'

    // Let Socket.IO internal handlers process Engine.IO transport requests.
    if (pathname.startsWith('/socket.io')) {
      return
    }

    if (res.headersSent || res.writableEnded) {
      return
    }

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    // API endpoint for server-side notifications from Next.js API routes
    if (pathname === '/api/notify' && req.method === 'POST') {
      if (!isInternalEndpointAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized' })
        return
      }

      let body = ''
      let responseSent = false

      const sendResponse = (statusCode: number, responseData: unknown) => {
        if (responseSent || res.headersSent) return
        responseSent = true
        sendJson(res, statusCode, responseData)
      }

      req.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })

      req.on('end', () => {
        if (responseSent) return

        try {
          const parsed = JSON.parse(body) as {
            room?: string
            event?: string
            data?: unknown
          }

          const room = parsed.room
          const event = parsed.event
          const data = parsed.data

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

          logger.info('Server notification received', {
            room,
            event,
            dataKeys: Object.keys((data as Record<string, unknown>) || {}),
          })

          // Add metadata to the event
          const payloadWithMetadata = {
            ...(data && typeof data === 'object' ? data : {}),
            sequenceId: getNextSequenceId(),
            timestamp: Date.now(),
            version: '1.0.0',
          }

          // Broadcast to all clients in the room
          io.to(room).emit(event, payloadWithMetadata)

          // Notify lobby list if it's a state change
          if (
            (data && typeof data === 'object' && (data as Record<string, unknown>).action === 'state-change') ||
            event === SocketEvents.LOBBY_LIST_UPDATE
          ) {
            io.to(SocketRooms.lobbyList()).emit(SocketEvents.LOBBY_LIST_UPDATE)
          }

          sendResponse(200, { success: true, sequenceId: payloadWithMetadata.sequenceId })
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error))
          logger.error('Error processing notification', err)
          sendResponse(500, { error: 'Internal server error' })
        }
      })

      req.on('error', (error) => {
        logger.error('Request error in /api/notify', error)
        sendResponse(500, { error: 'Request error' })
      })

      return
    }

    if (pathname === '/metrics') {
      if (!isInternalEndpointAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized' })
        return
      }

      const socketMetrics = socketMonitor.getMetrics()
      const dbMetrics = dbMonitor.getMetrics()
      const socketHealth = socketMonitor.isHealthy()

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        socket: socketMetrics,
        database: dbMetrics,
        health: {
          socket: socketHealth,
        },
        lobbies: socketMonitor.getLobbies(),
      })
      return
    }

    if (pathname === '/') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.end('Socket.IO server is running')
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  })
}

