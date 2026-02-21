import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { runReliabilityAlertCycle } from '@/lib/reliability-alerts'

const log = apiLogger('GET /api/cron/reliability-alerts')

function parseEnvNumber(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function handleCronRequest(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await runReliabilityAlertCycle({
      windowMinutes: parseEnvNumber(process.env.OPS_ALERT_WINDOW_MINUTES),
      baselineDays: parseEnvNumber(process.env.OPS_ALERT_BASELINE_DAYS),
      repeatMinutes: parseEnvNumber(process.env.OPS_ALERT_REPEAT_MINUTES),
      webhookUrl: process.env.OPS_ALERT_WEBHOOK_URL,
      runbookBaseUrl: process.env.OPS_RUNBOOK_BASE_URL,
      dryRun: false,
    })

    return NextResponse.json({
      success: true,
      generatedAt: result.evaluation.generatedAt,
      triggered: result.triggered.map((rule) => rule.alertKey),
      resolved: result.resolved.map((rule) => rule.alertKey),
      notificationsSent: result.notificationsSent,
      ruleCount: result.evaluation.rules.length,
    })
  } catch (error) {
    log.error('Reliability alert cron job failed', error as Error)
    return NextResponse.json(
      {
        error: 'Reliability alert cron failed',
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
