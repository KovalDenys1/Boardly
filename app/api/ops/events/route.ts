import { Prisma } from '@/prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import {
  buildOperationalEventRecord,
  OPERATIONAL_EVENT_NAMES,
  type OperationalEventPayload,
  type OperationalPayloadValue,
} from '@/lib/operational-events'
import { rateLimit } from '@/lib/rate-limit'

const log = apiLogger('POST /api/ops/events')
const limiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 240,
  message: 'Too many telemetry events',
})

// #1118 (audit S2-03): `payload` had no key count, key length or value length limit, at
// 240 requests/min from anonymous clients, and it is stored as-is — the only ceiling was
// the platform's own request-body limit, which is not visible from this repo.
const MAX_PAYLOAD_KEYS = 20
const MAX_PAYLOAD_KEY_LENGTH = 64
const MAX_PAYLOAD_STRING_VALUE_LENGTH = 256
export const MAX_OPS_EVENT_BODY_BYTES = 4096

const payloadValueSchema = z.union([
  z.string().max(MAX_PAYLOAD_STRING_VALUE_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.null(),
])
const payloadSchema = z
  .record(z.string().max(MAX_PAYLOAD_KEY_LENGTH), payloadValueSchema)
  .refine((payload) => Object.keys(payload).length <= MAX_PAYLOAD_KEYS, {
    message: `payload may not have more than ${MAX_PAYLOAD_KEYS} keys`,
  })
const requestSchema = z.object({
  eventName: z.enum(OPERATIONAL_EVENT_NAMES),
  payload: payloadSchema.default({}),
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

function toOperationalEventPayload(
  payload: Record<string, OperationalPayloadValue>
): OperationalEventPayload {
  return payload
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    // Reject an oversized body before it is ever parsed as JSON (same pattern as
    // /api/security/csp-report): a declared Content-Length is the cheap check, the actual
    // byte length is the one that cannot be spoofed by a missing/wrong header.
    const contentLengthHeader = request.headers.get('content-length')
    const declaredLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null
    if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > MAX_OPS_EVENT_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 400 })
    }

    let rawBody: string
    try {
      rawBody = await request.text()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (Buffer.byteLength(rawBody, 'utf8') > MAX_OPS_EVENT_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 400 })
    }

    let requestBody: unknown
    try {
      requestBody = JSON.parse(rawBody)
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
      payload: toOperationalEventPayload(parsed.data.payload),
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
