// @ts-nocheck

import { runTurnReminderCycle } from '@/lib/turn-reminders'
import { prisma } from '@/lib/db'
import { sendTurnReminderEmail } from '@/lib/email'
import {
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
} from '@/lib/notification-preferences'
import {
  hasRecentSentNotification,
  recordNotificationDelivery,
} from '@/lib/notifications-log'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/email', () => ({
  sendTurnReminderEmail: jest.fn(),
}))

jest.mock('@/lib/notification-preferences', () => ({
  createNotificationUnsubscribeToken: jest.fn(),
  getNotificationPreferences: jest.fn(),
}))

jest.mock('@/lib/notifications-log', () => ({
  hasRecentSentNotification: jest.fn(),
  recordNotificationDelivery: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendTurnReminderEmail = sendTurnReminderEmail as jest.MockedFunction<typeof sendTurnReminderEmail>
const mockCreateUnsubscribeToken =
  createNotificationUnsubscribeToken as jest.MockedFunction<typeof createNotificationUnsubscribeToken>
const mockGetNotificationPreferences =
  getNotificationPreferences as jest.MockedFunction<typeof getNotificationPreferences>
const mockHasRecentSentNotification =
  hasRecentSentNotification as jest.MockedFunction<typeof hasRecentSentNotification>
const mockRecordNotificationDelivery =
  recordNotificationDelivery as jest.MockedFunction<typeof recordNotificationDelivery>

function buildGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    currentTurn: 1,
    lastMoveAt: new Date('2026-02-25T10:00:00.000Z'),
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      name: 'Ranked Lobby',
      gameType: 'chess',
    },
    players: [
      {
        userId: 'user-1',
        position: 0,
        user: {
          id: 'user-1',
          email: 'host@example.com',
          username: 'Host',
          isGuest: false,
          lastActiveAt: new Date('2026-02-25T09:00:00.000Z'),
          bot: null,
        },
      },
      {
        userId: 'user-2',
        position: 1,
        user: {
          id: 'user-2',
          email: 'friend@example.com',
          username: 'Friend',
          isGuest: false,
          lastActiveAt: new Date('2026-02-25T09:00:00.000Z'),
          bot: null,
        },
      },
    ],
    ...overrides,
  }
}

describe('runTurnReminderCycle', () => {
  const now = new Date('2026-02-25T10:30:00.000Z')

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.games.findMany.mockResolvedValue([])
    mockSendTurnReminderEmail.mockResolvedValue({ success: true })
    mockCreateUnsubscribeToken.mockReturnValue('token-123')
    mockGetNotificationPreferences.mockResolvedValue({
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: false,
    })
    mockHasRecentSentNotification.mockResolvedValue(false)
    mockRecordNotificationDelivery.mockResolvedValue(undefined)
  })

  it('sends a turn reminder for eligible current player', async () => {
    mockPrisma.games.findMany.mockResolvedValue([buildGame()])

    const result = await runTurnReminderCycle({
      now,
      baseUrl: 'http://localhost:3000',
      idleMinutes: 15,
      rateLimitMinutes: 60,
      recentActiveSkipMinutes: 10,
      batchLimit: 50,
    })

    expect(result.success).toBe(true)
    expect(result.scannedGames).toBe(1)
    expect(result.attempted).toBe(1)
    expect(result.sent).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.failed).toBe(0)

    expect(mockHasRecentSentNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        type: 'turn_reminder',
        dedupeKey: 'turn_reminder:game:game-1:recipient:user-2',
      })
    )

    expect(mockSendTurnReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'friend@example.com',
        lobbyName: 'Ranked Lobby',
        gameType: 'chess',
        lobbyUrl: 'http://localhost:3000/lobby/ABCD',
      })
    )

    expect(mockRecordNotificationDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        type: 'turn_reminder',
        status: 'sent',
        dedupeKey: 'turn_reminder:game:game-1:recipient:user-2',
      })
    )
  })

  it('skips sending when rate limit already has a recent sent reminder', async () => {
    mockPrisma.games.findMany.mockResolvedValue([buildGame()])
    mockHasRecentSentNotification.mockResolvedValue(true)

    const result = await runTurnReminderCycle({
      now,
      baseUrl: 'http://localhost:3000',
      idleMinutes: 15,
      rateLimitMinutes: 60,
      recentActiveSkipMinutes: 10,
    })

    expect(result.attempted).toBe(0)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockSendTurnReminderEmail).not.toHaveBeenCalled()
    expect(mockRecordNotificationDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        type: 'turn_reminder',
        status: 'skipped',
        reason: 'rate_limited_recent_send',
      })
    )
  })

  it('skips sending when turn reminders are disabled in preferences', async () => {
    mockPrisma.games.findMany.mockResolvedValue([buildGame()])
    mockGetNotificationPreferences.mockResolvedValue({
      gameInvites: true,
      turnReminders: false,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: false,
    })

    const result = await runTurnReminderCycle({
      now,
      baseUrl: 'http://localhost:3000',
      idleMinutes: 15,
      rateLimitMinutes: 60,
      recentActiveSkipMinutes: 10,
    })

    expect(result.attempted).toBe(0)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockSendTurnReminderEmail).not.toHaveBeenCalled()
    expect(mockRecordNotificationDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        type: 'turn_reminder',
        status: 'skipped',
        reason: 'turn_reminders_disabled',
      })
    )
  })
})
