import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { consumeKeyedRateLimit, rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { prismaErrorCode } from '@/lib/guest-helpers'
import { postDiscordWebhookMessage } from '@/lib/discord-webhook'
import { runAfterResponse } from '@/lib/after-response'
import { buildContentReportDiscordPayload, type ContentReportNotification } from '@/lib/content-report-notification'
import {
  PROFILE_REPORT_TARGET_TYPES,
  REPORT_NOTE_MAX_CHARS,
  REPORT_QUOTED_TEXT_MAX_CHARS,
  REPORT_REASONS,
  type ReportTarget,
} from '@/lib/content-reports'
import { resolveReportTarget, SELF_REPORT_REFUSAL } from '@/lib/server/content-report-targets'

/**
 * A player reports a chat message, a Sketch & Guess drawing, or another player's
 * username, avatar or bio (#1172, audit L5-02).
 *
 * ehandelsloven section 18 keeps the hosting safe harbour only while content is acted
 * on without undue delay once we know of it; this is the channel that knowledge
 * arrives through, and the Reports row is the record staff act on in the Control
 * Panel. The reported content is copied from our own records into the row
 * (lib/server/content-report-targets.ts), because chat is gone after 24 hours and a
 * profile can be edited.
 *
 * Signed-in players and guests alike, through getRequestAuthUser. One report per
 * reporter and target: a repeat answers 200 with `duplicate: true` and writes nothing.
 */

const log = apiLogger('/api/reports')

const ipLimiter = rateLimit(rateLimitPresets.contentReport)

const id = z.string().trim().min(1).max(128)
const lobbyCode = z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/)
const common = {
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(REPORT_NOTE_MAX_CHARS).optional(),
}

// Strict objects in a union: a body carrying both `targetId` and `publicProfileId`
// matches neither profile shape and is refused, so a profile target names one account.
const reportSchema = z.union([
  z
    .object({
      targetType: z.literal('chat_message'),
      targetId: id,
      lobbyCode,
      reportedUserId: id,
      quotedText: z.string().trim().min(1).max(REPORT_QUOTED_TEXT_MAX_CHARS),
      ...common,
    })
    .strict(),
  z
    .object({
      targetType: z.literal('drawing'),
      targetId: id,
      round: z.number().int().min(1).max(100),
      lobbyCode: lobbyCode.optional(),
      ...common,
    })
    .strict(),
  z
    .object({
      targetType: z.enum(PROFILE_REPORT_TARGET_TYPES),
      targetId: id,
      lobbyCode: lobbyCode.optional(),
      ...common,
    })
    .strict(),
  z
    .object({
      targetType: z.enum(PROFILE_REPORT_TARGET_TYPES),
      publicProfileId: id,
      ...common,
    })
    .strict(),
])

function notifyDiscord(report: ContentReportNotification): void {
  const webhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  if (!webhookUrl) return

  // After the response: the report is saved before this runs, and a dead webhook must
  // not turn a stored report into a 500. The message id goes on the row, as feedback's
  // does, so a retention rule can delete the Discord copy with it.
  runAfterResponse(
    postDiscordWebhookMessage(webhookUrl, buildContentReportDiscordPayload(report))
      .then((messageId) =>
        messageId
          ? prisma.reports.update({ where: { id: report.reportId }, data: { discordMessageId: messageId } })
          : undefined
      )
      .catch((err) => log.error('Discord webhook failed for a report', err))
  )
}

/** The reporter's own id named outright, before any lookup: the dialog never offers it. */
function namesReporter(target: ReportTarget, reporterId: string): boolean {
  if (target.targetType === 'chat_message') return target.reportedUserId === reporterId
  if (target.targetType === 'drawing') return false
  return 'targetId' in target && target.targetId === reporterId
}

export async function POST(request: NextRequest) {
  try {
    const limited = await ipLimiter(request)
    if (limited) return limited

    const reporter = await getRequestAuthUser(request)
    if (!reporter) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = reportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const perReporter = await consumeKeyedRateLimit(
      `content-report:${reporter.id}`,
      rateLimitPresets.contentReportPerReporter
    )
    if (perReporter.limited) {
      return NextResponse.json(
        { error: 'Too many reports. Please try again later.', retryAfter: perReporter.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': perReporter.retryAfterSeconds.toString() } }
      )
    }

    const { reason, note, ...target } = parsed.data
    const reportTarget = target as ReportTarget

    if (namesReporter(reportTarget, reporter.id)) {
      const { status, ...refusal } = SELF_REPORT_REFUSAL
      return NextResponse.json(refusal, { status })
    }

    const resolution = await resolveReportTarget(reportTarget, reporter.id)
    if (!resolution.ok) {
      const { status, ...refusal } = resolution.refusal
      return NextResponse.json(refusal, { status })
    }
    const resolved = resolution.target

    const existing = await prisma.reports.findUnique({
      where: { reporterId_targetKey: { reporterId: reporter.id, targetKey: resolved.targetKey } },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
    }

    // A drawing is kept once per game and round, whoever reports it first; later
    // reports point at the same copy. The first copy is never overwritten, so what
    // the first reporter saw stays on record.
    if (resolved.drawingSnapshot !== undefined && resolved.gameId && resolved.round !== null) {
      await prisma.reportedDrawings.upsert({
        where: { gameId_round: { gameId: resolved.gameId, round: resolved.round } },
        create: { gameId: resolved.gameId, round: resolved.round, content: resolved.drawingSnapshot },
        update: {},
        select: { gameId: true },
      })
    }

    let reportId: string
    try {
      const created = await prisma.reports.create({
        select: { id: true },
        data: {
          reporterId: reporter.id,
          reportedUserId: resolved.reportedUserId,
          targetType: resolved.targetType,
          targetId: resolved.targetId,
          targetKey: resolved.targetKey,
          lobbyCode: resolved.lobbyCode,
          gameId: resolved.gameId,
          round: resolved.round,
          reason,
          note: note ? note : null,
          contentSnapshot: resolved.contentSnapshot,
          snapshotSource: resolved.snapshotSource,
        },
      })
      reportId = created.id
    } catch (error) {
      // Two taps racing past the lookup above: the unique index keeps it one report.
      if (prismaErrorCode(error) === 'P2002') {
        return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
      }
      throw error
    }

    notifyDiscord({
      reportId,
      targetType: resolved.targetType,
      reason,
      contentSnapshot: resolved.contentSnapshot,
      snapshotSource: resolved.snapshotSource,
      round: resolved.round,
    })

    return NextResponse.json({ ok: true, duplicate: false }, { status: 201 })
  } catch (error) {
    log.error('Failed to save a report', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
