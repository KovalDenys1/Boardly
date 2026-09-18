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
  // Discord community server - see docs/DISCORD.md
  'FEEDBACK_DISCORD_WEBHOOK_URL',
  'OPS_ALERT_WEBHOOK_URL',
  'NEXT_PUBLIC_DISCORD_INVITE',
  'DISCORD_APPLICATION_ID',
  'DISCORD_INTERNAL_SECRET',
  // Web Push. All three or none — the public key is inlined into the client
  // bundle, so a deploy missing it hands every opt-in a permission prompt and
  // no subscription (#983).
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
]

const vapidVars = ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']

// A webhook URL carries its own token in the path and the internal secret is a
// secret, so these are reported as present without printing any of the value.
const neverPrintedVars = new Set([
  'FEEDBACK_DISCORD_WEBHOOK_URL',
  'OPS_ALERT_WEBHOOK_URL',
  'DISCORD_INTERNAL_SECRET',
  'VAPID_PRIVATE_KEY',
])

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
    const shown = neverPrintedVars.has(name) ? '[set]' : formatValue(value, 30)
    console.log(`OK  ${name}: ${shown}`)
  } else {
    console.log(`INF ${name}: not set`)
  }
}

const vapidSet = vapidVars.filter((name) => Boolean(process.env[name]))
if (vapidSet.length > 0 && vapidSet.length < vapidVars.length) {
  const missing = vapidVars.filter((name) => !process.env[name])
  console.log(`\nWARN Web Push is half-configured; missing: ${missing.join(', ')}`)
}

console.log(`\n${'='.repeat(60)}`)

if (hasErrors) {
  console.log('\nERROR: Missing critical environment variables!')
  console.log('Please check your .env file and add missing variables.\n')
  process.exit(1)
}

console.log('\nAll critical environment variables are set!')
console.log('You can now run: npm run dev\n')
process.exit(0)

