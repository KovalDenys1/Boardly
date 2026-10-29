/**
 * Accounts for e2e/friends-page.spec.ts, run as its own process for the same
 * reason as cleanup.ts: the Prisma client is ESM and Playwright's transpiler
 * loads it as CommonJS.
 *
 *   npx tsx e2e/support/friends-fixture.ts seed            -> prints JSON
 *   npx tsx e2e/support/friends-fixture.ts cleanup <ids..> -> deletes those users
 *
 * A verified account with a password and one pending request from a second
 * account. Both are deleted by id, never by name: boardly-dev is shared.
 */
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { describeTargetMismatch } from './database-target'

async function seed() {
  const run = randomBytes(4).toString('hex')
  const password = randomBytes(12).toString('base64url')
  const now = new Date()
  const account = (name: string, passwordHash: string | null) =>
    prisma.users.create({
      data: {
        email: `e2e-friends-${name}-${run}@example.invalid`,
        username: `E2E${name}${run}`,
        emailVerified: now,
        passwordHash,
        termsAcceptedAt: now,
        ageConfirmedAt: now,
        accountPreferences: { create: { onboardingCompletedAt: now } },
      },
      select: { id: true, email: true },
    })

  const viewer = await account('viewer', await hashPassword(password))
  const sender = await account('sender', null)
  await prisma.friendRequests.create({ data: { senderId: sender.id, receiverId: viewer.id } })

  process.stdout.write(JSON.stringify({ email: viewer.email, password, ids: [viewer.id, sender.id] }))
}

async function cleanup(ids: string[]) {
  const { count } = await prisma.users.deleteMany({ where: { id: { in: ids }, email: { startsWith: 'e2e-friends-' } } })
  process.stdout.write(`friends fixture: deleted ${count} account(s)`)
}

async function main() {
  const mismatch = describeTargetMismatch({
    baseUrl: process.env.E2E_BASE_URL,
    databaseUrl: process.env.DATABASE_URL,
  })
  if (mismatch) throw new Error(mismatch)

  const [mode, ...ids] = process.argv.slice(2)
  if (mode === 'seed') return seed()
  if (mode === 'cleanup') return cleanup(ids)
  throw new Error('usage: friends-fixture.ts seed | cleanup <ids..>')
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
