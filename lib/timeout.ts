/**
 * Utility functions for adding timeouts to async operations
 */

/**
 * Wrap a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param errorMessage Custom error message for timeout
 * @returns Promise that rejects if timeout is exceeded
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ])
}

/**
 * Database query timeout presets
 */
export const DB_TIMEOUTS = {
  // Fast queries (simple lookups)
  FAST: 3000, // 3 seconds
  
  // Medium queries (with joins, but not too complex)
  MEDIUM: 10000, // 10 seconds
  
  // Slow queries (complex aggregations, multiple joins)
  SLOW: 30000, // 30 seconds
  
  // Very slow operations (bulk updates, migrations)
  VERY_SLOW: 60000, // 60 seconds
}

/**
 * Wrap a database query with appropriate timeout
 */
export function withDbTimeout<T>(
  promise: Promise<T>,
  timeout: number = DB_TIMEOUTS.MEDIUM
): Promise<T> {
  return withTimeout(promise, timeout, `Database query timed out after ${timeout}ms`)
}
