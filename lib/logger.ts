/**
 * Logging utility for Boardly
 * 
 * Provides structured logging with different log levels.
 * In development: logs to console with colors
 * In production: logs as JSON for easy parsing by logging services
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  stack?: string
}

class Logger {
  private isDevelopment: boolean
  private minLevel: LogLevel

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development'
    this.minLevel = this.getMinLogLevel()
  }

  private getMinLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase()
    switch (envLevel) {
      case 'debug': return LogLevel.DEBUG
      case 'info': return LogLevel.INFO
      case 'warn': return LogLevel.WARN
      case 'error': return LogLevel.ERROR
      default: return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }

  private formatForConsole(entry: LogEntry): void {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    }
    const reset = '\x1b[0m'

    const color = colors[entry.level]
    const prefix = `${color}[${entry.level.toUpperCase()}]${reset}`
    const timestamp = new Date(entry.timestamp).toISOString()

    console.log(`${prefix} ${timestamp} - ${entry.message}`)
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log('  Context:', entry.context)
    }
    
    if (entry.stack) {
      console.log('  Stack:', entry.stack)
    }
  }

  private formatForProduction(entry: LogEntry): void {
    // Output as JSON for easy parsing by logging services (e.g., CloudWatch, Datadog)
    console.log(JSON.stringify(entry))
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
    if (!this.shouldLog(level)) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    }

    if (error) {
      const err = error instanceof Error ? error : undefined
      if (err) {
        entry.stack = err.stack
        if (!entry.context) {
          entry.context = {}
        }
        entry.context.error = {
          name: err.name,
          message: err.message,
        }
      } else {
        if (!entry.context) {
          entry.context = {}
        }
        entry.context.error = String(error)
      }
    }

    if (this.isDevelopment) {
      this.formatForConsole(entry)
    } else {
      this.formatForProduction(entry)
    }
  }

  /**
   * Log debug information (development only by default)
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * Log general information
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Log warnings
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * Log errors
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context, error)
  }

  /**
   * Create a child logger with preset context
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger()
    const originalLog = childLogger.log.bind(childLogger)
    
    childLogger.log = (level: LogLevel, message: string, context?: LogContext, error?: unknown) => {
      const mergedContext = { ...defaultContext, ...context }
      originalLog(level, message, mergedContext, error)
    }

    return childLogger
  }
}

// Export singleton instance
export const logger = new Logger()

// Export convenience function for creating child loggers
export function createLogger(context: LogContext): Logger {
  return logger.child(context)
}

// Export helper for API route logging
export function apiLogger(endpoint: string) {
  return logger.child({ endpoint, type: 'api' })
}

// Export helper for Socket.IO logging
export function socketLogger(event: string) {
  return logger.child({ event, type: 'socket' })
}

// Export helper for game logic logging
export function gameLogger(gameId: string, gameType: string) {
  return logger.child({ gameId, gameType, type: 'game' })
}
