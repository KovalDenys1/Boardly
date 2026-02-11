#!/usr/bin/env tsx
/**
 * Environment Variables Checker
 * Run this script to verify all required environment variables are set
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
import { existsSync } from 'fs'

// Load environment files
const envPath = resolve(process.cwd(), '.env')
const envLocalPath = resolve(process.cwd(), '.env.local')

console.log('🔍 Checking environment configuration...\n')

// Check if .env exists (primary source)
if (existsSync(envPath)) {
  console.log('✅ .env file found')
  dotenv.config({ path: envPath, override: true })
} else {
  console.log('⚠️  .env file NOT found')
}

// Backward compatibility for older setups that still use .env.local
if (!existsSync(envPath) && existsSync(envLocalPath)) {
  console.log('ℹ️  Fallback: .env.local file found')
  dotenv.config({ path: envLocalPath, override: true })
}

console.log('\n📋 Required environment variables:\n')

const requiredVars = [
  { name: 'DATABASE_URL', critical: true },
  { name: 'NEXTAUTH_SECRET', critical: true },
  { name: 'NEXTAUTH_URL', critical: true },
]

const optionalVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'RESEND_API_KEY',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
]

let hasErrors = false

// Check required variables
requiredVars.forEach(({ name, critical }) => {
  const value = process.env[name]
  if (value) {
    console.log(`✅ ${name}: ${value.substring(0, 20)}...`)
  } else {
    console.log(`❌ ${name}: NOT SET ${critical ? '(CRITICAL)' : ''}`)
    if (critical) hasErrors = true
  }
})

console.log('\n📋 Optional environment variables:\n')

// Check optional variables
optionalVars.forEach(name => {
  const value = process.env[name]
  if (value) {
    console.log(`✅ ${name}: ${value.substring(0, 30)}...`)
  } else {
    console.log(`ℹ️  ${name}: not set`)
  }
})

console.log('\n' + '='.repeat(60))

if (hasErrors) {
  console.log('\n❌ ERROR: Missing critical environment variables!')
  console.log('Please check your .env file and add missing variables.\n')
  process.exit(1)
} else {
  console.log('\n✅ All critical environment variables are set!')
  console.log('You can now run: npm run dev:all\n')
  process.exit(0)
}
