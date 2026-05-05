import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma, GameType } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const log = apiLogger('/api/leaderboard')

const VALID_GAME_TYPES = Object.values(GameType) as string[]
const MIN_GAMES = 10
const PAGE_SIZE = 50

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
  const since = period === '30d' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : null

  // Build optional SQL clauses with proper parameterization
  const gameTypeClause = gameType != null
    ? Prisma.sql`AND g."gameType" = ${gameType}::"GameType"`
    : Prisma.empty
  const sinceClause = since != null
    ? Prisma.sql`AND g."endedAt" >= ${since}::timestamptz`
    : Prisma.empty
  const offset = page * PAGE_SIZE

  try {
    // Win rate formula: wins / (wins + losses) — mirrors computeWinRate() in lib/stats-core.ts.
    // Outcome logic mirrors resolveOutcome() in lib/stats-core.ts.
    type LeaderboardRow = {
      userId: string
      username: string | null
      publicProfileId: string | null
      gamesPlayed: bigint
      wins: bigint
      losses: bigint
      winRate: number
    }

    // Raw SQL needed for FILTER aggregates and conditional clauses —
    // Prisma groupBy cannot express this query.
    const rows = await prisma.$queryRaw<LeaderboardRow[]>(Prisma.sql`
      WITH game_winner_counts AS (
        SELECT
          p."gameId",
          COUNT(*) FILTER (WHERE p."isWinner" = true) AS winner_count
        FROM "Players" p
        GROUP BY p."gameId"
      ),
      leaderboard_rows AS (
        SELECT
          u.id AS "userId",
          u.username,
          u."publicProfileId",
          p.id AS "playerId",
          (
            p."isWinner" = true
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(g."terminalMetadata"->'playerResults', '[]'::jsonb)) result
              WHERE result->>'userId' = p."userId"
                AND result->>'isWinner' = 'true'
            )
          ) AS "isWinner",
          (gwc.winner_count = 0) AS "isDraw"
        FROM "Players" p
        JOIN "Games" g   ON g.id = p."gameId"
        JOIN "Users" u   ON u.id = p."userId"
        JOIN game_winner_counts gwc ON gwc."gameId" = g.id
        LEFT JOIN "Bots" b ON b."userId" = u.id
        LEFT JOIN "AccountPreferences" ap ON ap."userId" = u.id
        WHERE g.status = 'finished'
          AND b.id IS NULL
          AND (ap."profileVisibility" IS NULL OR ap."profileVisibility" != 'private')
          ${gameTypeClause}
          ${sinceClause}
      )
      SELECT
        "userId",
        username,
        "publicProfileId",
        COUNT("playerId")                                                        AS "gamesPlayed",
        COUNT("playerId") FILTER (WHERE "isWinner" = true)                      AS wins,
        COUNT("playerId") FILTER (WHERE NOT "isWinner" AND NOT "isDraw")        AS losses,
        ROUND(
          COUNT("playerId") FILTER (WHERE "isWinner" = true)::numeric
          / NULLIF(
              COUNT("playerId") FILTER (WHERE "isWinner" = true)
              + COUNT("playerId") FILTER (WHERE NOT "isWinner" AND NOT "isDraw"),
              0
            ) * 100,
          1
        )::float                                                                 AS "winRate"
      FROM leaderboard_rows
      GROUP BY "userId", username, "publicProfileId"
      HAVING COUNT("playerId") >= ${MIN_GAMES}
      ORDER BY
        COUNT("playerId") FILTER (WHERE "isWinner" = true)::numeric
        / NULLIF(
            COUNT("playerId") FILTER (WHERE "isWinner" = true)
            + COUNT("playerId") FILTER (WHERE NOT "isWinner" AND NOT "isDraw"),
            0
          ) DESC NULLS LAST,
        COUNT("playerId") FILTER (WHERE "isWinner" = true) DESC
      LIMIT ${PAGE_SIZE}
      OFFSET ${offset}
    `)

    const entries = rows.map((r, i) => ({
      rank: page * PAGE_SIZE + i + 1,
      userId: r.userId,
      username: r.username ?? 'Player',
      publicProfileId: r.publicProfileId ?? null,
      gamesPlayed: Number(r.gamesPlayed),
      wins: Number(r.wins),
      winRate: r.winRate ?? 0,
    }))

    log.info('Leaderboard fetched', { gameType, period, page, count: entries.length })

    return NextResponse.json(
      { entries, hasMore: entries.length === PAGE_SIZE },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    )
  } catch (err) {
    log.error('Leaderboard query failed', err as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
