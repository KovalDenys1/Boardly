import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { buildOperationalEventRecord, OPERATIONAL_EVENT_NAMES } from '@/lib/operational-events'
import { rateLimit } from '@/lib/rate-limit'

const log = apiLogger('POST /api/ops/events')
const limiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 240,
  message: 'Too many telemetry events',
})

const payloadValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const requestSchema = z.object({
  eventName: z.enum(OPERATIONAL_EVENT_NAMES),
  payload: z.record(payloadValueSchema).default({}),
  eventAt: z.union([z.number(), z.string()]).optional(),
})

const MAX_PAST_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_FUTURE_DRIFT_MS = 10 * 60 * 1000

function resolveOccurredAt(rawEventAt: string | number | undefined): Date {
  if (typeof rawEventAt !== 'string' && typeof rawEventAt !== 'number') {
    return new Date()
  }

  const timestamp =
    typeof rawEventAt === 'number'
      ? rawEventAt
      : Date.parse(rawEventAt)

  if (!Number.isFinite(timestamp)) {
    return new Date()
  }

  const now = Date.now()
  if (timestamp < now - MAX_PAST_EVENT_AGE_MS || timestamp > now + MAX_FUTURE_DRIFT_MS) {
    return new Date()
  }

  return new Date(timestamp)
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = requestSchema.safeParse(requestBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid telemetry payload' }, { status: 400 })
    }

    const occurredAt = resolveOccurredAt(parsed.data.eventAt)
    const normalized = buildOperationalEventRecord({
      eventName: parsed.data.eventName,
      payload: parsed.data.payload,
    })

    await prisma.operationalEvents.create({
      data: {
        eventName: normalized.eventName,
        metricType: normalized.metricType,
        gameType: normalized.gameType,
        isGuest: normalized.isGuest,
        success: normalized.success,
        applied: normalized.applied,
        latencyMs: normalized.latencyMs,
        targetMs: normalized.targetMs,
        attemptsTotal: normalized.attemptsTotal,
        reason: normalized.reason,
        stage: normalized.stage,
        statusCode: normalized.statusCode,
        source: normalized.source,
        payload: normalized.payload as Prisma.InputJsonObject,
        occurredAt,
      },
    })

    return NextResponse.json({ accepted: true })
  } catch (error) {
    log.error('Failed to ingest operational telemetry event', error as Error)
    return NextResponse.json({ error: 'Failed to ingest telemetry event' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
