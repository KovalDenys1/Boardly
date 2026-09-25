import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { postDiscordWebhookMessage } from '@/lib/discord-webhook'
import { runAfterResponse } from '@/lib/after-response'

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

// Hosts a pageUrl is trusted to name (#1122). Anything else — a body field a
// caller can set to whatever they like — is dropped rather than shown, since
// the point of the field is "which of our own pages this came from".
const ALLOWED_PAGE_URL_HOSTS = new Set(['boardly.online', 'www.boardly.online', 'localhost', '127.0.0.1'])

/**
 * Discord renders `[label](url)` as a clickable masked link and `@everyone`/`@here`
 * as a mention, so an unescaped `pageUrl` let a feedback submission plant an
 * arbitrary phishing link — or, in principle, other markdown — in #feedback under
 * a "New feedback" title (#1122). Two independent guards: only a same-origin
 * relative path or a URL whose host is genuinely one of Boardly's own is passed
 * along at all, and whatever does pass is wrapped in backticks (with any literal
 * backtick stripped first, so nothing can break out of the code span) so it
 * always renders as plain text, never as markdown.
 */
function sanitizedPageUrlForDiscord(raw: string | undefined): string | null {
  if (!raw) return null

  const asLiteral = (value: string) => `\`${value.replace(/`/g, '').slice(0, 200)}\``

  // A same-origin relative path, e.g. '/suspended' (app/suspended/page.tsx) — no
  // scheme+host for Discord to treat as a link destination either way.
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return asLiteral(raw)
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (!ALLOWED_PAGE_URL_HOSTS.has(parsed.hostname)) return null
    return asLiteral(parsed.toString())
  } catch {
    // Not a valid absolute URL either — includes a markdown link disguised as a
    // pageUrl, e.g. '[x](https://evil)', which is exactly what this guards against.
    return null
  }
}

function notifyDiscord(
  feedbackId: string,
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
  const safePageUrl = sanitizedPageUrlForDiscord(pageUrl)
  if (safePageUrl) fields.push({ name: 'Page', value: safePageUrl, inline: false })

  const payload = {
    embeds: [{
      title: `${emoji} New feedback — ${type}`,
      description: truncated,
      color,
      fields,
      timestamp: new Date().toISOString(),
    }],
  }

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
      .catch((err) => log.error('Discord webhook failed', { error: err }))
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

    // An anonymous submission's `email` is an unverified body field, not a claim we can
    // stand behind — `notifyDiscord` puts this label under "User", and without the
    // prefix it read as if a real, signed-in account had sent it (#1122).
    const userLabel = requestUser
      ? `${requestUser.username} (id: ${requestUser.id})`
      : `unverified: ${email || 'anonymous'}`
    notifyDiscord(feedback.id, type, message, userLabel, pageUrl)

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    log.error('Failed to save feedback', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
