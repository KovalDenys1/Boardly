#!/usr/bin/env tsx
/**
 * Database Connection Test
 * Tests if the DATABASE_URL credentials are valid
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

const args = process.argv.slice(2)
const argSet = new Set(args)
const verbose = argSet.has('--verbose') || argSet.has('-v')
const showHelp = argSet.has('--help') || argSet.has('-h')
const unsupportedArgs = args.filter((arg) => !['--verbose', '-v', '--help', '-h'].includes(arg))

if (unsupportedArgs.length > 0) {
  console.error(`Unknown argument(s): ${unsupportedArgs.join(', ')}`)
  console.error('Use --help to see available options.\n')
  process.exit(1)
}

if (showHelp) {
  console.log('Database Connection Test')
  console.log('')
  console.log('Usage:')
  console.log('  tsx scripts/test-db-connection.ts [--verbose]')
  console.log('')
  console.log('Options:')
  console.log('  --verbose, -v  Show non-secret connection target fields (user/host/port/database)')
  console.log('  --help, -h     Show this help message')
  console.log('')
  console.log('Default output is safe-by-default and redacts connection identifiers.')
  process.exit(0)
}

// Load environment files
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true })
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

console.log('🔍 Testing database connection...\n')

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in environment variables')
  console.error('Please check your .env file\n')
  process.exit(1)
}

function printConnectionDiagnostics(databaseUrl: string, isVerbose: boolean) {
  let parsed: URL

  try {
    parsed = new URL(databaseUrl)
  } catch {
    console.log('📋 Database connection diagnostics:')
    if (isVerbose) {
      console.log('  URL: [unparseable DATABASE_URL value]')
      console.log('  Password: [redacted]')
    } else {
      console.log('  URL: [redacted]')
      console.log('  Details hidden by default (use --verbose for local debugging)')
    }
    console.log()
    return
  }

  const protocol = parsed.protocol.replace(':', '')
  const databaseName = parsed.pathname.replace(/^\/+/, '') || '(none)'
  const sslMode = parsed.searchParams.get('sslmode')

  console.log('📋 Database connection diagnostics:')
  console.log(`  Protocol: ${protocol || 'unknown'}`)
  console.log(`  SSL mode: ${sslMode ?? '[not set]'}`)

  if (isVerbose) {
    console.log('  Verbose mode: ON (local debugging)')
    console.log(`  User: ${parsed.username || '[none]'}`)
    console.log('  Password: [redacted]')
    console.log(`  Host: ${parsed.hostname || '[none]'}`)
    console.log(`  Port: ${parsed.port || '[default]'}`)
    console.log(`  Database: ${databaseName}`)
  } else {
    console.log('  User: [redacted]')
    console.log('  Password: [redacted]')
    console.log('  Host: [redacted]')
    console.log('  Port: [redacted]')
    console.log('  Database: [redacted]')
    console.log('  Tip: rerun with --verbose for local-only debugging details')
  }

  console.log()
}

// Show connection details (safe-by-default)
const dbUrl = process.env.DATABASE_URL
printConnectionDiagnostics(dbUrl, verbose)

// Try to connect
async function testConnection() {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient({
      log: ['error', 'warn'],
    })

    console.log('⏳ Attempting to connect to database...')
    
    // Test connection with a simple query
    await prisma.$queryRaw`SELECT 1 as test`
    
    console.log('✅ Database connection successful!')
    console.log('✅ Credentials are valid\n')
    
    await prisma.$disconnect()
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Database connection failed!\n')
    
    if (error.code === 'P1001') {
      console.error('Error: Cannot reach database server')
      console.error('Check if the host/port are correct\n')
    } else if (error.code === 'P1002') {
      console.error('Error: Connection timeout')
      console.error('The database server is not responding\n')
    } else if (error.message.includes('Authentication failed')) {
      console.error('Error: Invalid credentials')
      console.error('The username or password is incorrect\n')
      console.error('📝 To fix this:')
      console.error('1. Go to Supabase Dashboard: https://app.supabase.com')
      console.error('2. Navigate to: Project Settings → Database → Connection String')
      console.error('3. Copy the "Connection pooling" string (port 6543)')
      console.error('4. Update DATABASE_URL in .env')
      console.error('5. Make sure to use the actual password (not [YOUR-PASSWORD])\n')
    } else {
      console.error('Error details:', error.message)
      console.error()
    }
    
    process.exit(1)
  }
}

testConnection()
