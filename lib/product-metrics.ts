import { GameStatus, GameType } from '@prisma/client'
import { prisma } from '@/lib/db'

const DEFAULT_ANALYTICS_GAME_TYPES: string[] = [
  'yahtzee',
  'guess_the_spy',
  'tic_tac_toe',
  'rock_paper_scissors',
]

export interface ProductMetricsSummary {
  totalNewUsers: number
  d1RetentionPct: number
  d7RetentionPct: number
  lobbiesCreated: number
  lobbiesWithGameStart: number
  lobbyToGameStartPct: number
  gamesStarted: number
  gamesCompleted: number
  gameStartToCompletePct: number
  invitesSent: number
  invitesAccepted: number
  inviteConversionPct: number
}

export interface ProductMetricsDay {
  date: string
  newUsers: number
  lobbiesCreated: number
  lobbiesWithGameStart: number
  gamesStarted: number
  gamesCompleted: number
  invitesSent: number
  invitesAccepted: number
}

export interface ProductRetentionCohortDay {
  date: string
  newUsers: number
  d1Eligible: number
  d1Returned: number
  d1RetentionPct: number
  d7Eligible: number
  d7Returned: number
  d7RetentionPct: number
}

export interface ProductGameMetricsSummary {
  lobbiesCreated: number
  lobbiesWithGameStart: number
  lobbyToGameStartPct: number
  gamesStarted: number
  gamesCompleted: number
  gameStartToCompletePct: number
}

export interface ProductGameMetricsDay {
  date: string
  lobbiesCreated: number
  lobbiesWithGameStart: number
  gamesStarted: number
  gamesCompleted: number
}

export interface ProductGameMetrics {
  gameType: string
  summary: ProductGameMetricsSummary
  daily: ProductGameMetricsDay[]
}

export interface ProductMetricsDashboard {
  generatedAt: string
  rangeDays: number
  summary: ProductMetricsSummary
  daily: ProductMetricsDay[]
  cohorts: ProductRetentionCohortDay[]
  gameMetrics: ProductGameMetrics[]
  caveats: {
    retentionMethod: string
    gameCompletionMethod: string
    inviteConversionMethod: string
  }
}

function clampRangeDays(days: number): number {
  if (!Number.isFinite(days)) return 30
  return Math.min(120, Math.max(7, Math.floor(days)))
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function dateKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Number(((numerator / denominator) * 100).toFixed(1))
}

function createDailyBuckets(startDate: Date, rangeDays: number): Map<string, ProductMetricsDay> {
  const buckets = new Map<string, ProductMetricsDay>()
  for (let i = 0; i < rangeDays; i += 1) {
    const date = addUtcDays(startDate, i)
    const key = dateKeyUtc(date)
    buckets.set(key, {
      date: key,
      newUsers: 0,
      lobbiesCreated: 0,
      lobbiesWithGameStart: 0,
      gamesStarted: 0,
      gamesCompleted: 0,
      invitesSent: 0,
      invitesAccepted: 0,
    })
  }
  return buckets
}

function createGameDailyBuckets(startDate: Date, rangeDays: number): Map<string, ProductGameMetricsDay> {
  const buckets = new Map<string, ProductGameMetricsDay>()
  for (let i = 0; i < rangeDays; i += 1) {
    const date = addUtcDays(startDate, i)
    const key = dateKeyUtc(date)
    buckets.set(key, {
      date: key,
      lobbiesCreated: 0,
      lobbiesWithGameStart: 0,
      gamesStarted: 0,
      gamesCompleted: 0,
    })
  }
  return buckets
}

