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
  // Set by Vercel itself, never by hand and never in .env.example - they are listed
  // here because that is the only other place the docs audit accepts a declaration,
  // and #1054's gate reads them to decide whether an unreleased game may be started.
  // Absent locally, which is exactly what makes the ENABLE_* flags usable there.
  'VERCEL_ENV',
  'NEXT_PUBLIC_VERCEL_ENV',
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

// Extracts the Supabase project ref (e.g. "inmvbxfflqeblynpktay") from a Prisma
// database connection string. Never logs the string itself – only the ref, which
// also appears in the plaintext NEXT_PUBLIC_SUPABASE_URL, so it is not a secret.
function extractSupabaseProjectRefFromDatabaseUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    // Pooler connections (aws-0-<region>.pooler.supabase.com) carry the ref in
    // the username: postgres.<ref>
    const poolerMatch = url.username.match(/^postgres\.([a-z0-9]+)$/i)
    if (poolerMatch) {
      return poolerMatch[1].toLowerCase()
    }
    // Direct connections carry the ref in the hostname: db.<ref>.supabase.co
    const directMatch = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
    if (directMatch) {
      return directMatch[1].toLowerCase()
    }
    return null
  } catch {
    return null
  }
}

// Extracts the Supabase project ref from NEXT_PUBLIC_SUPABASE_URL
// (https://<ref>.supabase.co).
function extractSupabaseProjectRefFromClientUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)
    return match ? match[1].toLowerCase() : null
  } catch {
    return null
  }
}

// Issue #893: a Prisma database URL and the Supabase client URL that point at
// different projects is the wrong-database trap – each half looks correctly
// configured on its own (both "present", both parse as valid URLs), and
// nothing else catches app data (Prisma) and auth (Supabase client) landing on
// two different projects until something breaks at runtime. This turns
// "someone remembered to check" into "the tooling refuses to be silent".
function checkSupabaseProjectConsistency(): boolean {
  const supabaseClientUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseClientUrl) {
    console.log('INF NEXT_PUBLIC_SUPABASE_URL: not set (skipping cross-project check)')
    return false
  }

  const supabaseClientRef = extractSupabaseProjectRefFromClientUrl(supabaseClientUrl)
  if (!supabaseClientRef) {
    console.log('WARN NEXT_PUBLIC_SUPABASE_URL: could not parse a Supabase project ref from it')
    return false
  }

  let mismatch = false
  const prismaUrlVars = ['DATABASE_URL', 'DIRECT_URL']

  for (const name of prismaUrlVars) {
    const value = process.env[name]
    if (!value) {
      continue
    }

    const dbRef = extractSupabaseProjectRefFromDatabaseUrl(value)
    if (!dbRef) {
      console.log(`WARN ${name}: could not parse a Supabase project ref from it`)
      continue
    }

    if (dbRef !== supabaseClientRef) {
      console.log(
        `ERR  ${name} points at Supabase project "${dbRef}" but NEXT_PUBLIC_SUPABASE_URL ` +
          `points at "${supabaseClientRef}" (CRITICAL: database and auth client are on ` +
          `different Supabase projects)`
      )
      mismatch = true
    } else {
      console.log(`OK  ${name} and NEXT_PUBLIC_SUPABASE_URL both point at project "${dbRef}"`)
    }
  }

  return mismatch
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

console.log('\nCross-project consistency:\n')
if (checkSupabaseProjectConsistency()) {
  hasErrors = true
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

