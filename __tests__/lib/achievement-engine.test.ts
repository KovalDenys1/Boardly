// @ts-nocheck
import { checkAndGrantAchievements } from '@/lib/achievement-engine'
import { prisma } from '@/lib/db'
import { getUserStatsDashboard } from '@/lib/user-stats-dashboard'
import { createInAppNotification } from '@/lib/in-app-notifications'
import { sendPushNotification } from '@/lib/push-send'

jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    userAchievements: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/user-stats-dashboard', () => ({
  getUserStatsDashboard: jest.fn(),
}))

jest.mock('@/lib/in-app-notifications', () => ({
  createInAppNotification: jest.fn(),
}))

jest.mock('@/lib/push-send', () => ({
  sendPushNotification: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetUserStatsDashboard = getUserStatsDashboard as jest.MockedFunction<typeof getUserStatsDashboard>
const mockCreateInAppNotification = createInAppNotification as jest.MockedFunction<typeof createInAppNotification>
const mockSendPushNotification = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>

const baseDashboard = {
  overall: {
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    avgGameDurationMinutes: 0,
    favoriteGame: null,
    currentWinStreak: 0,
    longestWinStreak: 0,
  },
  byGame: [],
  trends: [],
  dateRange: { from: null, to: null },
  generatedAt: new Date().toISOString(),
}

describe('checkAndGrantAchievements', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.userAchievements.findMany.mockResolvedValue([])
    mockPrisma.userAchievements.createMany.mockResolvedValue({ count: 0 })
    mockGetUserStatsDashboard.mockResolvedValue(JSON.parse(JSON.stringify(baseDashboard)))
    mockCreateInAppNotification.mockResolvedValue({ created: true, id: 'notif-1' })
    // First call (inside countDistinctFriendsPlayedWith) then second
    // (inside hasWinUnderSeconds) — Promise.all starts them in this order.
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ count: 0n }])
      .mockResolvedValueOnce([{ exists: false }])
  })

  it('grants nothing when every achievement is already unlocked', async () => {
    mockPrisma.userAchievements.findMany.mockResolvedValue([
      { achievementKey: 'first_win' },
      { achievementKey: 'on_a_roll' },
      { achievementKey: 'veteran' },
      { achievementKey: 'champion' },
      { achievementKey: 'game_explorer' },
      { achievementKey: 'social_butterfly' },
      { achievementKey: 'speed_demon' },
    ])

    const result = await checkAndGrantAchievements('user-1')

    expect(result).toEqual([])
    expect(mockGetUserStatsDashboard).not.toHaveBeenCalled()
    expect(mockPrisma.userAchievements.createMany).not.toHaveBeenCalled()
  })

  it('grants first_win once the user has a win, and notifies', async () => {
    mockGetUserStatsDashboard.mockResolvedValue({
      ...JSON.parse(JSON.stringify(baseDashboard)),
      overall: { ...baseDashboard.overall, wins: 1, totalGames: 1 },
    })

    const result = await checkAndGrantAchievements('user-1')

    expect(result.map((a) => a.key)).toEqual(['first_win'])
    expect(mockPrisma.userAchievements.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', achievementKey: 'first_win' }],
      skipDuplicates: true,
    })
    expect(mockCreateInAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'achievement_unlocked', dedupeKey: 'achievement:first_win' })
    )
    expect(mockSendPushNotification).toHaveBeenCalledWith('user-1', expect.objectContaining({ tag: 'achievement:first_win' }))
  })

  it('does not send a duplicate push when the in-app notification was already created (dedupe hit)', async () => {
    mockGetUserStatsDashboard.mockResolvedValue({
      ...JSON.parse(JSON.stringify(baseDashboard)),
      overall: { ...baseDashboard.overall, wins: 1, totalGames: 1 },
    })
    mockCreateInAppNotification.mockResolvedValue({ created: false, id: 'notif-1', duplicate: true })

    await checkAndGrantAchievements('user-1')

    expect(mockSendPushNotification).not.toHaveBeenCalled()
  })

  it('does not re-grant an achievement the user already has, even if still met', async () => {
    mockPrisma.userAchievements.findMany.mockResolvedValue([{ achievementKey: 'first_win' }])
    mockGetUserStatsDashboard.mockResolvedValue({
      ...JSON.parse(JSON.stringify(baseDashboard)),
      overall: { ...baseDashboard.overall, wins: 5, totalGames: 5 },
    })

    const result = await checkAndGrantAchievements('user-1')

    expect(result.map((a) => a.key)).not.toContain('first_win')
  })

  it('grants multiple achievements met at once', async () => {
    mockGetUserStatsDashboard.mockResolvedValue({
      overall: { ...baseDashboard.overall, wins: 100, totalGames: 100, longestWinStreak: 6 },
      byGame: [{ gameType: 'yahtzee' }, { gameType: 'tic_tac_toe' }, { gameType: 'memory' }],
      trends: [],
      dateRange: { from: null, to: null },
      generatedAt: new Date().toISOString(),
    })

    const result = await checkAndGrantAchievements('user-1')

    expect(result.map((a) => a.key).sort()).toEqual(
      ['first_win', 'on_a_roll', 'veteran', 'champion', 'game_explorer'].sort()
    )
  })

  it('grants social_butterfly based on distinct friends played with', async () => {
    mockPrisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ count: 10n }]) // countDistinctFriendsPlayedWith
      .mockResolvedValueOnce([{ exists: false }]) // hasWinUnderSeconds

    const result = await checkAndGrantAchievements('user-1')

    expect(result.map((a) => a.key)).toEqual(['social_butterfly'])
  })

  it('grants speed_demon when a sub-2-minute win exists', async () => {
    mockPrisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ count: 0n }])
      .mockResolvedValueOnce([{ exists: true }])

    const result = await checkAndGrantAchievements('user-1')

    expect(result.map((a) => a.key)).toEqual(['speed_demon'])
  })

  it('counts only a sole win toward speed_demon: a shared first place is a draw (#1493)', async () => {
    await checkAndGrantAchievements('user-1')

    const speedQuery = mockPrisma.$queryRaw.mock.calls[1][0] as { sql: string }
    expect(speedQuery.sql).toMatch(/p\."isWinner" = true AND NOT EXISTS \(\s*SELECT 1 FROM "Players" other/)
    expect(speedQuery.sql).toContain('other."isWinner" = true AND other.id <> p.id')
  })

  it('does not throw when the notification step fails', async () => {
    mockGetUserStatsDashboard.mockResolvedValue({
      ...JSON.parse(JSON.stringify(baseDashboard)),
      overall: { ...baseDashboard.overall, wins: 1, totalGames: 1 },
    })
    mockCreateInAppNotification.mockRejectedValue(new Error('notification service down'))

    await expect(checkAndGrantAchievements('user-1')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'first_win' })])
    )
  })
})

