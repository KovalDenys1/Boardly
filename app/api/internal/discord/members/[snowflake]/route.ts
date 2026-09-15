import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { authorizeDiscordInternalRequest } from '@/lib/discord/internal-auth'

const log = apiLogger('GET /api/internal/discord/members/[snowflake]')

// Discord snowflakes are 64-bit integers written in decimal: 17 digits from 2015, 19 today.
const SNOWFLAKE_PATTERN = /^\d{17,20}$/

// One bot, one IP: the preset's 60 per minute covers every /stats a small server can type.
const memberLookupLimiter = rateLimit(rateLimitPresets.api)

// Games that reached a terminal state, the same set `lib/user-stats-dashboard.ts` counts as
// `totalGames`, so the number in Discord matches the number on the profile page.
const COUNTED_GAME_STATUSES = ['finished', 'abandoned', 'cancelled'] as const

interface MemberLookupContext {
  params: Promise<{ snowflake: string }>
}

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

function unlinked(): NextResponse {
  return NextResponse.json({ linked: false }, { headers: NO_STORE_HEADERS })
}

/**
 * Who a Discord member is on Boardly, for the bot's `/stats` command.
 *
 * Reads `Accounts` with `provider = "discord"`; the snowflake is the `providerAccountId`
 * NextAuth stored at sign-in. Anyone whose `AccountPreferences.profileVisibility` is not
 * `public` reads exactly like someone who never linked, so the route leaks nothing the
 * public profile page would not show. The missing-preferences case is `public`, which is
 * the column default.
 */
export async function GET(request: NextRequest, context: MemberLookupContext) {
  const authError = authorizeDiscordInternalRequest(request)
  if (authError) return authError

  const rateLimitResponse = await memberLookupLimiter(request)
  if (rateLimitResponse) return rateLimitResponse

  const { snowflake } = await context.params
  if (!SNOWFLAKE_PATTERN.test(snowflake)) {
    return NextResponse.json({ error: 'Invalid Discord user id' }, { status: 400 })
  }

  try {
    const account = await prisma.accounts.findUnique({
      where: {
        provider_providerAccountId: { provider: 'discord', providerAccountId: snowflake },
      },
      select: {
        user: {
          select: {
            id: true,
            username: true,
            isGuest: true,
            suspended: true,
            premiumUntil: true,
            createdAt: true,
            accountPreferences: { select: { profileVisibility: true } },
          },
        },
      },
    })

    const user = account?.user
    if (!user || user.isGuest || user.suspended) return unlinked()

    const visibility = user.accountPreferences?.profileVisibility ?? 'public'
    if (visibility !== 'public') return unlinked()

    const gamesPlayed = await prisma.players.count({
      where: {
        userId: user.id,
        game: { status: { in: [...COUNTED_GAME_STATUSES] } },
      },
    })

    const isPremium = user.premiumUntil instanceof Date && user.premiumUntil > new Date()

    return NextResponse.json(
      {
        linked: true,
        username: user.username ?? null,
        gamesPlayed,
        isPremium,
        memberSince: user.createdAt.toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    log.error('Discord member lookup failed', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
