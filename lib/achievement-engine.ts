import { prisma } from './db'
import { Prisma } from '@/prisma/client'
import { soleWinnerSql } from './server/sole-wins'
import { getUserStatsDashboard } from './user-stats-dashboard'
import { ACHIEVEMENTS, type AchievementDefinition } from './achievements'
import { createInAppNotification } from './in-app-notifications'
import { sendPushNotification } from './push-send'
import { logger, apiLogger } from './logger'

const WIN_STREAK_TARGET = 5
const VETERAN_GAMES_TARGET = 50
const CHAMPION_WINS_TARGET = 100
const GAME_EXPLORER_TYPES_TARGET = 3
const SOCIAL_BUTTERFLY_FRIENDS_TARGET = 10
const SPEED_DEMON_MAX_SECONDS = 120

interface AchievementCheckContext {
  totalGames: number
  wins: number
  longestWinStreak: number
  distinctGameTypesPlayed: number
  distinctFriendsPlayedWith: number
  hasWinUnderSpeedLimit: boolean
}

async function countDistinctFriendsPlayedWith(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT other."userId")::bigint AS count
    FROM "Players" p
    JOIN "Games" g ON g.id = p."gameId"
    JOIN "Players" other ON other."gameId" = g.id AND other."userId" != p."userId"
    JOIN "Friendships" f ON
      (f."user1Id" = p."userId" AND f."user2Id" = other."userId") OR
      (f."user2Id" = p."userId" AND f."user1Id" = other."userId")
    WHERE p."userId" = ${userId}
      AND g.status IN ('finished', 'abandoned', 'cancelled')
  `)
  return Number(rows[0]?.count ?? 0)
}

async function hasWinUnderSeconds(userId: string, maxSeconds: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "Players" p
      JOIN "Games" g ON g.id = p."gameId"
      WHERE p."userId" = ${userId}
        AND ${soleWinnerSql('p')}
        AND g.status = 'finished'
        AND EXTRACT(EPOCH FROM (g."updatedAt" - g."createdAt")) < ${maxSeconds}
    ) AS exists
  `)
  return rows[0]?.exists ?? false
}

async function buildAchievementCheckContext(userId: string): Promise<AchievementCheckContext> {
  const [dashboard, distinctFriendsPlayedWith, hasWinUnderSpeedLimit] = await Promise.all([
    getUserStatsDashboard(prisma, userId),
    countDistinctFriendsPlayedWith(userId),
    hasWinUnderSeconds(userId, SPEED_DEMON_MAX_SECONDS),
  ])

  return {
    totalGames: dashboard.overall.totalGames,
    wins: dashboard.overall.wins,
    longestWinStreak: dashboard.overall.longestWinStreak,
    distinctGameTypesPlayed: dashboard.byGame.length,
    distinctFriendsPlayedWith,
    hasWinUnderSpeedLimit,
  }
}

/**
 * Whether `ctx` satisfies `key`'s unlock condition. `wins`/`longestWinStreak`/
 * `hasWinUnderSpeedLimit` only reflect games that write Players.isWinner —
 * currently yahtzee, tic_tac_toe, connect_four, memory, alias, and
 * rock_paper_scissors. Spy, Fake Artist, Liar's Party, Sketch & Guess, and
 * Telephone Doodle never set it (#729), so wins in those games don't count
 * toward first_win/on_a_roll/champion/speed_demon yet — re-running the
 * retroactive grant job once #729 lands will pick up anything missed.
 * veteran/game_explorer/social_butterfly don't depend on isWinner and are
 * accurate across all games today.
 */
function isAchievementUnlocked(key: string, ctx: AchievementCheckContext): boolean {
  switch (key) {
    case 'first_win':
      return ctx.wins >= 1
    case 'on_a_roll':
      return ctx.longestWinStreak >= WIN_STREAK_TARGET
    case 'veteran':
      return ctx.totalGames >= VETERAN_GAMES_TARGET
    case 'champion':
      return ctx.wins >= CHAMPION_WINS_TARGET
    case 'game_explorer':
      return ctx.distinctGameTypesPlayed >= GAME_EXPLORER_TYPES_TARGET
    case 'social_butterfly':
      return ctx.distinctFriendsPlayedWith >= SOCIAL_BUTTERFLY_FRIENDS_TARGET
    case 'speed_demon':
      return ctx.hasWinUnderSpeedLimit
    default:
      return false
  }
}

