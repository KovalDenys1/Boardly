import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { processNotificationEmailQueue } from '@/lib/notification-queue'
import { runTurnReminderCycle } from '@/lib/turn-reminders'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'

const log = apiLogger('GET /api/cron/game-ops')

type GameOpsTaskName = 'cleanup' | 'notifications' | 'turnReminders'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function getPrismaErrorCode(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code
  }
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function getPrismaErrorMeta(error: unknown): { table?: string; column?: string } | null {
  if (!error || typeof error !== 'object') return null
  const meta = (error as { meta?: unknown }).meta
  if (!meta || typeof meta !== 'object') return null

  const table = (meta as { table?: unknown }).table
  const column = (meta as { column?: unknown }).column
  return {
    table: typeof table === 'string' ? table : undefined,
    column: typeof column === 'string' ? column : undefined,
  }
}

function isRecoverableNotificationSchemaError(error: unknown): boolean {
  const code = getPrismaErrorCode(error)
  if (code !== 'P2021' && code !== 'P2022') {
    return false
  }

  const meta = getPrismaErrorMeta(error)
  const haystack = [
    meta?.table,
    meta?.column,
    getErrorMessage(error),
  ]
    .filter(Boolean)
    .join(' ')

  return haystack.includes('Notifications') || haystack.includes('NotificationPreferences')
}

function toSchemaDegradedTaskResult(task: GameOpsTaskName, error: unknown) {
  const meta = getPrismaErrorMeta(error)
  const code = getPrismaErrorCode(error)

  log.warn('Game ops cron task skipped due to notification schema mismatch', {
    task,
    code: code ?? 'unknown',
    table: meta?.table ?? null,
    column: meta?.column ?? null,
    message: getErrorMessage(error),
  })

  return {
    success: false,
    skippedDueToSchemaMismatch: true,
    reason: 'notification_schema_not_ready',
    code: code ?? undefined,
    table: meta?.table ?? undefined,
    column: meta?.column ?? undefined,
  }
}

async function handleCronRequest(request: NextRequest) {
  const authError = authorizeCronRequest(request)
  if (authError) return authError

  try {
    const baseUrl = new URL(request.url).origin

    const warnings: Array<{
      task: GameOpsTaskName
      kind: 'schema_mismatch' | 'execution_failed'
      code?: string
      table?: string
      column?: string
      message: string
    }> = []

    let cleanup: unknown
    try {
      cleanup = await cleanupStaleLobbiesAndGames()
    } catch (cleanupError) {
      warnings.push({
        task: 'cleanup',
        kind: 'execution_failed',
        message: getErrorMessage(cleanupError),
      })
      cleanup = {
        success: false,
        reason: 'cleanup_failed',
      }
      log.error('Game ops cleanup task failed', cleanupError as Error)
    }

    // Consolidated frequent cron to stay within Vercel limits.
    // Turn reminders are rate-limited per game and user.
    const [notificationsResult, turnRemindersResult] = await Promise.allSettled([
      processNotificationEmailQueue({ baseUrl }),
      runTurnReminderCycle({ baseUrl }),
    ])

    let notifications: unknown
    if (notificationsResult.status === 'fulfilled') {
      notifications = notificationsResult.value
    } else if (isRecoverableNotificationSchemaError(notificationsResult.reason)) {
      const degraded = toSchemaDegradedTaskResult('notifications', notificationsResult.reason)
      notifications = degraded
      warnings.push({
        task: 'notifications',
        kind: 'schema_mismatch',
        code: degraded.code,
        table: degraded.table,
        column: degraded.column,
        message: getErrorMessage(notificationsResult.reason),
      })
    } else {
      throw notificationsResult.reason
    }

    let turnReminders: unknown
    if (turnRemindersResult.status === 'fulfilled') {
      turnReminders = turnRemindersResult.value
    } else if (isRecoverableNotificationSchemaError(turnRemindersResult.reason)) {
      const degraded = toSchemaDegradedTaskResult('turnReminders', turnRemindersResult.reason)
      turnReminders = degraded
      warnings.push({
        task: 'turnReminders',
        kind: 'schema_mismatch',
        code: degraded.code,
        table: degraded.table,
        column: degraded.column,
        message: getErrorMessage(turnRemindersResult.reason),
      })
    } else {
      throw turnRemindersResult.reason
    }

    return NextResponse.json({
      cleanup,
      notifications,
      turnReminders,
      degraded: warnings.length > 0,
      warnings: warnings.length > 0 ? warnings : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Game ops cron failed', error as Error)
    return NextResponse.json(
      {
        error: 'Game ops cron failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request)
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
