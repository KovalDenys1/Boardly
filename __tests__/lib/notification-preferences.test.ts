// @ts-nocheck

import {
  buildMarketingUnsubscribeHeaders,
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
  upsertNotificationPreferences,
  verifyNotificationUnsubscribeToken,
} from '@/lib/notification-preferences'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    notificationPreferences: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}))

describe('notification preferences: marketing consent (#1154)', () => {
  const originalSecret = process.env.NEXTAUTH_SECRET
  const originalAppUrl = process.env.NEXTAUTH_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXTAUTH_SECRET = 'test-secret'
    process.env.NEXTAUTH_URL = 'https://boardly.online'
  })

  afterAll(() => {
    process.env.NEXTAUTH_SECRET = originalSecret
    process.env.NEXTAUTH_URL = originalAppUrl
  })

  it('defaults marketingConsent to false with no timestamp when no row exists', async () => {
    ;(prisma.notificationPreferences.findUnique as jest.Mock).mockResolvedValue(null)

    const prefs = await getNotificationPreferences('user-1')

    expect(prefs.marketingConsent).toBe(false)
    expect(prefs.marketingConsentAt).toBeNull()
  })

  it('stamps marketingConsentAt whenever marketingConsent is part of the write', async () => {
    ;(prisma.notificationPreferences.upsert as jest.Mock).mockImplementation(({ update }) => update)

    await upsertNotificationPreferences('user-1', { marketingConsent: true })

    const call = (prisma.notificationPreferences.upsert as jest.Mock).mock.calls[0][0]
    expect(call.update.marketingConsent).toBe(true)
    expect(call.update.marketingConsentAt).toBeInstanceOf(Date)
    expect(call.create.marketingConsentAt).toBeInstanceOf(Date)
  })

  it('stamps marketingConsentAt on withdrawal too, not only on granting', async () => {
    ;(prisma.notificationPreferences.upsert as jest.Mock).mockImplementation(({ update }) => update)

    await upsertNotificationPreferences('user-1', { marketingConsent: false })

    const call = (prisma.notificationPreferences.upsert as jest.Mock).mock.calls[0][0]
    expect(call.update.marketingConsent).toBe(false)
    expect(call.update.marketingConsentAt).toBeInstanceOf(Date)
  })

  it('never touches marketingConsentAt for an unrelated preference change', async () => {
    ;(prisma.notificationPreferences.upsert as jest.Mock).mockImplementation(({ update }) => update)

    await upsertNotificationPreferences('user-1', { gameInvites: false })

    const call = (prisma.notificationPreferences.upsert as jest.Mock).mock.calls[0][0]
    expect(call.update).toEqual({ gameInvites: false })
    expect('marketingConsentAt' in call.update).toBe(false)
  })

  it('round-trips a marketingConsent unsubscribe token', () => {
    const token = createNotificationUnsubscribeToken({ userId: 'user-1', type: 'marketingConsent' })
    const decoded = verifyNotificationUnsubscribeToken(token)

    expect(decoded).toMatchObject({ userId: 'user-1', type: 'marketingConsent' })
  })

  it('builds RFC 8058 one-click unsubscribe headers pointing at a token-bearing URL', () => {
    const headers = buildMarketingUnsubscribeHeaders('user-1')

    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(headers['List-Unsubscribe']).toMatch(
      /^<https:\/\/boardly\.online\/api\/notifications\/unsubscribe\?token=.+>$/
    )

    const token = headers['List-Unsubscribe'].slice(1, -1).split('token=')[1]
    expect(verifyNotificationUnsubscribeToken(token)).toMatchObject({
      userId: 'user-1',
      type: 'marketingConsent',
    })
  })
})
