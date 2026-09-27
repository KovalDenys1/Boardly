/**
 * @jest-environment @edge-runtime/jest-environment
 */
/**
 * #1133 item 2: the Discord feedback channel gets a notification, not a copy. The
 * webhook payload carries the type, a preview of at most 200 characters and the
 * feedback id; never the sender's email, their username or the page URL. The full
 * row still goes to the database, where staff read it.
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/feedback/route'
import { prisma } from '@/lib/db'
import { postDiscordWebhookMessage } from '@/lib/discord-webhook'
import { getRequestAuthUser } from '@/lib/request-auth'
import { FEEDBACK_PREVIEW_CHARS, feedbackPreview } from '@/lib/feedback-notification'

jest.mock('@/lib/db', () => ({
  prisma: {
    feedback: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/discord-webhook', () => ({
  postDiscordWebhookMessage: jest.fn(),
}))

// Run the background work inline so the payload can be inspected.
jest.mock('@/lib/after-response', () => ({
  runAfterResponse: (work: Promise<unknown>) => {
    void work
  },
}))

const create = prisma.feedback.create as jest.Mock
const postMessage = postDiscordWebhookMessage as jest.Mock
const requestUser = getRequestAuthUser as jest.Mock

const WEBHOOK = 'https://discord.com/api/webhooks/1/abc'
const EMAIL = 'jane.doe@example.com'

function submit(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

describe('POST /api/feedback — Discord notification', () => {
  const originalUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = WEBHOOK
    create.mockResolvedValue({ id: 'fb_123' })
    postMessage.mockResolvedValue('msg_1')
    requestUser.mockResolvedValue(null)
  })

  afterAll(() => {
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = originalUrl
  })

  it('stores the whole submission, email and page included', async () => {
    const message = 'x'.repeat(900)
    const res = await submit({ type: 'bug', message, email: EMAIL, pageUrl: '/profile' })

    expect(res.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message, email: EMAIL, pageUrl: '/profile' }),
      })
    )
  })

  it('posts only the type, a preview and the feedback id for an anonymous sender with an email', async () => {
    const message = 'The board froze after my third roll. '.repeat(20)
    await submit({ type: 'bug', message, email: EMAIL, pageUrl: '/auth/reset-password?token=secret' })

    expect(postMessage).toHaveBeenCalledTimes(1)
    const [url, payload] = postMessage.mock.calls[0]
    const serialised = JSON.stringify(payload)

    expect(url).toBe(WEBHOOK)
    expect(serialised).not.toContain(EMAIL)
    expect(serialised).not.toContain('reset-password')
    expect(serialised).not.toContain('secret')
    expect(serialised).toContain('fb_123')

    const embed = payload.embeds[0]
    expect(Array.from(embed.description as string).length).toBeLessThanOrEqual(FEEDBACK_PREVIEW_CHARS)
    expect(message.startsWith((embed.description as string).slice(0, -1))).toBe(true)
    expect(embed.fields.map((f: { name: string }) => f.name)).toEqual(['Type', 'Feedback id'])
    expect(payload.allowed_mentions).toEqual({ parse: [] })
  })

  it('never names a signed-in sender', async () => {
    requestUser.mockResolvedValue({ id: 'user_42', username: 'DenysTheGreat' })
    await submit({ type: 'feature', message: 'More games please' })

    const serialised = JSON.stringify(postMessage.mock.calls[0][1])
    expect(serialised).not.toContain('DenysTheGreat')
    expect(serialised).not.toContain('user_42')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_42' }) })
    )
  })

  it('posts nothing when no webhook is configured', async () => {
    delete process.env.FEEDBACK_DISCORD_WEBHOOK_URL
    const res = await submit({ type: 'other', message: 'Hello' })

    expect(res.status).toBe(201)
    expect(postMessage).not.toHaveBeenCalled()
  })
})

describe('feedbackPreview', () => {
  it('leaves a short message whole', () => {
    expect(feedbackPreview('short')).toBe('short')
  })

  it('cuts a long one to the limit, ellipsis included, without splitting an emoji', () => {
    const preview = feedbackPreview('🎲'.repeat(500))
    expect(Array.from(preview)).toHaveLength(FEEDBACK_PREVIEW_CHARS)
    expect(preview.endsWith('…')).toBe(true)
    expect(Array.from(preview.slice(0, -1)).every((c) => c === '🎲')).toBe(true)
  })
})
