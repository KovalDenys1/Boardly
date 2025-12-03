import { Server as SocketIOServer } from 'socket.io'
import { logger } from './logger'

/**
 * Socket.IO Monitoring and Metrics
 * Tracks connections, rooms, events, and performance
 */

interface SocketMetrics {
  connectedClients: number
  totalRooms: number
  roomSizes: Map<string, number>
  eventCounts: Map<string, number>
  lastUpdate: number
}

interface ConnectionStats {
  totalConnections: number
  totalDisconnections: number
  activeConnections: number
  peakConnections: number
  averageConnectionDuration: number
}

class SocketMonitor {
  private metrics: SocketMetrics
  private connectionStats: ConnectionStats
  private connectionStartTimes: Map<string, number>
  private io: SocketIOServer | null = null
  private monitoringInterval: NodeJS.Timeout | null = null

  constructor() {
    this.metrics = {
      connectedClients: 0,
      totalRooms: 0,
      roomSizes: new Map(),
      eventCounts: new Map(),
      lastUpdate: Date.now(),
    }

    this.connectionStats = {
      totalConnections: 0,
      totalDisconnections: 0,
      activeConnections: 0,
      peakConnections: 0,
      averageConnectionDuration: 0,
    }

    this.connectionStartTimes = new Map()
  }

  /**
   * Initialize monitoring for Socket.IO server
   */
  initialize(io: SocketIOServer, intervalMs: number = 30000) {
    this.io = io
    
    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
      this.logMetrics()
    }, intervalMs)

    logger.info('Socket monitoring initialized', { intervalMs })
  }

  /**
   * Track new connection
   */
  onConnect(socketId: string) {
    this.connectionStartTimes.set(socketId, Date.now())
    this.connectionStats.totalConnections++
    this.connectionStats.activeConnections++

    if (this.connectionStats.activeConnections > this.connectionStats.peakConnections) {
      this.connectionStats.peakConnections = this.connectionStats.activeConnections
    }
  }

  /**
   * Track disconnection
   */
  onDisconnect(socketId: string) {
    const startTime = this.connectionStartTimes.get(socketId)
    if (startTime) {
      const duration = Date.now() - startTime
      this.updateAverageConnectionDuration(duration)
      this.connectionStartTimes.delete(socketId)
    }

    this.connectionStats.totalDisconnections++
    this.connectionStats.activeConnections--
  }

  /**
   * Track event emission
   */
  trackEvent(eventName: string) {
    const count = this.metrics.eventCounts.get(eventName) || 0
    this.metrics.eventCounts.set(eventName, count + 1)
  }

  /**
   * Collect current metrics from Socket.IO server
   */
  private collectMetrics() {
    if (!this.io) return

    // Get connected clients count
    this.metrics.connectedClients = this.io.engine.clientsCount

    // Get all rooms and their sizes
    const rooms = this.io.sockets.adapter.rooms
    this.metrics.totalRooms = rooms.size
    this.metrics.roomSizes.clear()

    rooms.forEach((sockets, roomName) => {
      // Filter out socket ID rooms (each socket has a room with its own ID)
      if (!this.io?.sockets.sockets.has(roomName)) {
        this.metrics.roomSizes.set(roomName, sockets.size)
      }
    })

    this.metrics.lastUpdate = Date.now()
  }

  /**
   * Update average connection duration
   */
  private updateAverageConnectionDuration(newDuration: number) {
    const { totalDisconnections, averageConnectionDuration } = this.connectionStats
    
    if (totalDisconnections === 0) {
      this.connectionStats.averageConnectionDuration = newDuration
    } else {
      // Incremental average calculation
      this.connectionStats.averageConnectionDuration = 
        (averageConnectionDuration * (totalDisconnections - 1) + newDuration) / totalDisconnections
    }
  }

  /**
   * Log current metrics
   */
  private logMetrics() {
    const topRooms = Array.from(this.metrics.roomSizes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, size]) => ({ name, size }))

    const topEvents = Array.from(this.metrics.eventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))

    logger.info('Socket.IO Metrics', {
      connections: {
        active: this.connectionStats.activeConnections,
        total: this.connectionStats.totalConnections,
        disconnections: this.connectionStats.totalDisconnections,
        peak: this.connectionStats.peakConnections,
        avgDuration: Math.round(this.connectionStats.averageConnectionDuration / 1000) + 's',
      },
      rooms: {
        total: this.metrics.totalRooms,
        topRooms,
      },
      events: {
        total: Array.from(this.metrics.eventCounts.values()).reduce((a, b) => a + b, 0),
        topEvents,
      },
      server: {
        connectedClients: this.metrics.connectedClients,
      },
    })

    // Reset event counts after logging
    this.metrics.eventCounts.clear()
  }

  /**
   * Get current metrics
   */
  getMetrics(): SocketMetrics & { connectionStats: ConnectionStats } {
    return {
      ...this.metrics,
      connectionStats: { ...this.connectionStats },
    }
  }

  /**
   * Get room information
   */
  getRoomInfo(roomName: string): { exists: boolean; size: number; sockets: string[] } {
    if (!this.io) {
      return { exists: false, size: 0, sockets: [] }
    }

    const room = this.io.sockets.adapter.rooms.get(roomName)
    if (!room) {
      return { exists: false, size: 0, sockets: [] }
    }

    return {
      exists: true,
      size: room.size,
      sockets: Array.from(room),
    }
  }

  /**
   * Get all lobbies with their player counts
   */
  getLobbies(): Array<{ lobbyCode: string; playerCount: number }> {
    const lobbies: Array<{ lobbyCode: string; playerCount: number }> = []

    this.metrics.roomSizes.forEach((size, roomName) => {
      if (roomName.startsWith('lobby:')) {
        const lobbyCode = roomName.replace('lobby:', '')
        lobbies.push({ lobbyCode, playerCount: size })
      }
    })

    return lobbies.sort((a, b) => b.playerCount - a.playerCount)
  }

  /**
   * Check if server is healthy
   */
  isHealthy(): { healthy: boolean; issues: string[] } {
    const issues: string[] = []

    // Check if monitoring is stale (no updates in last 2 minutes)
    if (Date.now() - this.metrics.lastUpdate > 120000) {
      issues.push('Monitoring data is stale')
    }

    // Check for too many connections (potential DDoS or memory issue)
    if (this.connectionStats.activeConnections > 1000) {
      issues.push(`High connection count: ${this.connectionStats.activeConnections}`)
    }

    // Check for too many rooms (potential memory leak)
    if (this.metrics.totalRooms > 500) {
      issues.push(`High room count: ${this.metrics.totalRooms}`)
    }

    return {
      healthy: issues.length === 0,
      issues,
    }
  }

  /**
   * Cleanup and stop monitoring
   */
  shutdown() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    logger.info('Socket monitoring shutdown')
  }
}

// Singleton instance
export const socketMonitor = new SocketMonitor()
