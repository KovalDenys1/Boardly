import { NextRequest, NextResponse } from 'next/server'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { apiLogger } from '@/lib/logger'
import { sendDueSubscriptionNotices } from '@/lib/subscription-notice'

const log = apiLogger('/api/cron/subscription-notices')

// The running-subscription notice (#1165, digitalytelsesloven § 33 fourth
// paragraph), daily at 05:00 UTC from vercel.json. No flag: it touches only
// users with a running Stripe subscription, and each notice is claimed before
// it is sent (lib/subscription-notice.ts), so a second run in a day sends
// nothing new.
async function handleCronRequest(request: NextRequest) {
  const authError = authorizeCronRequest(request)
  if (authError) return authError

  const startedAt = Date.now()

  try {
    const summary = await sendDueSubscriptionNotices({ deadlineMs: 45_000 })

    log.info('Subscription notices finished', summary)

    // A notice that failed is released for tomorrow, so the run itself still
    // succeeded; `failed` in the payload is what to watch.
    await recordCronRun({
      cron: 'subscription-notices',
      success: true,
      latencyMs: Date.now() - startedAt,
      payload: summary,
    })

    return NextResponse.json({ success: true, ...summary, timestamp: new Date().toISOString() })
  } catch (error) {
    log.error('Subscription notices failed', error as Error)
    await recordCronRun({
      cron: 'subscription-notices',
      success: false,
      latencyMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    })
    return NextResponse.json(
      { error: 'Subscription notices failed', message: error instanceof Error ? error.message : 'Unknown error' },
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
export const maxDuration = 60
