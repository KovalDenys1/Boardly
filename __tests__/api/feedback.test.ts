/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/feedback/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { postDiscordWebhookMessage } from '@/lib/discord-webhook'

jest.mock('@/lib/db', () => ({
  prisma: {
    feedback: {
      create: jest.fn(() => Promise.resolve({ id: 'fb1' })),
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
  postDiscordWebhookMessage: jest.fn(() => Promise.resolve('msg_1')),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

function postFeedback(body: Record<string, unknown>) {
  return POST(
    new NextRequest('https://boardly.online/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

function embedFields() {
  const payload = (postDiscordWebhookMessage as jest.Mock).mock.calls.at(-1)?.[1]
  return payload.embeds[0].fields as { name: string; value: string }[]
}

describe('POST /api/feedback - Discord embed hardening (#1122)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue(null)
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/abc'
  })

  it('labels an anonymous submission as unverified rather than a bare email', async () => {
    const res = await postFeedback({ type: 'bug', message: 'it broke', email: 'someone@example.com' })
    expect(res.status).toBe(201)

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'User')?.value).toBe('unverified: someone@example.com')
  })

  it('labels a fully anonymous submission (no email) as unverified too', async () => {
    await postFeedback({ type: 'bug', message: 'it broke' })

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'User')?.value).toBe('unverified: anonymous')
  })

  it('never uses the unverified label for a signed-in user', async () => {
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'u1', username: 'ann' })
    await postFeedback({ type: 'bug', message: 'it broke' })

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'User')?.value).toBe('ann (id: u1)')
  })

  it('drops a pageUrl disguising a markdown link instead of forwarding it', async () => {
    await postFeedback({ type: 'bug', message: 'phish attempt', pageUrl: '[x](https://evil.example)' })

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'Page')).toBeUndefined()
  })

  it('drops a pageUrl on a host that is not one of ours', async () => {
    await postFeedback({ type: 'bug', message: 'wrong host', pageUrl: 'https://evil.example/page' })

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'Page')).toBeUndefined()
  })

  it('shows a same-origin pageUrl wrapped in backticks, never as a rendered link', async () => {
    await postFeedback({ type: 'bug', message: 'ok', pageUrl: 'https://boardly.online/games/yahtzee' })

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'Page')?.value).toBe('`https://boardly.online/games/yahtzee`')
  })

  it('accepts the relative path the suspended-appeal form sends', async () => {
    await postFeedback({ type: 'appeal', message: 'please review', email: 'a@example.com', pageUrl: '/suspended' })

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'Page')?.value).toBe('`/suspended`')
  })

  it('strips a backtick from pageUrl so it cannot break out of the code span', async () => {
    await postFeedback({ type: 'bug', message: 'x', pageUrl: '/suspended`*evil*`' })

    const fields = embedFields()
    expect(fields.find((f) => f.name === 'Page')?.value).toBe('`/suspended*evil*`')
  })
})