describe('checkAchievementsOnStatusChange (#759)', () => {
  const makeLog = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
  const players = [
    { userId: 'human-1' },
    { userId: 'bot-1', user: { bot: { id: 'b1' } } },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.userAchievements.findMany.mockResolvedValue([])
    mockPrisma.userAchievements.createMany.mockResolvedValue({ count: 0 })
    mockPrisma.$queryRaw.mockResolvedValue([{ count: 0n }])
    mockGetUserStatsDashboard.mockResolvedValue(JSON.parse(JSON.stringify(baseDashboard)))
  })

  it('runs checks for humans (not bots) on the transition into finished', async () => {
    const { checkAchievementsOnStatusChange } = require('@/lib/achievement-engine')
    await checkAchievementsOnStatusChange('playing', 'finished', players, makeLog())
    // one stats-dashboard read per human player, none for the bot
    expect(mockGetUserStatsDashboard).toHaveBeenCalledTimes(1)
    expect(mockGetUserStatsDashboard).toHaveBeenCalledWith(expect.anything(), 'human-1')
  })

  it('does nothing when status did not change (repeat write of finished)', async () => {
    const { checkAchievementsOnStatusChange } = require('@/lib/achievement-engine')
    await checkAchievementsOnStatusChange('finished', 'finished', players, makeLog())
    expect(mockGetUserStatsDashboard).not.toHaveBeenCalled()
  })

  it('does nothing for transitions into abandoned or non-terminal statuses', async () => {
    const { checkAchievementsOnStatusChange } = require('@/lib/achievement-engine')
    await checkAchievementsOnStatusChange('playing', 'abandoned', players, makeLog())
    await checkAchievementsOnStatusChange('waiting', 'playing', players, makeLog())
    expect(mockGetUserStatsDashboard).not.toHaveBeenCalled()
  })
})
