import { prisma } from './db'
import { logger } from './logger'
import { sendTurnReminderEmail } from './email'
import {
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
} from './notification-preferences'
import {
  hasRecentSentNotification,
  recordNotificationDelivery,
} from './notifications-log'

type TurnReminderCycleOptions = {
  now?: Date
  baseUrl?: string
  idleMinutes?: number
  rateLimitMinutes?: number
  batchLimit?: number
  recentActiveSkipMinutes?: number
  maxGameIdleMinutes?: number
  maxUserInactiveDays?: number
}

export type TurnReminderCycleResult = {
  success: boolean
  scannedGames: number
  attempted: number
  sent: number
  skipped: number
  failed: number
  idleMinutes: number
  rateLimitMinutes: number
  batchLimit: number
  maxGameIdleMinutes: number
  maxUserInactiveDays: number
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  const raw = (baseUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').trim()
  return raw.replace(/\/+$/, '')
}

function getIdleMinutes(options: TurnReminderCycleOptions): number {
  return options.idleMinutes ?? parsePositiveInt(process.env.TURN_REMINDER_IDLE_MINUTES, 15)
}

function getRateLimitMinutes(options: TurnReminderCycleOptions): number {
  return options.rateLimitMinutes ?? parsePositiveInt(process.env.TURN_REMINDER_RATE_LIMIT_MINUTES, 60)
}

function getBatchLimit(options: TurnReminderCycleOptions): number {
  return options.batchLimit ?? parsePositiveInt(process.env.TURN_REMINDER_BATCH_LIMIT, 100)
}

function getRecentActiveSkipMinutes(options: TurnReminderCycleOptions): number {
  return options.recentActiveSkipMinutes ?? parsePositiveInt(process.env.TURN_REMINDER_RECENT_ACTIVE_MINUTES, 10)
}

function getMaxGameIdleMinutes(options: TurnReminderCycleOptions): number {
  return options.maxGameIdleMinutes ?? parsePositiveInt(process.env.TURN_REMINDER_MAX_GAME_IDLE_MINUTES, 120)
}

function getMaxUserInactiveDays(options: TurnReminderCycleOptions): number {
  return options.maxUserInactiveDays ?? parsePositiveInt(process.env.TURN_REMINDER_MAX_USER_INACTIVE_DAYS, 14)
}

function getDisplayGameType(gameType: string): string {
  return gameType.replace(/_/g, ' ')
}

export async function runTurnReminderCycle(
  options: TurnReminderCycleOptions = {}
): Promise<TurnReminderCycleResult> {
  const now = options.now ?? new Date()
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const idleMinutes = getIdleMinutes(options)
  const rateLimitMinutes = getRateLimitMinutes(options)
  const batchLimit = getBatchLimit(options)
  const recentActiveSkipMinutes = getRecentActiveSkipMinutes(options)
  const maxGameIdleMinutes = getMaxGameIdleMinutes(options)
  const maxUserInactiveDays = getMaxUserInactiveDays(options)
  const idleCutoff = new Date(now.getTime() - idleMinutes * 60 * 1000)
  const recentSentCutoff = new Date(now.getTime() - rateLimitMinutes * 60 * 1000)
  const recentActiveCutoff = new Date(now.getTime() - recentActiveSkipMinutes * 60 * 1000)
  const maxGameIdleCutoff = new Date(now.getTime() - maxGameIdleMinutes * 60 * 1000)
  const maxUserInactiveCutoff = new Date(now.getTime() - maxUserInactiveDays * 24 * 60 * 60 * 1000)

  const result: TurnReminderCycleResult = {
    success: true,
    scannedGames: 0,
    attempted: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    idleMinutes,
    rateLimitMinutes,
    batchLimit,
    maxGameIdleMinutes,
    maxUserInactiveDays,
  }
  const notifiedUsersInCycle = new Set<string>()
  const userRateLimitedInCycle = new Set<string>()

  const games = await prisma.games.findMany({
    where: {
      status: 'playing',
      abandonedAt: null,
      lobby: {
        isActive: true,
      },
      lastMoveAt: {
        lte: idleCutoff,
        gte: maxGameIdleCutoff,
      },
    },
    orderBy: {
      lastMoveAt: 'asc',
    },
    take: batchLimit,
    select: {
      id: true,
      currentTurn: true,
      lastMoveAt: true,
      lobby: {
        select: {
          id: true,
          code: true,
          name: true,
          gameType: true,
        },
      },
      players: {
        select: {
          userId: true,
          position: true,
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              isGuest: true,
              lastActiveAt: true,
              bot: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  })

  result.scannedGames = games.length

  for (const game of games) {
    const currentPlayer = game.players.find((player) => player.position === game.currentTurn)

    if (!currentPlayer?.user) {
      result.skipped += 1
      logger.warn('Turn reminder skipped: current player not found', {
        gameId: game.id,
        currentTurn: game.currentTurn,
      })
      continue
    }

    const recipient = currentPlayer.user
    if (recipient.isGuest || recipient.bot) {
      result.skipped += 1
      continue
    }

    const dedupeKey = `turn_reminder:game:${game.id}:recipient:${recipient.id}`
    const idleDurationMs = Math.max(0, now.getTime() - game.lastMoveAt.getTime())
    const payload = {
      gameId: game.id,
      lobbyId: game.lobby.id,
      lobbyCode: game.lobby.code,
      lobbyName: game.lobby.name,
      gameType: String(game.lobby.gameType),
      currentTurn: game.currentTurn,
      idleMinutes: Math.floor(idleDurationMs / 60000),
      lastMoveAt: game.lastMoveAt.toISOString(),
    }

    if (!recipient.email) {
      result.skipped += 1
      await recordNotificationDelivery({
        userId: recipient.id,
        type: 'turn_reminder',
        status: 'skipped',
        reason: 'missing_recipient_email',
        dedupeKey,
        payload,
      })
      continue
    }

    try {
      if (recipient.lastActiveAt && recipient.lastActiveAt >= recentActiveCutoff) {
        result.skipped += 1
        await recordNotificationDelivery({
          userId: recipient.id,
          type: 'turn_reminder',
          status: 'skipped',
          reason: 'recently_active',
          dedupeKey,
          payload: {
            ...payload,
            lastActiveAt: recipient.lastActiveAt.toISOString(),
          },
        })
        continue
      }

      if (recipient.lastActiveAt && recipient.lastActiveAt < maxUserInactiveCutoff) {
        result.skipped += 1
        await recordNotificationDelivery({
          userId: recipient.id,
          type: 'turn_reminder',
          status: 'skipped',
          reason: 'user_inactive_too_long',
          dedupeKey,
          payload: {
            ...payload,
            lastActiveAt: recipient.lastActiveAt.toISOString(),
            maxInactiveDays: maxUserInactiveDays,
          },
        })
        continue
      }

      const prefs = await getNotificationPreferences(recipient.id)
      if (prefs.unsubscribedAll || !prefs.turnReminders) {
        result.skipped += 1
        await recordNotificationDelivery({
          userId: recipient.id,
          type: 'turn_reminder',
          status: 'skipped',
          reason: prefs.unsubscribedAll ? 'unsubscribed_all' : 'turn_reminders_disabled',
          dedupeKey,
          payload,
        })
        continue
      }

      // Prevent bursty email spam when one user is "current turn" in many stale games.
      // We still track per-game dedupe below, but cap email sends to one per user per cycle.
      if (notifiedUsersInCycle.has(recipient.id)) {
        result.skipped += 1
        await recordNotificationDelivery({
          userId: recipient.id,
          type: 'turn_reminder',
          status: 'skipped',
          reason: 'user_already_notified_in_cycle',
          dedupeKey,
          payload,
        })
        continue
      }

      if (userRateLimitedInCycle.has(recipient.id)) {
        result.skipped += 1
        await recordNotificationDelivery({
          userId: recipient.id,
          type: 'turn_reminder',
          status: 'skipped',
          reason: 'user_rate_limited_recent_send',
          dedupeKey,
          payload,
        })
        continue
      }

      const wasRecentlySent = await hasRecentSentNotification({
        userId: recipient.id,
        type: 'turn_reminder',
        dedupeKey,
        since: recentSentCutoff,
      })

      if (wasRecentlySent) {
        result.skipped += 1
        await recordNotificationDelivery({
          userId: recipient.id,
          type: 'turn_reminder',
          status: 'skipped',
          reason: 'rate_limited_recent_send',
          dedupeKey,
          payload,
        })
        continue
      }

      const userHadRecentTurnReminder = await hasRecentSentNotification({
        userId: recipient.id,
        type: 'turn_reminder',
        since: recentSentCutoff,
      })

      if (userHadRecentTurnReminder) {
        userRateLimitedInCycle.add(recipient.id)
        result.skipped += 1
        await recordNotificationDelivery({
          userId: recipient.id,
          type: 'turn_reminder',
          status: 'skipped',
          reason: 'user_rate_limited_recent_send',
          dedupeKey,
          payload,
        })
        continue
      }

      result.attempted += 1

      const token = createNotificationUnsubscribeToken({
        userId: recipient.id,
        type: 'turnReminders',
      })
      const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
      const lobbyUrl = `${baseUrl}/lobby/${game.lobby.code}`

      const emailResult = await sendTurnReminderEmail({
        email: recipient.email,
        recipientName: recipient.username,
        lobbyName: game.lobby.name,
        gameType: getDisplayGameType(String(game.lobby.gameType)),
        lobbyUrl,
        unsubscribeUrl,
      })

      if (emailResult.success) {
        result.sent += 1
        notifiedUsersInCycle.add(recipient.id)
      } else {
        result.failed += 1
        result.success = false
      }

      await recordNotificationDelivery({
        userId: recipient.id,
        type: 'turn_reminder',
        status: emailResult.success ? 'sent' : 'failed',
        reason: emailResult.success ? undefined : 'email_send_failed',
        dedupeKey,
        payload: {
          ...payload,
          recipientEmail: recipient.email,
          providerError: emailResult.success ? undefined : emailResult.error,
        },
      })
    } catch (error) {
      result.failed += 1
      result.success = false

      await recordNotificationDelivery({
        userId: recipient.id,
        type: 'turn_reminder',
        status: 'failed',
        reason: 'turn_reminder_processing_error',
        dedupeKey,
        payload: {
          ...payload,
          recipientEmail: recipient.email,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })

      logger.error('Turn reminder processing failed', error as Error, {
        gameId: game.id,
        userId: recipient.id,
      })
    }
  }

  logger.info('Turn reminder cycle completed', {
    scannedGames: result.scannedGames,
    attempted: result.attempted,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    idleMinutes,
    rateLimitMinutes,
    batchLimit,
    maxGameIdleMinutes,
    maxUserInactiveDays,
  })

  return result
}
