import { z } from 'zod'

/**
 * Environment Variables Validation
 * 
 * Validates that all required environment variables are set on startup.
 * This prevents runtime errors due to missing configuration.
 * 
 * Note: Uses console.* instead of logger because this runs before logger initialization
 */

// Define the schema for environment variables
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  
  // Authentication - Required for Next.js, optional for socket server
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL').optional(),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters').optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  
  // OAuth Providers - Optional
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Email Service - Optional but recommended for production
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  
  // Socket.IO
  NEXT_PUBLIC_SOCKET_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
  
  // Server Configuration
  HOSTNAME: z.string().default('0.0.0.0'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  
  // Security
  ALLOWED_ORIGINS: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

/**
 * Validate environment variables on startup
 * Throws an error if validation fails
 */
export function validateEnv(): Env {
  try {
    const env = envSchema.parse(process.env)
    
    // Additional custom validations
    if (env.NODE_ENV === 'production') {
      // In production, these should be set
      if (!env.RESEND_API_KEY) {
        console.warn('⚠️  RESEND_API_KEY not set. Email functionality will be disabled.')
      }
      
      if (!env.NEXT_PUBLIC_SOCKET_URL) {
        console.warn('⚠️  NEXT_PUBLIC_SOCKET_URL not set. Using default origin.')
      }
      
      if (!env.CORS_ORIGIN) {
        console.warn('⚠️  CORS_ORIGIN not set. Using NEXTAUTH_URL as origin.')
      }
    }
    
    // Check OAuth provider pairs
    if ((env.GITHUB_CLIENT_ID && !env.GITHUB_CLIENT_SECRET) || 
        (!env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)) {
      throw new Error('Both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together')
    }
    
    if ((env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) || 
        (!env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) {
      throw new Error('Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together')
    }
    
    return env
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:')
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
      throw new Error('Invalid environment configuration')
    }
    throw error
  }
}

/**
 * Get validated environment variables
 * Call this instead of accessing process.env directly
 */
let cachedEnv: Env | null = null

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv()
  }
  return cachedEnv
}

/**
 * Print environment configuration (with secrets masked)
 */
export function printEnvInfo(): void {
  const env = getEnv()
  
  console.log('🔧 Environment Configuration:')
  console.log(`  - NODE_ENV: ${env.NODE_ENV}`)
  console.log(`  - DATABASE_URL: ${maskSecret(env.DATABASE_URL)}`)
  
  if (env.NEXTAUTH_URL) {
    console.log(`  - NEXTAUTH_URL: ${env.NEXTAUTH_URL}`)
  }
  
  if (env.NEXTAUTH_SECRET) {
    console.log(`  - NEXTAUTH_SECRET: ${maskSecret(env.NEXTAUTH_SECRET)}`)
  }
  
  if (env.JWT_SECRET) {
    console.log(`  - JWT_SECRET: ${maskSecret(env.JWT_SECRET)}`)
  }
  
  if (env.GITHUB_CLIENT_ID) {
    console.log(`  - GitHub OAuth: ✅ Enabled`)
  }
  
  if (env.GOOGLE_CLIENT_ID) {
    console.log(`  - Google OAuth: ✅ Enabled`)
  }
  
  if (env.RESEND_API_KEY) {
    console.log(`  - Email Service: ✅ Enabled`)
  } else {
    console.log(`  - Email Service: ⚠️  Disabled`)
  }
  
  console.log(`  - Socket.IO URL: ${env.NEXT_PUBLIC_SOCKET_URL || 'Not set (using default)'}`)
  console.log(`  - CORS Origin: ${env.CORS_ORIGIN || 'Not set'}`)
  console.log(`  - Log Level: ${env.LOG_LEVEL || 'auto'}`)
}

/**
 * Mask sensitive data for logging
 */
function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '****'
  }
  return value.substring(0, 4) + '****' + value.substring(value.length - 4)
}
