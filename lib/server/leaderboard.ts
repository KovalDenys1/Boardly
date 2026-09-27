import { unstable_cache } from 'next/cache'
import { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import {
  LEADERBOARD_PAGE_SIZE,
  type LeaderboardEntry,
  type LeaderboardPage,
  type LeaderboardPeriod,
} from '@/lib/leaderboard'
import {
  canViewProfile,
  effectiveProfileVisibility,
  type ProfileViewerRelation,
  type ProfileVisibilityValue,
} from '@/lib/public-profile'

// Require 10+ games on the combined leaderboard, but 1+ when filtering by
// a specific game type — otherwise players with mixed portfolios appear in
// the total but vanish when drilling down by type.
const MIN_GAMES_ALL = 10
const MIN_GAMES_FILTERED = 1

// Profile changes must not linger (#638).
const LEADERBOARD_CACHE_SECONDS = 20

type LeaderboardRow = {
  userId: string
  username: string | null
  publicProfileId: string | null
  avatarUrl: string | null
  image: string | null
  profileVisibility: ProfileVisibilityValue | null
  premiumUntil: Date | null
  gamesPlayed: bigint
  wins: bigint
  losses: bigint
  winRate: number
}

/**
 * A row as the shared cache holds it: the player's id, their premium badge, and the
 * visibility that decides who may see the badge. It never leaves this module as is;
 * `fetchLeaderboardPage` drops the id from every row and the badge for each viewer who
 * may not see the profile.
 */
type CachedLeaderboardEntry = LeaderboardEntry & {
  userId: string
  profileVisibility: ProfileVisibilityValue
}

type CachedLeaderboardPage = { entries: CachedLeaderboardEntry[]; hasMore: boolean }

export interface LeaderboardQuery {
  /** A validated `GameType` value, or undefined for all games. */
  gameType?: string
  period: LeaderboardPeriod
  page: number
}

/**
 * The one leaderboard query. `/api/leaderboard` serves it over HTTP and
 * `app/leaderboard/page.tsx` renders its first page into the HTML (#922).
 *
 * Every player with enough games is listed with their username, picture and results,
 * whatever their profile visibility (#1226): those are public everywhere. The premium
 * badge is profile content, so it is shown only to a viewer who may see the profile
 * (`canViewProfile`): everyone for a public one, friends for a friends-only one, the
 * owner alone for a private one. Anyone else gets `isPremium: false`. No row carries
 * the user id, which other routes accept (the player card, reports): the link goes
 * through `publicProfileId`, whose page applies the same rule.
 *
 * The aggregation goes through one 20 s data-cache entry per filter combination,
 * shared by every viewer, so a crawler hit, a visit and a filter change do not each
 * run it over every player and game. The per-viewer part runs after the cache, on
 * the page it returns: at most one friendship lookup, and only for a signed-in
 * viewer on a page that holds a friends-only profile.
 */
export async function fetchLeaderboardPage(
  query: LeaderboardQuery,
  viewerId: string | null
): Promise<LeaderboardPage> {
  const cached = await fetchCachedLeaderboardPage(query)
  return applyViewerVisibility(cached, viewerId)
}

function fetchCachedLeaderboardPage(query: LeaderboardQuery): Promise<CachedLeaderboardPage> {
  return unstable_cache(
    () => queryLeaderboardPage(query),
    // v2 (#1226): entries carry `profileVisibility` and include private profiles.
    // A new key, so an entry written by the old code is never read as the new shape.
    ['leaderboard-v2', query.gameType ?? '', query.period, String(query.page)],
    { revalidate: LEADERBOARD_CACHE_SECONDS }
  )()
}

async function applyViewerVisibility(
  page: CachedLeaderboardPage,
  viewerId: string | null
): Promise<LeaderboardPage> {
  const friendIds = await findFriendIdsAmong(
    viewerId,
    page.entries
      .filter((entry) => entry.profileVisibility === 'friends' && entry.userId !== viewerId)
      .map((entry) => entry.userId)
  )

  const entries = page.entries.map(({ userId, profileVisibility, ...entry }): LeaderboardEntry => {
    const relation: ProfileViewerRelation =
      viewerId !== null && userId === viewerId
        ? 'self'
        : friendIds.has(userId)
          ? 'friend'
          : 'other'
    return canViewProfile(profileVisibility, relation) ? entry : { ...entry, isPremium: false }
  })

  return { entries, hasMore: page.hasMore }
}

async function findFriendIdsAmong(viewerId: string | null, userIds: string[]): Promise<Set<string>> {
  if (!viewerId || userIds.length === 0) return new Set()

  const friendships = await prisma.friendships.findMany({
    where: {
      OR: [
        { user1Id: viewerId, user2Id: { in: userIds } },
        { user2Id: viewerId, user1Id: { in: userIds } },
      ],
    },
    select: { user1Id: true, user2Id: true },
  })

  return new Set(friendships.map((f) => (f.user1Id === viewerId ? f.user2Id : f.user1Id)))
}

async function queryLeaderboardPage({ gameType, period, page }: LeaderboardQuery): Promise<CachedLeaderboardPage> {
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
        ap."profileVisibility"::text AS "profileVisibility",
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
        ${gameTypeClause}
        ${sinceClause}
    )
    SELECT
      "userId",
      username,
      "publicProfileId",
      "avatarUrl",
      image,
      "profileVisibility",
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
    GROUP BY "userId", username, "publicProfileId", "avatarUrl", image, "premiumUntil", "profileVisibility"
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
  const entries = rows.map((r, i): CachedLeaderboardEntry => ({
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
    profileVisibility: effectiveProfileVisibility(r.profileVisibility),
  }))

  return { entries, hasMore: entries.length === LEADERBOARD_PAGE_SIZE }
}
