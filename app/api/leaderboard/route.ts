import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { GameType } from '@/prisma/client'
import { fetchLeaderboardPage } from '@/lib/server/leaderboard'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const log = apiLogger('/api/leaderboard')

const VALID_GAME_TYPES = Object.values(GameType) as string[]

const querySchema = z.object({
  gameType: z
    .string()
    .optional()
    .refine((v) => !v || VALID_GAME_TYPES.includes(v), { message: 'Invalid gameType' }),
  period: z.enum(['all', '30d']).default('all'),
  page: z.coerce.number().int().min(0).default(0),
})

const apiLimiter = rateLimit(rateLimitPresets.api)

export async function GET(req: NextRequest) {
  const rateLimitResult = await apiLimiter(req)
  if (rateLimitResult) return rateLimitResult

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    gameType: searchParams.get('gameType') ?? undefined,
    period: searchParams.get('period') ?? undefined,
    page: searchParams.get('page') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 })
  }

  const { gameType, period, page } = parsed.data

  try {
    // The query itself lives in lib/server/leaderboard.ts, shared with the
    // server-rendered /leaderboard page (#922).
    const { entries, hasMore } = await fetchLeaderboardPage({ gameType: gameType || undefined, period, page })

    log.info('Leaderboard fetched', { gameType, period, page, count: entries.length })

    return NextResponse.json(
      { entries, hasMore },
      {
        headers: {
          // Short max-age so profile changes (username, avatar, premium badge) show up
          // quickly — was 300s/600s, which let stale data linger for up to ~15 min (#638).
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60',
        },
      }
    )
  } catch (err) {
    log.error('Leaderboard query failed', err as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
