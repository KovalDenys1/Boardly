#!/usr/bin/env tsx
/**
 * Database Connection Test
 * Tests if the DATABASE_URL credentials are valid
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment files
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true })
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

console.log('🔍 Testing database connection...\n')

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in environment variables')
  console.error('Please check your .env file\n')
  process.exit(1)
}

// Show connection details (masked)
const dbUrl = process.env.DATABASE_URL
const urlPattern = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/
const match = dbUrl.match(urlPattern)

if (match) {
  console.log('📋 Database connection details:')
  console.log(`  User: ${match[1]}`)
  console.log(`  Password: ${match[2].substring(0, 4)}${'*'.repeat(match[2].length - 4)}`)
  console.log(`  Host: ${match[3]}`)
  console.log(`  Port: ${match[4]}`)
  console.log(`  Database: ${match[5].split('?')[0]}`)
  console.log()
}

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
