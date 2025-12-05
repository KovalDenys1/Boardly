import { prisma } from './db'
import { logger } from './logger'

/**
 * Database Connection Pool Monitoring
 * Tracks Prisma connection pool health and performance
 */

interface DatabaseMetrics {
  activeConnections: number
  idleConnections: number
  totalConnections: number
  queryCount: number
  slowQueries: number
  errorCount: number
  lastUpdate: number
}

interface QueryStats {
  totalQueries: number
  slowQueries: number
  failedQueries: number
  averageQueryTime: number
  longestQueryTime: number
}

class DatabaseMonitor {
  private metrics: DatabaseMetrics
  private queryStats: QueryStats
  private queryTimes: number[] = []
  private monitoringInterval: NodeJS.Timeout | null = null
  private readonly SLOW_QUERY_THRESHOLD = 1000 // 1 second

  constructor() {
    this.metrics = {
      activeConnections: 0,
      idleConnections: 0,
      totalConnections: 0,
      queryCount: 0,
      slowQueries: 0,
      errorCount: 0,
      lastUpdate: Date.now(),
    }

    this.queryStats = {
      totalQueries: 0,
      slowQueries: 0,
      failedQueries: 0,
      averageQueryTime: 0,
      longestQueryTime: 0,
    }
  }

  /**
   * Initialize database monitoring
   */
  initialize(intervalMs: number = 60000) {
    // Set up Prisma query logging middleware
    this.setupPrismaMiddleware()

    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
      this.logMetrics()
    }, intervalMs)

    logger.info('Database monitoring initialized', { intervalMs })
  }

  /**
   * Setup Prisma middleware to track queries
   */
  private setupPrismaMiddleware() {
    // @ts-ignore - Prisma middleware typing
    prisma.$use(async (params: any, next: any) => {
      const startTime = Date.now()

      try {
        const result = await next(params)
        const duration = Date.now() - startTime

        this.trackQuery(duration, false)

        // Log slow queries
        if (duration > this.SLOW_QUERY_THRESHOLD) {
          logger.warn('Slow database query detected', {
            model: params.model,
            action: params.action,
            duration: `${duration}ms`,
            args: params.args,
          })
        }

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        this.trackQuery(duration, true)

        logger.error('Database query failed', error as Error, {
          model: params.model,
          action: params.action,
          duration: `${duration}ms`,
        })

        throw error
      }
    })
  }

  /**
   * Track individual query
   */
  private trackQuery(duration: number, failed: boolean) {
    this.queryStats.totalQueries++
    this.metrics.queryCount++

    if (failed) {
      this.queryStats.failedQueries++
      this.metrics.errorCount++
    }

    if (duration > this.SLOW_QUERY_THRESHOLD) {
      this.queryStats.slowQueries++
      this.metrics.slowQueries++
    }

    // Track query time for average calculation
    this.queryTimes.push(duration)
    
    // Keep only last 100 query times to prevent memory growth
    if (this.queryTimes.length > 100) {
      this.queryTimes.shift()
    }

    // Update longest query time
    if (duration > this.queryStats.longestQueryTime) {
      this.queryStats.longestQueryTime = duration
    }

    // Calculate average query time
    this.queryStats.averageQueryTime = 
      this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length
  }

  /**
   * Collect current metrics from Prisma
   */
  private async collectMetrics() {
    try {
      // Prisma doesn't expose pool metrics directly, so we estimate based on query activity
      // In production, you might want to query pg_stat_activity for PostgreSQL
      
      // Try a simple query to check database connectivity
      await prisma.$queryRaw`SELECT 1 as health_check`
      
      this.metrics.lastUpdate = Date.now()
    } catch (error) {
      logger.error('Failed to collect database metrics', error as Error)
      this.metrics.errorCount++
    }
  }

  /**
   * Log current metrics
   */
  private logMetrics() {
    logger.info('Database Metrics', {
      queries: {
        total: this.queryStats.totalQueries,
        slow: this.queryStats.slowQueries,
        failed: this.queryStats.failedQueries,
        avgTime: Math.round(this.queryStats.averageQueryTime) + 'ms',
        longestTime: this.queryStats.longestQueryTime + 'ms',
      },
      errors: this.metrics.errorCount,
      lastUpdate: new Date(this.metrics.lastUpdate).toISOString(),
    })

    // Reset periodic counters
    this.metrics.queryCount = 0
    this.metrics.slowQueries = 0
  }

  /**
   * Get current metrics
   */
  getMetrics(): DatabaseMetrics & { queryStats: QueryStats } {
    return {
      ...this.metrics,
      queryStats: { ...this.queryStats },
    }
  }

  /**
   * Check database health
   */
  async checkHealth(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = []

    try {
      // Check connectivity
      const start = Date.now()
      await prisma.$queryRaw`SELECT 1 as health_check`
      const latency = Date.now() - start

      if (latency > 500) {
        issues.push(`High database latency: ${latency}ms`)
      }

      // Check for high error rate
      const errorRate = this.queryStats.failedQueries / Math.max(this.queryStats.totalQueries, 1)
      if (errorRate > 0.05) {
        issues.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`)
      }

      // Check for too many slow queries
      const slowQueryRate = this.queryStats.slowQueries / Math.max(this.queryStats.totalQueries, 1)
      if (slowQueryRate > 0.1) {
        issues.push(`High slow query rate: ${(slowQueryRate * 100).toFixed(2)}%`)
      }

    } catch (error) {
      issues.push('Database connection failed')
      logger.error('Database health check failed', error as Error)
    }

    return {
      healthy: issues.length === 0,
      issues,
    }
  }

  /**
   * Get detailed connection pool info (PostgreSQL specific)
   */
  async getConnectionPoolInfo(): Promise<any> {
    try {
      const result = await prisma.$queryRaw`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity
        WHERE datname = current_database()
      `
      return result
    } catch (error) {
      logger.error('Failed to get connection pool info', error as Error)
      return null
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
    logger.info('Database monitoring shutdown')
  }
}

// Singleton instance
export const dbMonitor = new DatabaseMonitor()
