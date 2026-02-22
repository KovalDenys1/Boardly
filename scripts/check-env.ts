#!/usr/bin/env tsx
/**
 * Environment variables checker
 * Verifies required and optional environment variables are present.
 *
 * Flags:
 *   --quiet / --no-values   Do not print any env values or prefixes
 */

import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'

const args = new Set(process.argv.slice(2))
const quiet = args.has('--quiet') || args.has('--no-values')

const envPath = resolve(process.cwd(), '.env')
const envLocalPath = resolve(process.cwd(), '.env.local')

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

function formatValue(value: string, visibleChars: number) {
  if (quiet) {
    return '[set]'
  }

  if (value.length <= visibleChars) {
    return value
  }

  return `${value.substring(0, visibleChars)}...`
}

console.log('Checking environment configuration...\n')

if (existsSync(envPath)) {
  console.log('.env file found')
  dotenv.config({ path: envPath, override: true })
} else {
  console.log('.env file NOT found')
}

if (!existsSync(envPath) && existsSync(envLocalPath)) {
  console.log('Fallback: .env.local file found')
  dotenv.config({ path: envLocalPath, override: true })
}

console.log('\nRequired environment variables:\n')

let hasErrors = false

for (const { name, critical } of requiredVars) {
  const value = process.env[name]
  if (value) {
    console.log(`OK  ${name}: ${formatValue(value, 20)}`)
  } else {
    console.log(`ERR ${name}: NOT SET${critical ? ' (CRITICAL)' : ''}`)
    if (critical) {
      hasErrors = true
    }
  }
}

console.log('\nOptional environment variables:\n')

for (const name of optionalVars) {
  const value = process.env[name]
  if (value) {
    console.log(`OK  ${name}: ${formatValue(value, 30)}`)
  } else {
    console.log(`INF ${name}: not set`)
  }
}

console.log(`\n${'='.repeat(60)}`)

if (hasErrors) {
  console.log('\nERROR: Missing critical environment variables!')
  console.log('Please check your .env file and add missing variables.\n')
  process.exit(1)
}

console.log('\nAll critical environment variables are set!')
console.log('You can now run: npm run dev:all\n')
process.exit(0)

