jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findMany: jest.fn(),
    },
    lobbies: {
      findMany: jest.fn(),
    },
    games: {
      findMany: jest.fn(),
    },
    lobbyInvites: {
      findMany: jest.fn(),
    },
  },
}))

import { getProductMetricsDashboard } from '@/lib/product-metrics'
import { prisma } from '@/lib/db'

const prismaMock = prisma as unknown as {
  users: {
    findMany: jest.Mock
  }
  lobbies: {
    findMany: jest.Mock
  }
  games: {
    findMany: jest.Mock
  }
  lobbyInvites: {
    findMany: jest.Mock
  }
}

describe('getProductMetricsDashboard', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-16T12:00:00.000Z'))

    prismaMock.users.findMany.mockReset()
    prismaMock.lobbies.findMany.mockReset()
    prismaMock.games.findMany.mockReset()
    prismaMock.lobbyInvites.findMany.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('builds summary, daily funnel and cohort retention metrics from prisma data', async () => {
    prismaMock.users.findMany.mockResolvedValue([
      {
        id: 'u1',
        createdAt: new Date('2026-02-08T10:00:00.000Z'),
        lastActiveAt: new Date('2026-02-15T11:00:00.000Z'),
      },
      {
        id: 'u2',
        createdAt: new Date('2026-02-10T10:00:00.000Z'),
        lastActiveAt: new Date('2026-02-10T11:00:00.000Z'),
      },
      {
        id: 'u3',
        createdAt: new Date('2026-02-16T09:00:00.000Z'),
        lastActiveAt: new Date('2026-02-16T09:30:00.000Z'),
      },
    ])

    prismaMock.lobbies.findMany.mockResolvedValue([
      {
        id: 'l1',
        createdAt: new Date('2026-02-14T10:00:00.000Z'),
        gameType: 'tic_tac_toe',
        games: [{ status: 'waiting' }],
      },
      {
        id: 'l2',
        createdAt: new Date('2026-02-15T10:00:00.000Z'),
        gameType: 'tic_tac_toe',
        games: [{ status: 'playing' }],
      },
      {
        id: 'l3',
        createdAt: new Date('2026-02-16T10:00:00.000Z'),
        gameType: 'yahtzee',
        games: [{ status: 'finished' }],
      },
    ])

    prismaMock.games.findMany.mockResolvedValue([
      {
        id: 'g1',
        createdAt: new Date('2026-02-15T09:00:00.000Z'),
        updatedAt: new Date('2026-02-15T09:00:00.000Z'),
        gameType: 'tic_tac_toe',
        status: 'playing',
      },
      {
        id: 'g2',
        createdAt: new Date('2026-02-15T10:00:00.000Z'),
        updatedAt: new Date('2026-02-16T10:00:00.000Z'),
        gameType: 'tic_tac_toe',
        status: 'finished',
      },
      {
        id: 'g3',
        createdAt: new Date('2026-02-16T10:00:00.000Z'),
        updatedAt: new Date('2026-02-16T10:00:00.000Z'),
        gameType: 'yahtzee',
        status: 'cancelled',
      },
      {
        id: 'g4',
        createdAt: new Date('2026-02-16T11:00:00.000Z'),
        updatedAt: new Date('2026-02-16T11:00:00.000Z'),
        gameType: 'yahtzee',
        status: 'waiting',
      },
    ])

    prismaMock.lobbyInvites.findMany.mockResolvedValue([
      {
        sentAt: new Date('2026-02-15T12:00:00.000Z'),
        acceptedAt: new Date('2026-02-16T14:00:00.000Z'),
      },
      {
        sentAt: new Date('2026-02-15T16:00:00.000Z'),
        acceptedAt: null,
      },
      {
        sentAt: new Date('2026-02-16T09:00:00.000Z'),
        acceptedAt: new Date('2026-02-16T10:00:00.000Z'),
      },
    ])

    const dashboard = await getProductMetricsDashboard(30)

    expect(dashboard.rangeDays).toBe(30)
    expect(dashboard.summary).toEqual({
      totalNewUsers: 3,
      d1RetentionPct: 50,
      d7RetentionPct: 100,
      lobbiesCreated: 3,
      lobbiesWithGameStart: 2,
      lobbyToGameStartPct: 66.7,
      gamesStarted: 2,
      gamesCompleted: 1,
      gameStartToCompletePct: 50,
      rematchGames: 0,
      rematchRatePct: 0,
      abandonedGames: 0,
      abandonRatePct: 0,
      avgGameDurationSec: 86400,
      invitesSent: 3,
      invitesAccepted: 2,
      inviteConversionPct: 66.7,
    })

    expect(dashboard.daily).toHaveLength(30)

    const dailyFeb15 = dashboard.daily.find((row) => row.date === '2026-02-15')
    expect(dailyFeb15).toEqual({
      date: '2026-02-15',
      newUsers: 0,
      lobbiesCreated: 1,
      lobbiesWithGameStart: 1,
      gamesStarted: 2,
      gamesCompleted: 0,
      invitesSent: 2,
      invitesAccepted: 0,
    })

    const dailyFeb16 = dashboard.daily.find((row) => row.date === '2026-02-16')
    expect(dailyFeb16).toEqual({
      date: '2026-02-16',
      newUsers: 1,
      lobbiesCreated: 1,
      lobbiesWithGameStart: 1,
      gamesStarted: 0,
      gamesCompleted: 1,
      invitesSent: 1,
      invitesAccepted: 2,
    })

    const cohortFeb08 = dashboard.cohorts.find((row) => row.date === '2026-02-08')
    expect(cohortFeb08).toEqual({
      date: '2026-02-08',
      newUsers: 1,
      d1Eligible: 1,
      d1Returned: 1,
      d1RetentionPct: 100,
      d7Eligible: 1,
      d7Returned: 1,
      d7RetentionPct: 100,
    })

    const cohortFeb10 = dashboard.cohorts.find((row) => row.date === '2026-02-10')
    expect(cohortFeb10).toEqual({
      date: '2026-02-10',
      newUsers: 1,
      d1Eligible: 1,
      d1Returned: 0,
      d1RetentionPct: 0,
      d7Eligible: 0,
      d7Returned: 0,
      d7RetentionPct: 0,
    })

    expect(dashboard.gameMetrics).toHaveLength(4)

    const yahtzeeMetrics = dashboard.gameMetrics.find((metrics) => metrics.gameType === 'yahtzee')
    expect(yahtzeeMetrics?.summary).toEqual({
      lobbiesCreated: 1,
      lobbiesWithGameStart: 1,
      lobbyToGameStartPct: 100,
      gamesStarted: 0,
      gamesCompleted: 0,
      gameStartToCompletePct: 0,
      rematchGames: 0,
      rematchRatePct: 0,
      abandonedGames: 0,
      abandonRatePct: 0,
      avgGameDurationSec: 0,
    })

    const ticTacToeMetrics = dashboard.gameMetrics.find((metrics) => metrics.gameType === 'tic_tac_toe')
    expect(ticTacToeMetrics?.summary).toEqual({
      lobbiesCreated: 2,
      lobbiesWithGameStart: 1,
      lobbyToGameStartPct: 50,
      gamesStarted: 2,
      gamesCompleted: 1,
      gameStartToCompletePct: 50,
      rematchGames: 0,
      rematchRatePct: 0,
      abandonedGames: 0,
      abandonRatePct: 0,
      avgGameDurationSec: 86400,
    })

    const ticTacToeFeb15 = ticTacToeMetrics?.daily.find((row) => row.date === '2026-02-15')
    expect(ticTacToeFeb15).toEqual({
      date: '2026-02-15',
      lobbiesCreated: 1,
      lobbiesWithGameStart: 1,
      gamesStarted: 2,
      gamesCompleted: 0,
    })

    const guessTheSpyMetrics = dashboard.gameMetrics.find(
      (metrics) => metrics.gameType === 'guess_the_spy'
    )
    expect(guessTheSpyMetrics?.summary).toEqual({
      lobbiesCreated: 0,
      lobbiesWithGameStart: 0,
      lobbyToGameStartPct: 0,
      gamesStarted: 0,
      gamesCompleted: 0,
      gameStartToCompletePct: 0,
      rematchGames: 0,
      rematchRatePct: 0,
      abandonedGames: 0,
      abandonRatePct: 0,
      avgGameDurationSec: 0,
    })

    expect(prismaMock.users.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.lobbies.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.games.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.lobbyInvites.findMany).toHaveBeenCalledTimes(1)
  })

  it('clamps range days and returns zero metrics when data is empty', async () => {
    prismaMock.users.findMany.mockResolvedValue([])
    prismaMock.lobbies.findMany.mockResolvedValue([])
    prismaMock.games.findMany.mockResolvedValue([])
    prismaMock.lobbyInvites.findMany.mockResolvedValue([])

    const dashboard = await getProductMetricsDashboard(999)

    expect(dashboard.rangeDays).toBe(120)
    expect(dashboard.summary).toEqual({
      totalNewUsers: 0,
      d1RetentionPct: 0,
      d7RetentionPct: 0,
      lobbiesCreated: 0,
      lobbiesWithGameStart: 0,
      lobbyToGameStartPct: 0,
      gamesStarted: 0,
      gamesCompleted: 0,
      gameStartToCompletePct: 0,
      rematchGames: 0,
      rematchRatePct: 0,
      abandonedGames: 0,
      abandonRatePct: 0,
      avgGameDurationSec: 0,
      invitesSent: 0,
      invitesAccepted: 0,
      inviteConversionPct: 0,
    })

    expect(dashboard.daily).toHaveLength(120)
    expect(dashboard.cohorts).toHaveLength(120)
    expect(dashboard.gameMetrics).toHaveLength(4)
    expect(dashboard.caveats.retentionMethod).toContain('D1/D7')
    expect(dashboard.caveats.inviteConversionMethod).toContain('Invite conversion')
  })
})