// Push/in-app payload text only — the client's own badge grid uses
// t('achievements.<key>.name'/'.description') instead. Matches how every
// other sendPushNotification() caller in this codebase hardcodes English
// text server-side rather than threading the recipient's locale through.
const ACHIEVEMENT_NOTIFICATION_NAMES: Record<string, string> = {
  first_win: 'First Win',
  on_a_roll: 'On a Roll',
  veteran: 'Veteran',
  champion: 'Champion',
  game_explorer: 'Game Explorer',
  social_butterfly: 'Social Butterfly',
  speed_demon: 'Speed Demon',
}

async function notifyAchievementUnlocked(userId: string, achievement: AchievementDefinition): Promise<void> {
  const name = ACHIEVEMENT_NOTIFICATION_NAMES[achievement.key] ?? achievement.key

  const inAppResult = await createInAppNotification({
    userId,
    type: 'achievement_unlocked',
    dedupeKey: `achievement:${achievement.key}`,
    payload: { achievementKey: achievement.key },
  })
  if ('duplicate' in inAppResult && inAppResult.duplicate) {
    return
  }
  await sendPushNotification(userId, {
    title: `You earned: ${name} ${achievement.icon}`,
    body: 'Tap to view your achievements',
    url: '/profile',
    tag: `achievement:${achievement.key}`,
  })
}

/**
 * Evaluates every not-yet-unlocked achievement for `userId` against current
 * stats and persists any newly met ones. Safe to call after every game
 * completion (cheap relative to a move — a handful of indexed queries) and
 * safe to call repeatedly (already-unlocked achievements are skipped).
 * Returns the newly unlocked achievements so the caller can decide whether/
 * how to surface them (this function already fires the unlock notification
 * itself, best-effort).
 */
export async function checkAndGrantAchievements(userId: string): Promise<AchievementDefinition[]> {
  const alreadyUnlocked = await prisma.userAchievements.findMany({
    where: { userId },
    select: { achievementKey: true },
  })
  const unlockedKeys = new Set(alreadyUnlocked.map((row) => row.achievementKey))

  const locked = ACHIEVEMENTS.filter((achievement) => !unlockedKeys.has(achievement.key))
  if (locked.length === 0) return []

  const ctx = await buildAchievementCheckContext(userId)
  const newlyUnlocked = locked.filter((achievement) => isAchievementUnlocked(achievement.key, ctx))
  if (newlyUnlocked.length === 0) return []

  await prisma.userAchievements.createMany({
    data: newlyUnlocked.map((achievement) => ({ userId, achievementKey: achievement.key })),
    skipDuplicates: true,
  })

  for (const achievement of newlyUnlocked) {
    try {
      await notifyAchievementUnlocked(userId, achievement)
    } catch (error) {
      logger.warn('Failed to send achievement-unlock notification', {
        userId,
        achievementKey: achievement.key,
        error: (error as Error).message,
      })
    }
  }

  return newlyUnlocked
}

interface FinishedGamePlayer {
  userId: string
  // Deliberately loose: each game route's Prisma `include` shape differs
  // (some don't fetch the `user.bot` relation at all, since bots are only
  // supported for a handful of game types) — cast defensively below instead
  // of forcing every caller's query to match one exact shape.
  user?: unknown
}

/**
 * Called from every game-completion route once a game reaches `finished`.
 * Checks each non-bot human player (bots don't have accounts to unlock
 * achievements on) and swallows failures — a missed achievement check must
 * never fail the move/action response that triggered it.
 */
/**
 * The one shared "did this write finish the game → run achievement checks"
 * gate (#759). Every game-completion call site used to hand-roll the same
 * `statusChanged && status === 'finished'` guard around
 * checkAchievementsForFinishedGame — centralizing it here means new call
 * sites (and any future change to when the check fires) are a one-line
 * edit. Only the transition INTO `finished` counts: `abandoned`/`cancelled`
 * games deliberately grant nothing, and repeat writes of an already
 * finished state must not re-check.
 */
export async function checkAchievementsOnStatusChange(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
  players: FinishedGamePlayer[],
  log: ReturnType<typeof apiLogger>
): Promise<void> {
  if (nextStatus !== 'finished' || previousStatus === nextStatus) return
  await checkAchievementsForFinishedGame(players, log)
}

export async function checkAchievementsForFinishedGame(
  players: FinishedGamePlayer[],
  log: ReturnType<typeof apiLogger>
): Promise<void> {
  const isBot = (player: FinishedGamePlayer): boolean =>
    Boolean((player.user as { bot?: unknown } | null | undefined)?.bot)
  const humanUserIds = players.filter((player) => !isBot(player)).map((player) => player.userId)

  await Promise.all(
    humanUserIds.map(async (userId) => {
      try {
        await checkAndGrantAchievements(userId)
      } catch (error) {
        log.warn('Failed to check achievements after game completion', {
          userId,
          error: (error as Error).message,
        })
      }
    })
  )
}
