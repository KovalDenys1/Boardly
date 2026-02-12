import { PrismaClient } from '@prisma/client'
import { logger } from './logger'
import { DatabaseTimeoutError } from './database-errors'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const DEFAULT_DB_RETRY_MAX_ATTEMPTS = process.env.NODE_ENV === 'production' ? 3 : 2
const DEFAULT_DB_QUERY_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 8000 : 12000
const DB_RETRY_MAX_ATTEMPTS = parsePositiveInt(
  process.env.DB_RETRY_MAX_ATTEMPTS,
  DEFAULT_DB_RETRY_MAX_ATTEMPTS
)
const DB_QUERY_TIMEOUT_MS = parseNonNegativeInt(
  process.env.DB_QUERY_TIMEOUT_MS,
  DEFAULT_DB_QUERY_TIMEOUT_MS
)
const RETRYABLE_PRISMA_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])

// Configure Prisma with connection pooling optimizations for Vercel serverless
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

// Add query resilience middleware for non-test environments.
if (process.env.NODE_ENV !== 'test') {
  prisma.$use(async (params, next) => {
    const operation = `${params.model ?? 'PrismaClient'}.${params.action}`
    let lastError: unknown

    for (let attempt = 1; attempt <= DB_RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        return await withTimeout(
          next(params),
          DB_QUERY_TIMEOUT_MS,
          operation
        )
      } catch (error) {
        lastError = error
        const errorCode = getPrismaErrorCode(error)
        const shouldRetry =
          errorCode !== null &&
          RETRYABLE_PRISMA_ERROR_CODES.has(errorCode) &&
          attempt < DB_RETRY_MAX_ATTEMPTS

        if (shouldRetry) {
          const backoffMs = attempt * 200
          logger.warn('[Prisma] Transient error, retrying operation', {
            operation,
            attempt,
            maxAttempts: DB_RETRY_MAX_ATTEMPTS,
            errorCode,
            backoffMs,
          })
          await sleep(backoffMs)
          continue
        }

        throw error
      }
    }

    throw lastError
  })
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function getPrismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  if (timeoutMs <= 0) {
    return promise
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new DatabaseTimeoutError(timeoutMs, operation))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timeoutHandle)
        resolve(result)
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutHandle)
        reject(error)
      })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
