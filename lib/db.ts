import { PrismaClient } from '@prisma/client'
import { logger } from './logger'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure Prisma with connection pooling optimizations for Vercel serverless
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

// Add connection retry middleware for production (handles Supabase pooler timeouts)
if (process.env.NODE_ENV === 'production') {
  prisma.$use(async (params, next) => {
    const MAX_RETRIES = 2
    let retries = 0
    
    while (retries < MAX_RETRIES) {
      try {
        return await next(params)
      } catch (error) {
        // Type guard for Prisma errors with code property
        const isPrismaError = error && typeof error === 'object' && 'code' in error
        const errorCode = isPrismaError ? (error as { code: string }).code : null
        
        // Retry on connection errors (P1001, P1002, P1008, P1017)
        const isConnectionError = errorCode && ['P1001', 'P1002', 'P1008', 'P1017'].includes(errorCode)
        
        if (isConnectionError && retries < MAX_RETRIES - 1) {
          retries++
          // Exponential backoff: 100ms, then 300ms
          await new Promise(resolve => setTimeout(resolve, retries * 200))
          logger.warn(`[Prisma] Connection error, retry ${retries}/${MAX_RETRIES}`, { errorCode: error.code })
          continue
        }
        throw error
      }
    }
  })
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
