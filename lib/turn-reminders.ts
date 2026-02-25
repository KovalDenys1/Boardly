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
  const idleCutoff = new Date(now.getTime() - idleMinutes * 60 * 1000)
  const recentSentCutoff = new Date(now.getTime() - rateLimitMinutes * 60 * 1000)
  const recentActiveCutoff = new Date(now.getTime() - recentActiveSkipMinutes * 60 * 1000)

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
  }

  const games = await prisma.games.findMany({
    where: {
      status: 'playing',
      abandonedAt: null,
      lastMoveAt: {
        lte: idleCutoff,
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
  })

  return result
}
