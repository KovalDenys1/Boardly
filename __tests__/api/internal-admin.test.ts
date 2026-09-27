/**
 * @jest-environment node
 */
/**
 * The Control Panel's moderation routes, /api/internal/admin/* (#1231, Control Panel #120):
 * the bearer secret (401, 503), the body (400), and each route's success and 404.
 */
// @ts-nocheck - route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST as postSuspensionNotice } from '@/app/api/internal/admin/suspension-notice/route'
import { POST as postDeleteAccount } from '@/app/api/internal/admin/delete-account/route'
import { POST as postRemoveContent } from '@/app/api/internal/admin/remove-content/route'
import { POST as postRemoveChatMessage } from '@/app/api/internal/admin/remove-chat-message/route'
import { prisma } from '@/lib/db'
import { sendSuspensionNoticeEmail } from '@/lib/email'
import { deleteUserAccount } from '@/lib/account-deletion'
import { removeChatMessage } from '@/lib/chat-history'
import { deleteAvatar } from '@/lib/supabase-storage'
import { scrubPlayersFromGameRecords } from '@/lib/account-erasure'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/email', () => ({ sendSuspensionNoticeEmail: jest.fn() }))
jest.mock('@/lib/account-deletion', () => ({ deleteUserAccount: jest.fn() }))
jest.mock('@/lib/chat-history', () => ({ removeChatMessage: jest.fn() }))
jest.mock('@/lib/account-erasure', () => ({
  scrubPlayersFromGameRecords: jest.fn(async () => ({ games: 0, snapshots: 0 })),
}))
jest.mock('@/lib/supabase-storage', () => ({
  deleteAvatar: jest.fn(),
  isAvatarStorageConfigured: jest.fn(() => true),
}))
// The limiter is built when the route module loads, before this file's own consts exist,
// so the factory makes it and hands it back through the mocked module.
jest.mock('@/lib/rate-limit', () => {
  const limiter = jest.fn(async () => null)
  return { rateLimit: jest.fn(() => limiter), __limiter: limiter }
})
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockLimiter = jest.requireMock('@/lib/rate-limit').__limiter as jest.Mock

const SECRET = 'control-panel-api-secret-for-tests'
const AUTH = { authorization: `Bearer ${SECRET}` }

