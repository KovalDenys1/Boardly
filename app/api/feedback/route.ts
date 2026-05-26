import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'

const log = apiLogger('/api/feedback')

const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'other', 'appeal']),
  message: z.string().trim().min(1).max(2000),
  email: z.string().email().optional().or(z.literal('')),
  pageUrl: z.string().max(500).optional(),
})

const TYPE_COLOR: Record<string, number> = {
  bug:     0xed4245,
  feature: 0x57f287,
  appeal:  0xe67e22,
  other:   0x95a5a6,
}

const TYPE_EMOJI: Record<string, string> = {
  bug:     '🐛',
  feature: '✨',
  appeal:  '📣',
  other:   '💬',
}

function notifyDiscord(
  type: string,
  message: string,
  userLabel: string,
  pageUrl?: string,
): void {
  const webhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  if (!webhookUrl) return

  const emoji = TYPE_EMOJI[type] ?? '💬'
  const color = TYPE_COLOR[type] ?? 0x95a5a6
  const truncated = message.length > 1000 ? message.slice(0, 997) + '…' : message

  const fields = [
    { name: 'User', value: userLabel, inline: true },
    { name: 'Type', value: `${emoji} ${type}`, inline: true },
  ]
  if (pageUrl) fields.push({ name: 'Page', value: pageUrl.slice(0, 200), inline: false })

  const payload = {
    embeds: [{
      title: `${emoji} New feedback — ${type}`,
      description: truncated,
      color,
      fields,
      timestamp: new Date().toISOString(),
    }],
  }

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => log.error('Discord webhook failed', { error: err }))
}

// 5 submissions per hour per IP
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many feedback submissions. Please try again later.',
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

    await prisma.feedback.create({
      data: {
        type,
        message,
        email: email || null,
        pageUrl: pageUrl || null,
        userId: requestUser?.id ?? null,
      },
    })

    const userLabel = (requestUser ? `${requestUser.username} (id: ${requestUser.id})` : null) ?? email ?? 'anonymous'
    notifyDiscord(type, message, userLabel, pageUrl)

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    log.error('Failed to save feedback', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
