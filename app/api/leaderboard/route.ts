import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { GameType } from '@/prisma/client'
import { fetchLeaderboardPage } from '@/lib/server/leaderboard'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getOptionalViewerId } from '@/lib/session-user'

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
    const viewerId = await getOptionalViewerId(req)
    const { entries, hasMore } = await fetchLeaderboardPage(
      { gameType: gameType || undefined, period, page },
      viewerId
    )

    log.info('Leaderboard fetched', { gameType, period, page, count: entries.length })

    return NextResponse.json(
      { entries, hasMore },
      {
        headers: {
          // The answer depends on who asks: a friends-only player's picture is in it for
          // their friends and nobody else (#1226). A shared cache keyed on the URL alone
          // would hand one viewer's answer to the next, so the CDN must not keep it; it
          // was `public, s-maxage=20` before (#638). The aggregation behind it is still
          // cached for 20 s per filter combination in lib/server/leaderboard.ts.
          'Cache-Control': 'private, no-store',
        },
      }
    )
  } catch (err) {
    log.error('Leaderboard query failed', err as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