function request(route: string, body: unknown, headers: Record<string, string> = AUTH) {
  return new NextRequest(`http://localhost:3000/api/internal/admin/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const routes = {
  'suspension-notice': {
    handler: postSuspensionNotice,
    body: { userId: 'user-1', reason: 'Hate speech in chat', expiresAt: null },
  },
  'delete-account': { handler: postDeleteAccount, body: { userId: 'user-1' } },
  'remove-content': { handler: postRemoveContent, body: { userId: 'user-1', field: 'bio' } },
  'remove-chat-message': {
    handler: postRemoveChatMessage,
    body: { lobbyCode: '1234', messageId: '1790000000000-abc' },
  },
}

describe('/api/internal/admin', () => {
  const originalSecret = process.env.CONTROL_PANEL_API_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    mockLimiter.mockResolvedValue(null)
    process.env.CONTROL_PANEL_API_SECRET = SECRET
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CONTROL_PANEL_API_SECRET
    else process.env.CONTROL_PANEL_API_SECRET = originalSecret
  })

  describe.each(Object.entries(routes))('%s: auth and body', (route, { handler, body }) => {
    it('answers 401 without the secret, before doing anything', async () => {
      const response = await handler(request(route, body, {}))

      expect(response.status).toBe(401)
      expect(prisma.users.findUnique).not.toHaveBeenCalled()
      expect(deleteUserAccount).not.toHaveBeenCalled()
      expect(removeChatMessage).not.toHaveBeenCalled()
    })

    it('answers 401 to a wrong secret and to another bearer', async () => {
      expect((await handler(request(route, body, { authorization: 'Bearer wrong' }))).status).toBe(401)
      expect((await handler(request(route, body, { authorization: SECRET }))).status).toBe(401)
    })

    it('answers 503 when the secret is not configured', async () => {
      delete process.env.CONTROL_PANEL_API_SECRET

      const response = await handler(request(route, body))

      expect(response.status).toBe(503)
    })

    it('answers 503 when the secret is shorter than 32 characters, even to that exact bearer', async () => {
      const short = 'x'.repeat(31)
      process.env.CONTROL_PANEL_API_SECRET = short

      const response = await handler(request(route, body, { authorization: `Bearer ${short}` }))

      expect(response.status).toBe(503)
      expect(prisma.users.findUnique).not.toHaveBeenCalled()
      expect(deleteUserAccount).not.toHaveBeenCalled()
      expect(removeChatMessage).not.toHaveBeenCalled()
    })

    it('answers 400 to a body that is not JSON or misses a field', async () => {
      const notJson = await handler(request(route, 'not json'))
      expect(notJson.status).toBe(400)
      await expect(notJson.json()).resolves.toMatchObject({ code: 'INVALID_BODY' })

      expect((await handler(request(route, {}))).status).toBe(400)
    })

    it('counts against the panel as one caller, and answers the limiter’s 429', async () => {
      mockLimiter.mockResolvedValueOnce(new Response(null, { status: 429 }))

      const response = await handler(request(route, body))

      expect(response.status).toBe(429)
      expect(mockLimiter).toHaveBeenCalledWith(expect.anything(), { identity: 'control-panel' })
    })
  })

  describe('POST /suspension-notice', () => {
    const handler = postSuspensionNotice

    beforeEach(() => {
      prisma.users.findUnique.mockResolvedValue(suspendedUser())
      sendSuspensionNoticeEmail.mockResolvedValue({ success: true })
    })

    function suspendedUser(overrides: Record<string, unknown> = {}) {
      return {
        id: 'user-1',
        email: 'player@example.com',
        username: 'Ola',
        isGuest: false,
        suspended: true,
        bot: null,
        ...overrides,
      }
    }

    it('answers 409 NOT_SUSPENDED for an account that is not suspended, and mails nothing', async () => {
      prisma.users.findUnique.mockResolvedValue(suspendedUser({ suspended: false }))

      const response = await handler(request('suspension-notice', routes['suspension-notice'].body))

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({ code: 'NOT_SUSPENDED' })
      expect(sendSuspensionNoticeEmail).not.toHaveBeenCalled()
      expect(prisma.users.findUnique.mock.calls[0][0].select).toMatchObject({ suspended: true })
    })

    it('answers 409 BOT_ACCOUNT for a bot, whose address bounces', async () => {
      prisma.users.findUnique.mockResolvedValue(suspendedUser({ bot: { id: 'bot-1' }, email: 'bot@boardly.local' }))

      const response = await handler(request('suspension-notice', routes['suspension-notice'].body))

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({ code: 'BOT_ACCOUNT' })
      expect(sendSuspensionNoticeEmail).not.toHaveBeenCalled()
    })

    it('emails the reason and the end date of a temporary suspension', async () => {
      const response = await handler(
        request('suspension-notice', {
          userId: 'user-1',
          reason: 'Spam in lobby chat',
          expiresAt: '2026-10-04T12:00:00.000Z',
        })
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ sent: true })
      expect(sendSuspensionNoticeEmail).toHaveBeenCalledWith('player@example.com', {
        username: 'Ola',
        reason: 'Spam in lobby chat',
        expiresAt: new Date('2026-10-04T12:00:00.000Z'),
        idempotencyKey: expect.stringMatching(/^suspension-notice\/user-1\/[0-9a-f]{24}$/),
      })
    })

    it('sends "until further notice" as a null end date', async () => {
      const response = await handler(request('suspension-notice', routes['suspension-notice'].body))

      expect(response.status).toBe(200)
      expect(sendSuspensionNoticeEmail.mock.calls[0][1].expiresAt).toBeNull()
    })

    it('answers 404 USER_NOT_FOUND for an unknown user', async () => {
      prisma.users.findUnique.mockResolvedValue(null)

      const response = await handler(request('suspension-notice', routes['suspension-notice'].body))

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ code: 'USER_NOT_FOUND' })
      expect(sendSuspensionNoticeEmail).not.toHaveBeenCalled()
    })

    it('answers 409 NO_EMAIL for a guest or an account without an address', async () => {
      prisma.users.findUnique.mockResolvedValueOnce(
        suspendedUser({ id: 'g-1', email: null, username: 'Guest', isGuest: true })
      )
      const guest = await handler(request('suspension-notice', routes['suspension-notice'].body))
      expect(guest.status).toBe(409)
      await expect(guest.json()).resolves.toEqual({ code: 'NO_EMAIL' })

      prisma.users.findUnique.mockResolvedValueOnce(suspendedUser({ id: 'u-2', email: null, username: 'NoMail' }))
      expect((await handler(request('suspension-notice', routes['suspension-notice'].body))).status).toBe(409)
      expect(sendSuspensionNoticeEmail).not.toHaveBeenCalled()
    })

    it('answers 502 SEND_FAILED when the email is not sent', async () => {
      sendSuspensionNoticeEmail.mockResolvedValue({ success: false, error: 'Email service not configured' })

      const response = await handler(request('suspension-notice', routes['suspension-notice'].body))

      expect(response.status).toBe(502)
      await expect(response.json()).resolves.toEqual({ code: 'SEND_FAILED' })
    })

    it('answers 400 to an empty, a too long or a missing reason and a malformed end date', async () => {
      const base = routes['suspension-notice'].body
      for (const body of [
        { ...base, reason: '   ' },
        { ...base, reason: 'x'.repeat(1001) },
        { userId: 'user-1', expiresAt: null },
        { ...base, expiresAt: 'next tuesday' },
        { userId: 'user-1', reason: 'Spam' },
      ]) {
        expect((await handler(request('suspension-notice', body))).status).toBe(400)
      }
      expect((await handler(request('suspension-notice', { ...base, reason: 'x'.repeat(1000) }))).status).toBe(200)
    })
  })

  describe('POST /delete-account', () => {
    const handler = postDeleteAccount

    it('deletes through the owner-deletion path and says whether a subscription was cancelled', async () => {
      deleteUserAccount.mockResolvedValue({ status: 'deleted', cancelledSubscription: true })

      const response = await handler(request('delete-account', { userId: 'user-1' }))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ deleted: true, hadActiveSubscription: true })
      expect(deleteUserAccount).toHaveBeenCalledWith('user-1', expect.objectContaining({ reason: 'moderation' }))
    })

    it('reports hadActiveSubscription false for an account without one', async () => {
      deleteUserAccount.mockResolvedValue({ status: 'deleted', cancelledSubscription: false })

      const response = await handler(request('delete-account', { userId: 'user-1' }))

      await expect(response.json()).resolves.toEqual({ deleted: true, hadActiveSubscription: false })
    })

    it('answers 404 USER_NOT_FOUND for an unknown user', async () => {
      deleteUserAccount.mockResolvedValue({ status: 'not_found' })

      const response = await handler(request('delete-account', { userId: 'nobody' }))

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ code: 'USER_NOT_FOUND' })
    })

    it('answers 502 when Stripe or storage refused, having deleted nothing', async () => {
      deleteUserAccount.mockResolvedValueOnce({ status: 'subscription_failed' })
      const stripe = await handler(request('delete-account', { userId: 'user-1' }))
      expect(stripe.status).toBe(502)
      await expect(stripe.json()).resolves.toEqual({ code: 'SUBSCRIPTION_CANCEL_FAILED' })

      deleteUserAccount.mockResolvedValueOnce({ status: 'avatar_failed' })
      expect((await handler(request('delete-account', { userId: 'user-1' }))).status).toBe(502)
    })
  })

  describe('POST /remove-content', () => {
    const handler = postRemoveContent

    beforeEach(() => {
      prisma.users.findUnique.mockResolvedValue({ id: 'user-1', username: 'Rude_Name', bot: null })
      prisma.users.findMany.mockResolvedValue([])
      prisma.users.update.mockResolvedValue({})
    })

    it('refuses a bot with 409 BOT_ACCOUNT for every field, and changes nothing', async () => {
      // A bot is found by its username (getOrCreateBotUser); renamed, every add-bot 500s.
      prisma.users.findUnique.mockResolvedValue({ id: 'bot-user', username: 'Yahtzee Bot', bot: { id: 'bot-1' } })

      for (const field of ['bio', 'avatar', 'username']) {
        const response = await handler(request('remove-content', { userId: 'bot-user', field }))
        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toEqual({ code: 'BOT_ACCOUNT' })
      }
      expect(prisma.users.findUnique.mock.calls[0][0].select).toMatchObject({ bot: { select: { id: true } } })
      expect(prisma.users.update).not.toHaveBeenCalled()
      expect(deleteAvatar).not.toHaveBeenCalled()
      expect(scrubPlayersFromGameRecords).not.toHaveBeenCalled()
    })

    it('replaces the old name with the new one in game records, before the row changes', async () => {
      const order: string[] = []
      scrubPlayersFromGameRecords.mockImplementationOnce(async () => {
        order.push('scrub')
        return { games: 2, snapshots: 5 }
      })
      prisma.users.update.mockImplementationOnce(async () => {
        order.push('update')
        return {}
      })

      const response = await handler(request('remove-content', { userId: 'user-1', field: 'username' }))

      const { username } = await response.json()
      expect(scrubPlayersFromGameRecords).toHaveBeenCalledWith([
        { id: 'user-1', username: 'Rude_Name', label: username },
      ])
      expect(order).toEqual(['scrub', 'update'])
    })

    it('does not touch game records for a bio or an avatar', async () => {
      await handler(request('remove-content', { userId: 'user-1', field: 'bio' }))
      await handler(request('remove-content', { userId: 'user-1', field: 'avatar' }))

      expect(scrubPlayersFromGameRecords).not.toHaveBeenCalled()
    })

    it('clears the bio', async () => {
      const response = await handler(request('remove-content', { userId: 'user-1', field: 'bio' }))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ removed: true })
      expect(prisma.users.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { bio: null } })
    })

    it('deletes the stored picture, then clears it and the provider picture behind it', async () => {
      const response = await handler(request('remove-content', { userId: 'user-1', field: 'avatar' }))

      expect(response.status).toBe(200)
      expect(deleteAvatar).toHaveBeenCalledWith('user-1')
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { avatarUrl: null, image: null },
      })
    })

    it('leaves the row alone and answers 502 when storage refuses the delete', async () => {
      deleteAvatar.mockRejectedValueOnce(new Error('Avatar removal failed'))

      const response = await handler(request('remove-content', { userId: 'user-1', field: 'avatar' }))

      expect(response.status).toBe(502)
      await expect(response.json()).resolves.toEqual({ code: 'AVATAR_DELETE_FAILED' })
      expect(prisma.users.update).not.toHaveBeenCalled()
    })

    it('resets the username to a free Player plus six digits and returns it', async () => {
      const response = await handler(request('remove-content', { userId: 'user-1', field: 'username' }))

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ removed: true, username: expect.stringMatching(/^Player\d{6}$/) })
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { username: body.username },
      })
    })

    it('draws another name when the first is taken, in any case', async () => {
      prisma.users.findMany.mockImplementationOnce(async ({ where }) => [
        { username: String(where.username.equals).replace(/\\/g, '').toLowerCase() },
      ])

      const response = await handler(request('remove-content', { userId: 'user-1', field: 'username' }))

      expect(response.status).toBe(200)
      expect(prisma.users.findMany).toHaveBeenCalledTimes(2)
      expect(prisma.users.update).toHaveBeenCalledTimes(1)
    })

    it('draws again when the write collides on the unique index, moving the records on too', async () => {
      prisma.users.update.mockRejectedValueOnce(Object.assign(new Error('Unique'), { code: 'P2002' }))

      const response = await handler(request('remove-content', { userId: 'user-1', field: 'username' }))

      expect(response.status).toBe(200)
      expect(prisma.users.update).toHaveBeenCalledTimes(2)
      const lost = prisma.users.update.mock.calls[0][0].data.username
      const won = prisma.users.update.mock.calls[1][0].data.username
      expect((await response.json()).username).toBe(won)
      // The records already moved to the name another account took are moved on as well.
      expect(scrubPlayersFromGameRecords).toHaveBeenLastCalledWith([
        { id: 'user-1', username: 'Rude_Name', label: won },
        { id: 'user-1', username: lost, label: won },
      ])
    })

    it('leaves the name as it was when rewriting the records fails, so a retry finds it', async () => {
      scrubPlayersFromGameRecords.mockRejectedValueOnce(new Error('database blip'))

      await expect(
        handler(request('remove-content', { userId: 'user-1', field: 'username' }))
      ).rejects.toThrow('database blip')
      expect(prisma.users.update).not.toHaveBeenCalled()
    })

    it('answers 404 USER_NOT_FOUND for an unknown user, and changes nothing', async () => {
      prisma.users.findUnique.mockResolvedValue(null)

      for (const field of ['bio', 'avatar', 'username']) {
        const response = await handler(request('remove-content', { userId: 'nobody', field }))
        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({ code: 'USER_NOT_FOUND' })
      }
      expect(prisma.users.update).not.toHaveBeenCalled()
      expect(deleteAvatar).not.toHaveBeenCalled()
    })

    it('answers 400 to a field it does not remove', async () => {
      const response = await handler(request('remove-content', { userId: 'user-1', field: 'email' }))

      expect(response.status).toBe(400)
    })
  })

  describe('POST /remove-chat-message', () => {
    const handler = postRemoveChatMessage
    const body = routes['remove-chat-message'].body

    it('removes the message from the history', async () => {
      removeChatMessage.mockResolvedValue('removed')

      const response = await handler(request('remove-chat-message', body))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ removed: true })
      expect(removeChatMessage).toHaveBeenCalledWith('1234', '1790000000000-abc')
    })

    it('answers 404 NOT_FOUND when the history does not hold it', async () => {
      removeChatMessage.mockResolvedValue('not_found')

      const response = await handler(request('remove-chat-message', body))

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ code: 'NOT_FOUND' })
    })

    it('answers 502, not the 503 that means "no secret", when the chat store is unavailable', async () => {
      removeChatMessage.mockResolvedValue('unavailable')

      const response = await handler(request('remove-chat-message', body))

      expect(response.status).toBe(502)
      await expect(response.json()).resolves.toEqual({ code: 'CHAT_STORE_UNAVAILABLE' })
    })
  })
})
