import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  evaluateReliabilityAlerts,
  type ReliabilityAlertEvaluation,
  type ReliabilityAlertRuleStatus,
} from '@/lib/operational-metrics'

export interface ReliabilityAlertCycleOptions {
  windowMinutes?: number
  baselineDays?: number
  repeatMinutes?: number
  webhookUrl?: string
  runbookBaseUrl?: string
  dryRun?: boolean
}

export interface ReliabilityAlertCycleResult {
  evaluation: ReliabilityAlertEvaluation
  triggered: ReliabilityAlertRuleStatus[]
  resolved: ReliabilityAlertRuleStatus[]
  notificationsSent: number
  dryRun: boolean
}

function isMissingOperationalAlertStatesTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if (!('code' in error) || (error as { code?: unknown }).code !== 'P2021') return false

  const meta = (error as { meta?: { table?: unknown } }).meta
  return typeof meta?.table === 'string' && meta.table.includes('OperationalAlertStates')
}

function shouldNotifyAgain(lastNotifiedAt: Date | null, repeatMinutes: number): boolean {
  if (!lastNotifiedAt) {
    return true
  }

  const elapsedMs = Date.now() - lastNotifiedAt.getTime()
  return elapsedMs >= repeatMinutes * 60 * 1000
}

function buildRunbookUrl(path: string, runbookBaseUrl?: string): string {
  if (!runbookBaseUrl) {
    return path
  }

  try {
    return new URL(path, runbookBaseUrl).toString()
  } catch {
    return path
  }
}

function formatAlertMessage(params: {
  status: 'TRIGGERED' | 'RESOLVED'
  rule: ReliabilityAlertRuleStatus
  runbookBaseUrl?: string
  generatedAt: string
}): string {
  const { status, rule, runbookBaseUrl, generatedAt } = params
  const runbook = buildRunbookUrl(rule.runbookPath, runbookBaseUrl)
  const valueText =
    typeof rule.currentValue === 'number' && Number.isFinite(rule.currentValue)
      ? rule.currentValue.toFixed(2)
      : 'n/a'

  return [
    `[${status}] Boardly reliability alert`,
    `rule=${rule.alertKey}`,
    `severity=${rule.severity}`,
    `value=${valueText} ${rule.unit}`,
    `threshold=${rule.thresholdValue} ${rule.unit}`,
    `window=${rule.windowMinutes}m`,
    `summary=${rule.summary}`,
    `runbook=${runbook}`,
    `generated_at=${generatedAt}`,
  ].join('\n')
}

async function sendWebhookNotification(webhookUrl: string, message: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: message,
      content: message,
    }),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => '')
    throw new Error(`Webhook request failed with HTTP ${response.status}: ${responseText}`)
  }
}

export async function runReliabilityAlertCycle(
  options?: ReliabilityAlertCycleOptions
): Promise<ReliabilityAlertCycleResult> {
  const evaluation = await evaluateReliabilityAlerts(
    options?.windowMinutes,
    options?.baselineDays
  )
  const repeatMinutes =
    typeof options?.repeatMinutes === 'number' && Number.isFinite(options.repeatMinutes)
      ? Math.max(5, Math.floor(options.repeatMinutes))
      : 60
  const dryRun = options?.dryRun === true

  let states: Array<{
    alertKey: string
    isOpen: boolean
    lastNotifiedAt: Date | null
  }> = []
  let alertStatePersistenceAvailable = true

  try {
    states = await prisma.operationalAlertStates.findMany({
      where: {
        alertKey: {
          in: evaluation.rules.map((rule) => rule.alertKey),
        },
      },
      select: {
        alertKey: true,
        isOpen: true,
        lastNotifiedAt: true,
      },
    })
  } catch (error) {
    if (!isMissingOperationalAlertStatesTableError(error)) {
      throw error
    }
    alertStatePersistenceAvailable = false
  }
  const stateMap = new Map(states.map((state) => [state.alertKey, state]))

  const triggered: ReliabilityAlertRuleStatus[] = []
  const resolved: ReliabilityAlertRuleStatus[] = []

  if (!dryRun && alertStatePersistenceAvailable) {
    for (const rule of evaluation.rules) {
      const existing = stateMap.get(rule.alertKey)
      const numericValue =
        typeof rule.currentValue === 'number' && Number.isFinite(rule.currentValue)
          ? rule.currentValue
          : null

      if (rule.breached) {
        const shouldNotify =
          !existing?.isOpen ||
          shouldNotifyAgain(existing.lastNotifiedAt ?? null, repeatMinutes)

        if (shouldNotify) {
          triggered.push(rule)
        }

        await prisma.operationalAlertStates.upsert({
          where: { alertKey: rule.alertKey },
          create: {
            alertKey: rule.alertKey,
            isOpen: true,
            lastValue: numericValue,
            lastTriggeredAt: new Date(),
            lastNotifiedAt: shouldNotify ? new Date() : null,
          },
          update: {
            isOpen: true,
            lastValue: numericValue,
            lastTriggeredAt: new Date(),
            ...(shouldNotify ? { lastNotifiedAt: new Date() } : {}),
          },
        })

        continue
      }

      if (existing?.isOpen) {
        resolved.push(rule)
        await prisma.operationalAlertStates.update({
          where: { alertKey: rule.alertKey },
          data: {
            isOpen: false,
            lastValue: numericValue,
            lastResolvedAt: new Date(),
          },
        })
      }
    }
  } else {
    for (const rule of evaluation.rules) {
      if (rule.breached) {
        triggered.push(rule)
      }
    }
  }

  if (!dryRun && !alertStatePersistenceAvailable) {
    logger.warn('OperationalAlertStates table is missing; alert dedupe/state persistence is disabled')
  }

  let notificationsSent = 0
  if (options?.webhookUrl) {
    for (const rule of triggered) {
      const message = formatAlertMessage({
        status: 'TRIGGERED',
        rule,
        generatedAt: evaluation.generatedAt,
        runbookBaseUrl: options.runbookBaseUrl,
      })
      await sendWebhookNotification(options.webhookUrl, message)
      notificationsSent += 1
    }

    for (const rule of resolved) {
      const message = formatAlertMessage({
        status: 'RESOLVED',
        rule,
        generatedAt: evaluation.generatedAt,
        runbookBaseUrl: options.runbookBaseUrl,
      })
      await sendWebhookNotification(options.webhookUrl, message)
      notificationsSent += 1
    }
  } else if (triggered.length > 0 || resolved.length > 0) {
    logger.warn('Reliability alerts changed state but webhook URL is not configured', {
      triggered: triggered.map((rule) => rule.alertKey),
      resolved: resolved.map((rule) => rule.alertKey),
    })
  }

  return {
    evaluation,
    triggered,
    resolved,
    notificationsSent,
    dryRun,
  }
}