export async function getProductMetricsDashboard(rawRangeDays?: number): Promise<ProductMetricsDashboard> {
  const rangeDays = clampRangeDays(typeof rawRangeDays === 'number' ? rawRangeDays : 30)
  const now = new Date()
  const startDate = addUtcDays(startOfUtcDay(now), -(rangeDays - 1))

  const [users, lobbies, games, invites] = await Promise.all([
    prisma.users.findMany({
      where: {
        isGuest: false,
        createdAt: {
          gte: startDate,
          lte: now,
        },
      },
      select: {
        id: true,
        createdAt: true,
        lastActiveAt: true,
      },
    }),
    prisma.lobbies.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: now,
        },
      },
      select: {
        id: true,
        createdAt: true,
        gameType: true,
        games: {
          select: {
            status: true,
          },
        },
      },
    }),
    prisma.games.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: now,
        },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        gameType: true,
        status: true,
      },
    }),
    prisma.lobbyInvites.findMany({
      where: {
        sentAt: {
          gte: startDate,
          lte: now,
        },
      },
      select: {
        sentAt: true,
        acceptedAt: true,
      },
    }),
  ])

  const dailyBuckets = createDailyBuckets(startDate, rangeDays)
  const cohortBuckets = new Map<string, ProductRetentionCohortDay>()

  const gameTypes = new Set<string>(DEFAULT_ANALYTICS_GAME_TYPES)
  for (const lobby of lobbies) {
    if (lobby.gameType) {
      gameTypes.add(lobby.gameType)
    }
  }
  for (const game of games) {
    if (game.gameType) {
      gameTypes.add(game.gameType)
    }
  }

  const gameMetricBuckets = new Map<
    string,
    {
      summary: ProductGameMetricsSummary
      dailyBuckets: Map<string, ProductGameMetricsDay>
    }
  >()

  for (const gameType of gameTypes) {
    gameMetricBuckets.set(gameType, {
      summary: {
        lobbiesCreated: 0,
        lobbiesWithGameStart: 0,
        lobbyToGameStartPct: 0,
        gamesStarted: 0,
        gamesCompleted: 0,
        gameStartToCompletePct: 0,
      },
      dailyBuckets: createGameDailyBuckets(startDate, rangeDays),
    })
  }

  for (const [date, day] of dailyBuckets.entries()) {
    cohortBuckets.set(date, {
      date,
      newUsers: day.newUsers,
      d1Eligible: 0,
      d1Returned: 0,
      d1RetentionPct: 0,
      d7Eligible: 0,
      d7Returned: 0,
      d7RetentionPct: 0,
    })
  }

  let d1EligibleTotal = 0
  let d1ReturnedTotal = 0
  let d7EligibleTotal = 0
  let d7ReturnedTotal = 0

  for (const user of users) {
    const cohortDateKey = dateKeyUtc(user.createdAt)
    const dayBucket = dailyBuckets.get(cohortDateKey)
    const cohortBucket = cohortBuckets.get(cohortDateKey)
    if (dayBucket) {
      dayBucket.newUsers += 1
    }
    if (!cohortBucket) continue

    cohortBucket.newUsers += 1

    const d1DueAt = new Date(user.createdAt.getTime() + 24 * 60 * 60 * 1000)
    const d7DueAt = new Date(user.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    const lastActiveAt = user.lastActiveAt ? new Date(user.lastActiveAt) : null

    if (d1DueAt <= now) {
      cohortBucket.d1Eligible += 1
      d1EligibleTotal += 1
      if (lastActiveAt && lastActiveAt >= d1DueAt) {
        cohortBucket.d1Returned += 1
        d1ReturnedTotal += 1
      }
    }

    if (d7DueAt <= now) {
      cohortBucket.d7Eligible += 1
      d7EligibleTotal += 1
      if (lastActiveAt && lastActiveAt >= d7DueAt) {
        cohortBucket.d7Returned += 1
        d7ReturnedTotal += 1
      }
    }
  }

  const startedStatuses = new Set<GameStatus>(['playing', 'finished', 'abandoned'])
  let lobbiesWithGameStart = 0

  for (const lobby of lobbies) {
    const key = dateKeyUtc(lobby.createdAt)
    const dayBucket = dailyBuckets.get(key)
    if (!dayBucket) continue

    dayBucket.lobbiesCreated += 1
    const lobbyGameType = lobby.gameType || 'yahtzee'
    const perGameMetrics = gameMetricBuckets.get(lobbyGameType)
    if (perGameMetrics) {
      const perGameDayBucket = perGameMetrics.dailyBuckets.get(key)
      if (perGameDayBucket) {
        perGameDayBucket.lobbiesCreated += 1
      }
      perGameMetrics.summary.lobbiesCreated += 1
    }

    const hasStartedGame = lobby.games.some((game) => startedStatuses.has(game.status))
    if (hasStartedGame) {
      dayBucket.lobbiesWithGameStart += 1
      lobbiesWithGameStart += 1
      if (perGameMetrics) {
        const perGameDayBucket = perGameMetrics.dailyBuckets.get(key)
        if (perGameDayBucket) {
          perGameDayBucket.lobbiesWithGameStart += 1
        }
        perGameMetrics.summary.lobbiesWithGameStart += 1
      }
    }
  }

  let gamesStarted = 0
  let gamesCompleted = 0

  for (const game of games) {
    const gameType = (game.gameType as GameType | null) || 'yahtzee'
    const perGameMetrics = gameMetricBuckets.get(gameType)

    if (startedStatuses.has(game.status)) {
      gamesStarted += 1
      const startedKey = dateKeyUtc(game.createdAt)
      const startedDayBucket = dailyBuckets.get(startedKey)
      if (startedDayBucket) {
        startedDayBucket.gamesStarted += 1
      }
      if (perGameMetrics) {
        const perGameStartedDayBucket = perGameMetrics.dailyBuckets.get(startedKey)
        if (perGameStartedDayBucket) {
          perGameStartedDayBucket.gamesStarted += 1
        }
        perGameMetrics.summary.gamesStarted += 1
      }
    }

    if (game.status === 'finished') {
      gamesCompleted += 1
      const completedKey = dateKeyUtc(game.updatedAt)
      const completedDayBucket = dailyBuckets.get(completedKey)
      if (completedDayBucket) {
        completedDayBucket.gamesCompleted += 1
      }
      if (perGameMetrics) {
        const perGameCompletedDayBucket = perGameMetrics.dailyBuckets.get(completedKey)
        if (perGameCompletedDayBucket) {
          perGameCompletedDayBucket.gamesCompleted += 1
        }
        perGameMetrics.summary.gamesCompleted += 1
      }
    }
  }

  let invitesAccepted = 0
  for (const invite of invites) {
    const key = dateKeyUtc(invite.sentAt)
    const dayBucket = dailyBuckets.get(key)
    if (!dayBucket) continue

    dayBucket.invitesSent += 1
    if (invite.acceptedAt) {
      invitesAccepted += 1
      const acceptedKey = dateKeyUtc(invite.acceptedAt)
      const acceptedDayBucket = dailyBuckets.get(acceptedKey)
      if (acceptedDayBucket) {
        acceptedDayBucket.invitesAccepted += 1
      }
    }
  }

  const daily = Array.from(dailyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date))
  const cohorts = Array.from(cohortBuckets.values())
    .map((cohort) => ({
      ...cohort,
      d1RetentionPct: percent(cohort.d1Returned, cohort.d1Eligible),
      d7RetentionPct: percent(cohort.d7Returned, cohort.d7Eligible),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const gameOrder = new Map(DEFAULT_ANALYTICS_GAME_TYPES.map((gameType, index) => [gameType, index]))
  const gameMetrics = Array.from(gameMetricBuckets.entries())
    .map(([gameType, metrics]) => {
      const summary = {
        ...metrics.summary,
        lobbyToGameStartPct: percent(
          metrics.summary.lobbiesWithGameStart,
          metrics.summary.lobbiesCreated
        ),
        gameStartToCompletePct: percent(metrics.summary.gamesCompleted, metrics.summary.gamesStarted),
      }
      return {
        gameType,
        summary,
        daily: Array.from(metrics.dailyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date)),
      }
    })
    .sort((left, right) => {
      const leftOrder = gameOrder.get(left.gameType) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = gameOrder.get(right.gameType) ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return left.gameType.localeCompare(right.gameType)
    })

  const summary: ProductMetricsSummary = {
    totalNewUsers: users.length,
    d1RetentionPct: percent(d1ReturnedTotal, d1EligibleTotal),
    d7RetentionPct: percent(d7ReturnedTotal, d7EligibleTotal),
    lobbiesCreated: lobbies.length,
    lobbiesWithGameStart,
    lobbyToGameStartPct: percent(lobbiesWithGameStart, lobbies.length),
    gamesStarted,
    gamesCompleted,
    gameStartToCompletePct: percent(gamesCompleted, gamesStarted),
    invitesSent: invites.length,
    invitesAccepted,
    inviteConversionPct: percent(invitesAccepted, invites.length),
  }

  return {
    generatedAt: now.toISOString(),
    rangeDays,
    summary,
    daily,
    cohorts,
    gameMetrics,
    caveats: {
      retentionMethod:
        'D1/D7 are approximated from users.createdAt and users.lastActiveAt (returned at least once after +1/+7 days).',
      gameCompletionMethod:
        'Daily gamesCompleted are grouped by games.updatedAt for finished games (proxy for completion timestamp).',
      inviteConversionMethod:
        'Invite conversion = accepted invites / sent invites in selected period (accepted if invitee joined the lobby). Daily accepts are grouped by acceptedAt date.',
    },
  }
}
