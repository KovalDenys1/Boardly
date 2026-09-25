import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { postDiscordWebhookMessage } from '@/lib/discord-webhook'
import { runAfterResponse } from '@/lib/after-response'
import { buildFeedbackDiscordPayload } from '@/lib/feedback-notification'

const log = apiLogger('/api/feedback')

const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'other', 'appeal']),
  message: z.string().trim().min(1).max(2000),
  email: z.string().email().optional().or(z.literal('')),
  pageUrl: z.string().max(500).optional(),
})

function notifyDiscord(feedbackId: string, type: string, message: string): void {
  const webhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  if (!webhookUrl) return

  // Type, a preview and the id only; never the email, the username or the page (#1133).
  const payload = buildFeedbackDiscordPayload(feedbackId, type, message)

  // After the response: feedback is saved before this runs, and a dead webhook must not
  // turn a successful submission into a 500. The message id is stored on the row so the
  // retention rule and account deletion can delete this copy too (lib/feedback-discord.ts).
  runAfterResponse(
    postDiscordWebhookMessage(webhookUrl, payload)
      .then((messageId) =>
        messageId
          ? prisma.feedback.update({ where: { id: feedbackId }, data: { discordMessageId: messageId } })
          : undefined
      )
      .catch((err) => log.error('Discord webhook failed', err))
  )
}

// 5 submissions per hour per IP
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many feedback submissions. Please try again later.',
  // Fail closed on a shared-store outage (#1156): each submission is a row and a Discord post.
  failClosed: true,
})

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await submitLimiter(request)
    if (rateLimitResponse) return rateLimitResponse

    const requestUser = await getRequestAuthUser(request)
    const body = await request.json()
    const parsed = feedbackSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { type, message, email, pageUrl } = parsed.data

    const feedback = await prisma.feedback.create({
      select: { id: true },
      data: {
        type,
        message,
        email: email || null,
        pageUrl: pageUrl || null,
        userId: requestUser?.id ?? null,
      },
    })

    notifyDiscord(feedback.id, type, message)

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    log.error('Failed to save feedback', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
