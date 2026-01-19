// This file MUST be imported first before any other imports
// to ensure environment variables are loaded before Prisma initialization
import dotenv from 'dotenv'
import { resolve } from 'path'
import { existsSync } from 'fs'

const envLocalPath = resolve(process.cwd(), '.env.local')
const envPath = resolve(process.cwd(), '.env')

// Try to load .env.local first (local development)
if (existsSync(envLocalPath)) {
  const result = dotenv.config({ path: envLocalPath, override: true })
  if (result.error) {
    console.error('❌ Error loading .env.local:', result.error.message)
  } else {
    console.log('✅ Loaded .env.local')
  }
} else {
  console.warn('⚠️  .env.local not found, trying .env')
}

// Try to load .env as fallback
if (existsSync(envPath)) {
  const result = dotenv.config({ path: envPath })
  if (result.error) {
    console.error('❌ Error loading .env:', result.error.message)
  } else {
    console.log('✅ Loaded .env')
  }
}

// Verify critical environment variables
const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'NEXTAUTH_SECRET']
const missing = requiredVars.filter(v => !process.env[v])

if (missing.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:')
  missing.forEach(v => console.error(`   - ${v}`))
  console.error('\n📍 Current working directory:', process.cwd())
  console.error('📍 .env.local path:', envLocalPath)
  console.error('📍 .env path:', envPath)
  console.error('\n💡 Solution:')
  console.error('   1. Ensure .env.local exists in the project root')
  console.error('   2. Copy .env.example to .env.local if needed')
  console.error('   3. Set all required variables in .env.local')
  process.exit(1)
}

console.log('✅ All required environment variables loaded')
