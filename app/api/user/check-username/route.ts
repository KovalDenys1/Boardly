import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { ValidationError, withErrorHandler } from '@/lib/error-handler'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('GET /api/user/check-username')

async function checkUsernameHandler(req: NextRequest) {
  // Rate limiting
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')

  if (!username) {
    throw new ValidationError('Username parameter is required')
  }

  // Validate username format
  if (username.length < 3 || username.length > 20) {
    return NextResponse.json(
      {
        available: false,
        error: 'Username must be between 3 and 20 characters',
        suggestions: [],
      },
      { status: 200 }
    )
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json(
      {
        available: false,
        error: 'Username can only contain letters, numbers, and underscores',
        suggestions: [],
      },
      { status: 200 }
    )
  }

  // Check if username exists (case-insensitive).
  //
  // Guest rows are excluded on purpose (#1050). A guest display name is not an
  // account, and both writers that take a username - POST /api/auth/register and
  // PATCH /api/user/profile - now rename the guest out of the way rather than
  // refuse. Reporting a guest-held name as taken here would leave this endpoint
  // telling a visitor to pick something else while registration would have
  // accepted it, and since #1047 raised guest retention from 3 days to 90 that
  // wrong answer would stand for a quarter of a year.
  const existingUser = await prisma.users.findFirst({
    where: {
      username: {
        equals: username,
        mode: 'insensitive',
      },
      isGuest: false,
    },
    select: {
      id: true,
    },
  })

  const isAvailable = !existingUser

  // Generate suggestions if username is taken
  let suggestions: string[] = []
  if (!isAvailable) {
    suggestions = await generateUsernameSuggestions(username)
  }

  log.info('Username check completed', { username, isAvailable })

  return NextResponse.json({
    available: isAvailable,
    username,
    suggestions,
  })
}

export const GET = withErrorHandler(checkUsernameHandler)

const MAX_USERNAME_LENGTH = 20
const MAX_SUGGESTIONS = 3

/**
 * Builds the candidate pool in the same priority order the old implementation
 * used: `name1..name99`, then `name_1..name_99`, then one random 4-digit suffix.
 */
function buildSuggestionCandidates(baseUsername: string): string[] {
  const candidates: string[] = []

  for (let i = 1; i <= 99; i++) {
    candidates.push(`${baseUsername}${i}`)
  }
  for (let i = 1; i <= 99; i++) {
    candidates.push(`${baseUsername}_${i}`)
  }

  const randomNum = Math.floor(Math.random() * 9000) + 1000 // 1000-9999
  candidates.push(`${baseUsername}${randomNum}`.substring(0, MAX_USERNAME_LENGTH))

  return candidates.filter((candidate) => candidate.length <= MAX_USERNAME_LENGTH)
}

/**
 * Previously this ran one `findFirst` per candidate inside a loop — up to ~199
 * sequential, non-indexable (`mode: 'insensitive'`) queries for a single request
 * to a public, unauthenticated endpoint (#720). The rate limiter bounds requests,
 * not the work each one costs, so a handful of probes could pin the database.
 *
 * Resolve the whole candidate set in one round trip instead and pick locally.
 */
async function generateUsernameSuggestions(baseUsername: string): Promise<string[]> {
  const candidates = buildSuggestionCandidates(baseUsername)
  if (candidates.length === 0) return []

  // Every candidate starts with the base name, so one prefix query returns a
  // superset of the taken ones. Preferred over an `in` list because Prisma's
  // `mode: 'insensitive'` is only reliably applied to prefix/equality filters.
  // Bounded so a very common prefix can't return an unbounded result set; if it
  // truncates, the worst case is suggesting a name that turns out to be taken.
  // Guests excluded for the same reason as the availability check above: a name a
  // guest is holding is one a signup can still take, so suggesting it is correct.
  const taken = await prisma.users.findMany({
    where: { username: { startsWith: baseUsername, mode: 'insensitive' }, isGuest: false },
    select: { username: true },
    take: 1000,
  })

  const takenLower = new Set(
    taken
      .map((user) => user.username?.toLowerCase())
      .filter((username): username is string => Boolean(username))
  )

  const suggestions: string[] = []
  for (const candidate of candidates) {
    if (takenLower.has(candidate.toLowerCase())) continue
    suggestions.push(candidate)
    if (suggestions.length >= MAX_SUGGESTIONS) break
  }

  return suggestions
}
