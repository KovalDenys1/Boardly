import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { Prisma, PrismaClient } from '@/prisma/client'
import { logger } from './logger'
import { DatabaseTimeoutError } from './database-errors'
import { dbMonitor } from './db-monitoring'

loadDatabaseEnv()

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

function loadDatabaseEnv() {
  const envLocalPath = resolve(process.cwd(), '.env.local')
  const envPath = resolve(process.cwd(), '.env')

  if (existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: false, quiet: true })
  }

  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true })
  }
}

function createPrismaClient() {
  const adapter = createPrismaAdapter()

  const resilienceExtension =
    process.env.NODE_ENV !== 'test'
      ? createQueryResilienceExtension()
      : Prisma.defineExtension({
          name: 'noop-query-resilience',
        })

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
    .$extends(resilienceExtension)
    .$extends(dbMonitor.createExtension())

  dbMonitor.attachClient(client)

  return client
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined
}

// Configure Prisma with connection pooling optimizations for Vercel serverless.
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

function getRuntimeDatabaseUrl(): string {
  const rawDatabaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL

  if (!rawDatabaseUrl) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set to initialize Prisma Client')
  }

  const caCertPath = resolveTlsCaCertPath(process.env.MCP_POSTGRES_CA_CERT_PATH)
  if (!caCertPath) {
    return rawDatabaseUrl
  }

  const databaseUrl = new URL(rawDatabaseUrl)

  if (!databaseUrl.searchParams.has('sslrootcert')) {
    databaseUrl.searchParams.set('sslrootcert', caCertPath)
  }

  databaseUrl.searchParams.set('sslmode', 'verify-full')

  return databaseUrl.toString()
}

function createPrismaAdapter() {
  const caCertPath = resolveTlsCaCertPath(process.env.MCP_POSTGRES_CA_CERT_PATH)
  const adapterConfig: ConstructorParameters<typeof PrismaPg>[0] = {
    connectionString: getRuntimeDatabaseUrl(),
  }

  if (caCertPath) {
    adapterConfig.ssl = {
      ca: readFileSync(caCertPath, 'utf8'),
      rejectUnauthorized: true,
    }
  }

  return new PrismaPg(adapterConfig)
}

function resolveTlsCaCertPath(rawPath: string | undefined): string | null {
  if (!rawPath) {
    return null
  }

  const fullPath = resolve(process.cwd(), rawPath)
  if (!existsSync(fullPath)) {
    logger.warn('[Prisma] Ignoring missing MCP_POSTGRES_CA_CERT_PATH', {
      configuredPath: rawPath,
      resolvedPath: fullPath,
    })
    return null
  }

  return realpathSync(fullPath)
}

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

function createQueryResilienceExtension() {
  return Prisma.defineExtension({
    name: 'query-resilience',
    query: {
      async $allOperations({ model, operation, args, query }) {
        const operationName = `${model ?? 'PrismaClient'}.${operation}`
        let lastError: unknown = null

        for (let attempt = 1; attempt <= DB_RETRY_MAX_ATTEMPTS; attempt++) {
          try {
            return await withTimeout(
              query(args),
              DB_QUERY_TIMEOUT_MS,
              operationName
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
                operation: operationName,
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
      },
    },
  })
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
