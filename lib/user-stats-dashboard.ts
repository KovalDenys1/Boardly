import { Prisma } from '@/prisma/client'
import type { PrismaClient } from '@/prisma/client'
import type {
  UserByGameStats,
  UserStatsDashboard,
  UserTrendPoint,
} from '@/lib/stats-calculator'

interface GetUserStatsDashboardOptions {
  from?: Date | null
  to?: Date | null
}

type UserStatsQueryClient = Pick<PrismaClient, '$queryRaw'>

interface OverallRow {
  totalGames: number
  wins: number
  losses: number
  draws: number
  avgGameDurationMinutes: number
}

interface ByGameRow {
  gameType: string
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
  avgScore: number | null
  bestScore: number | null
  lastPlayed: Date | null
}

interface TrendRow {
  date: string
  gamesPlayed: number
  wins: number
}

interface StreakRow {
  currentWinStreak: number
  longestWinStreak: number
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function buildCreatedAtFilter(from?: Date | null, to?: Date | null): Prisma.Sql {
  const filters: Prisma.Sql[] = []

  if (from) {
    filters.push(Prisma.sql`g."createdAt" >= ${from}`)
  }

  if (to) {
    filters.push(Prisma.sql`g."createdAt" <= ${to}`)
  }

  if (filters.length === 0) {
    return Prisma.empty
  }

  return Prisma.sql`AND ${Prisma.join(filters, ' AND ')}`
}

function buildUserGamesCte(userId: string, options: GetUserStatsDashboardOptions): Prisma.Sql {
  const createdAtFilter = buildCreatedAtFilter(options.from, options.to)

  return Prisma.sql`
    WITH user_games AS (
      SELECT
        g.id,
        g."gameType",
        g."createdAt",
        g."updatedAt",
        p.score,
        p."finalScore",
        p."isWinner",
        CASE
          WHEN g.status <> 'finished' THEN NULL
          WHEN winners."winnerCount" = 0 THEN 'draw'
          WHEN p."isWinner" = true AND winners."winnerCount" > 1 THEN 'draw'
          WHEN p."isWinner" = true THEN 'win'
          ELSE 'loss'
        END AS outcome
      FROM "Games" g
      JOIN "Players" p
        ON p."gameId" = g.id
       AND p."userId" = ${userId}
      JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE winners."isWinner" = true)::int AS "winnerCount"
        FROM "Players" winners
        WHERE winners."gameId" = g.id
      ) winners ON TRUE
      WHERE g.status IN ('finished', 'abandoned', 'cancelled')
      ${createdAtFilter}
    )
  `
}

function normalizeOverallRow(row: OverallRow | undefined) {
  return {
    totalGames: toFiniteNumber(row?.totalGames),
    wins: toFiniteNumber(row?.wins),
    losses: toFiniteNumber(row?.losses),
    draws: toFiniteNumber(row?.draws),
    avgGameDurationMinutes: roundToOneDecimal(toFiniteNumber(row?.avgGameDurationMinutes)),
  }
}

function normalizeByGameRows(rows: ByGameRow[]): UserByGameStats[] {
  return rows.map((row) => {
    const gamesPlayed = toFiniteNumber(row.gamesPlayed)
    const wins = toFiniteNumber(row.wins)
    const losses = toFiniteNumber(row.losses)
    const draws = toFiniteNumber(row.draws)
    const denominator = wins + losses + draws

    return {
      gameType: row.gameType,
      gamesPlayed,
      wins,
      losses,
      draws,
      winRate: denominator > 0 ? roundToOneDecimal((wins / denominator) * 100) : 0,
      avgScore:
        row.avgScore === null || row.avgScore === undefined
          ? null
          : roundToOneDecimal(toFiniteNumber(row.avgScore)),
      bestScore:
        row.bestScore === null || row.bestScore === undefined
          ? null
          : toFiniteNumber(row.bestScore),
      lastPlayed: row.lastPlayed ? row.lastPlayed.toISOString() : null,
    }
  })
}

function normalizeTrendRows(rows: TrendRow[]): UserTrendPoint[] {
  return rows.map((row) => ({
    date: row.date,
    gamesPlayed: toFiniteNumber(row.gamesPlayed),
    wins: toFiniteNumber(row.wins),
  }))
}

export async function getUserStatsDashboard(
  client: UserStatsQueryClient,
  userId: string,
  options: GetUserStatsDashboardOptions = {}
): Promise<UserStatsDashboard> {
  const userGamesCte = buildUserGamesCte(userId, options)

  const [overallRows, byGameRows, trendRows, streakRows] = await Promise.all([
    client.$queryRaw<OverallRow[]>(Prisma.sql`
      ${userGamesCte}
      SELECT
        COUNT(*)::int AS "totalGames",
        COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
        COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses,
        COUNT(*) FILTER (WHERE outcome = 'draw')::int AS draws,
        COALESCE(
          ROUND(
            AVG(GREATEST(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")), 0))::numeric / 60,
            1
          )::double precision,
          0
        ) AS "avgGameDurationMinutes"
      FROM user_games
    `),
    client.$queryRaw<ByGameRow[]>(Prisma.sql`
      ${userGamesCte}
      SELECT
        "gameType",
        COUNT(*)::int AS "gamesPlayed",
        COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
        COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses,
        COUNT(*) FILTER (WHERE outcome = 'draw')::int AS draws,
        ROUND(AVG(COALESCE("finalScore", score))::numeric, 1)::double precision AS "avgScore",
        MAX(COALESCE("finalScore", score))::int AS "bestScore",
        MAX("updatedAt") AS "lastPlayed"
      FROM user_games
      GROUP BY "gameType"
      ORDER BY COUNT(*) DESC, "gameType" ASC
    `),
    client.$queryRaw<TrendRow[]>(Prisma.sql`
      ${userGamesCte}
      SELECT
        TO_CHAR(DATE("updatedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS "gamesPlayed",
        COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins
      FROM user_games
      GROUP BY DATE("updatedAt" AT TIME ZONE 'UTC')
      ORDER BY DATE("updatedAt" AT TIME ZONE 'UTC') ASC
    `),
    client.$queryRaw<StreakRow[]>(Prisma.sql`
      ${userGamesCte}
      , finished_games AS (
        SELECT
          id,
          "updatedAt",
          outcome,
          ROW_NUMBER() OVER (ORDER BY "updatedAt" ASC, id ASC) AS seq,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN outcome = 'win' THEN 1 ELSE 0 END
            ORDER BY "updatedAt" ASC, id ASC
          ) AS seq_by_group,
          ROW_NUMBER() OVER (ORDER BY "updatedAt" DESC, id DESC) AS rev_seq,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN outcome = 'win' THEN 1 ELSE 0 END
            ORDER BY "updatedAt" DESC, id DESC
          ) AS rev_seq_by_group
        FROM user_games
        WHERE outcome IS NOT NULL
      ),
      longest_streak AS (
        SELECT COALESCE(MAX(streak_length), 0)::int AS value
        FROM (
          SELECT COUNT(*)::int AS streak_length
          FROM finished_games
          WHERE outcome = 'win'
          GROUP BY seq - seq_by_group
        ) grouped
      ),
      current_streak AS (
        SELECT
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM finished_games
              WHERE rev_seq = 1 AND outcome = 'win'
            )
            THEN COALESCE((
              SELECT COUNT(*)::int
              FROM finished_games
              WHERE outcome = 'win'
                AND rev_seq - rev_seq_by_group = 0
            ), 0)
            ELSE 0
          END AS value
      )
      SELECT
        current_streak.value::int AS "currentWinStreak",
        longest_streak.value::int AS "longestWinStreak"
      FROM current_streak
      CROSS JOIN longest_streak
    `),
  ])

  const normalizedOverall = normalizeOverallRow(overallRows[0])
  const byGame = normalizeByGameRows(byGameRows)
  const trends = normalizeTrendRows(trendRows)
  const streaks = streakRows[0] ?? { currentWinStreak: 0, longestWinStreak: 0 }
  const outcomeDenominator =
    normalizedOverall.wins + normalizedOverall.losses + normalizedOverall.draws

  return {
    overall: {
      totalGames: normalizedOverall.totalGames,
      wins: normalizedOverall.wins,
      losses: normalizedOverall.losses,
      draws: normalizedOverall.draws,
      winRate:
        outcomeDenominator > 0
          ? roundToOneDecimal((normalizedOverall.wins / outcomeDenominator) * 100)
          : 0,
      avgGameDurationMinutes: normalizedOverall.avgGameDurationMinutes,
      favoriteGame: byGame[0]?.gameType ?? null,
      currentWinStreak: toFiniteNumber(streaks.currentWinStreak),
      longestWinStreak: toFiniteNumber(streaks.longestWinStreak),
    },
    byGame,
    trends,
    dateRange: {
      from: options.from?.toISOString() ?? null,
      to: options.to?.toISOString() ?? null,
    },
    generatedAt: new Date().toISOString(),
  }
}
