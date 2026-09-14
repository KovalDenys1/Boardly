import { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import {
  LEADERBOARD_PAGE_SIZE,
  type LeaderboardPage,
  type LeaderboardPeriod,
} from '@/lib/leaderboard'

// Require 10+ games on the combined leaderboard, but 1+ when filtering by
// a specific game type — otherwise players with mixed portfolios appear in
// the total but vanish when drilling down by type.
const MIN_GAMES_ALL = 10
const MIN_GAMES_FILTERED = 1

type LeaderboardRow = {
  userId: string
  username: string | null
  publicProfileId: string | null
  avatarUrl: string | null
  image: string | null
  premiumUntil: Date | null
  gamesPlayed: bigint
  wins: bigint
  losses: bigint
  winRate: number
}

export interface LeaderboardQuery {
  /** A validated `GameType` value, or undefined for all games. */
  gameType?: string
  period: LeaderboardPeriod
  page: number
}

/**
 * The one leaderboard query. `/api/leaderboard` serves it over HTTP and
 * `app/leaderboard/page.tsx` renders its first page into the HTML (#922).
 */
export async function fetchLeaderboardPage({ gameType, period, page }: LeaderboardQuery): Promise<LeaderboardPage> {
  const since = period === '30d' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : null
  const minGames = gameType ? MIN_GAMES_FILTERED : MIN_GAMES_ALL

  // Build optional SQL clauses with proper parameterization
  const gameTypeClause = gameType != null
    ? Prisma.sql`AND g."gameType" = ${gameType}::"GameType"`
    : Prisma.empty
  const sinceClause = since != null
    ? Prisma.sql`AND g."endedAt" >= ${since}::timestamptz`
    : Prisma.empty
  const offset = page * LEADERBOARD_PAGE_SIZE

  // Win rate formula: wins / (wins + losses) — mirrors computeWinRate() in lib/stats-core.ts.
  // Outcome logic mirrors resolveOutcome() in lib/stats-core.ts.
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
        u."avatarUrl",
        u.image,
        u."premiumUntil",
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
        (gwc.winner_count = 0 OR (p."isWinner" = true AND gwc.winner_count > 1)) AS "isDraw"
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
      "avatarUrl",
      image,
      COUNT("playerId")                                                        AS "gamesPlayed",
      COUNT("playerId") FILTER (WHERE "isWinner" = true AND NOT "isDraw")      AS wins,
      COUNT("playerId") FILTER (WHERE NOT "isWinner" AND NOT "isDraw")        AS losses,
      ROUND(
        COUNT("playerId") FILTER (WHERE "isWinner" = true AND NOT "isDraw")::numeric
        / NULLIF(
            COUNT("playerId") FILTER (WHERE "isWinner" = true AND NOT "isDraw")
            + COUNT("playerId") FILTER (WHERE NOT "isWinner" AND NOT "isDraw"),
            0
          ) * 100,
        1
      )::float                                                                 AS "winRate"
    FROM leaderboard_rows
    GROUP BY "userId", username, "publicProfileId", "avatarUrl", image, "premiumUntil"
    HAVING COUNT("playerId") >= ${minGames}
    ORDER BY
      COUNT("playerId") FILTER (WHERE "isWinner" = true AND NOT "isDraw")::numeric
      / NULLIF(
          COUNT("playerId") FILTER (WHERE "isWinner" = true AND NOT "isDraw")
          + COUNT("playerId") FILTER (WHERE NOT "isWinner" AND NOT "isDraw"),
          0
        ) DESC NULLS LAST,
      COUNT("playerId") FILTER (WHERE "isWinner" = true AND NOT "isDraw") DESC
    LIMIT ${LEADERBOARD_PAGE_SIZE}
    OFFSET ${offset}
  `)

  const now = new Date()
  const entries = rows.map((r, i) => ({
    rank: page * LEADERBOARD_PAGE_SIZE + i + 1,
    userId: r.userId,
    username: r.username ?? 'Player',
    publicProfileId: r.publicProfileId ?? null,
    avatarUrl: r.avatarUrl ?? r.image ?? null,
    isPremium: !!r.premiumUntil && r.premiumUntil > now,
    gamesPlayed: Number(r.gamesPlayed),
    wins: Number(r.wins),
    losses: Number(r.losses),
    winRate: r.winRate ?? 0,
  }))

  return { entries, hasMore: entries.length === LEADERBOARD_PAGE_SIZE }
}
