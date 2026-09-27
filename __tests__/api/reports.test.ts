/**
 * @jest-environment node
 */
/**
 * #1172: POST /api/reports. A player reports a chat message, a drawing, or another
 * player's username, avatar or bio. What is pinned here:
 *
 * - who may report (a session or a guest token, never nobody);
 * - what is accepted (fixed target types and reasons, a note of at most 500 characters);
 * - that a player cannot report themselves, however the request names them;
 * - that the content kept is the server's own copy wherever it still has one, and the
 *   reporter's copy only against someone who really sat in the lobby;
 * - one report per reporter and target, rate limits per address and per reporter;
 * - that the Discord notification carries no reporter and no note.
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reports/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getChatHistory } from '@/lib/chat-history'
import { consumeKeyedRateLimit } from '@/lib/rate-limit'
import { postDiscordWebhookMessage } from '@/lib/discord-webhook'

const ipLimiter = jest.fn(async () => null as Response | null)

jest.mock('@/lib/db', () => ({
  prisma: {
    reports: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    lobbies: { findUnique: jest.fn() },
    players: { findFirst: jest.fn() },
    users: { findUnique: jest.fn() },
    games: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => () => ipLimiter()),
  consumeKeyedRateLimit: jest.fn(),
  rateLimitPresets: {
    contentReport: { windowMs: 3_600_000, maxRequests: 20, failClosed: true },
    contentReportPerReporter: { windowMs: 3_600_000, maxRequests: 10 },
  },
}))

jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/chat-history', () => ({ getChatHistory: jest.fn() }))
jest.mock('@/lib/discord-webhook', () => ({ postDiscordWebhookMessage: jest.fn() }))
// Run the background work inline so the payload can be inspected.
jest.mock('@/lib/after-response', () => ({
  runAfterResponse: (work: Promise<unknown>) => {
    void work
  },
}))

const db = prisma as unknown as {
  reports: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }
  lobbies: { findUnique: jest.Mock }
  players: { findFirst: jest.Mock }
  users: { findUnique: jest.Mock }
  games: { findUnique: jest.Mock }
}
const requestUser = getRequestAuthUser as jest.Mock
const chatHistory = getChatHistory as jest.Mock
const keyedLimit = consumeKeyedRateLimit as jest.Mock
const postMessage = postDiscordWebhookMessage as jest.Mock

const WEBHOOK = 'https://discord.com/api/webhooks/1/abc'
const REPORTER = { id: 'reporter_1', username: 'ReporterName', isGuest: true }

function submit(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

const chatReport = {
  targetType: 'chat_message',
  targetId: 'msg_1',
  lobbyCode: '4821',
  reportedUserId: 'offender_1',
  quotedText: 'what the reporter saw',
  reason: 'harassment',
}

async function flushBackgroundWork() {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('POST /api/reports (#1172)', () => {
  const originalWebhook = process.env.FEEDBACK_DISCORD_WEBHOOK_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = WEBHOOK
    ipLimiter.mockResolvedValue(null)
    keyedLimit.mockResolvedValue({ limited: false, retryAfterSeconds: 0 })
    requestUser.mockResolvedValue(REPORTER)
    db.lobbies.findUnique.mockResolvedValue({ id: 'lobby_1' })
    db.users.findUnique.mockResolvedValue({ id: 'offender_1', bot: null })
    db.players.findFirst.mockResolvedValue(null)
    db.reports.findUnique.mockResolvedValue(null)
    db.reports.create.mockResolvedValue({ id: 'report_1' })
    db.reports.update.mockResolvedValue({})
    chatHistory.mockResolvedValue([
      { id: 'msg_1', userId: 'offender_1', username: 'Offender', message: 'the stored text', lobbyCode: '4821' },
    ])
    postMessage.mockResolvedValue('discord_msg_1')
  })

  afterAll(() => {
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = originalWebhook
  })

  describe('auth', () => {
    it('refuses a request with neither a session nor a guest token', async () => {
      requestUser.mockResolvedValue(null)
      const res = await submit(chatReport)
      expect(res.status).toBe(401)
      expect(db.reports.create).not.toHaveBeenCalled()
    })

    it('accepts a guest', async () => {
      const res = await submit(chatReport)
      expect(res.status).toBe(201)
      expect(db.reports.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reporterId: 'reporter_1' }) })
      )
    })
  })

  describe('validation', () => {
    it.each([
      ['an unknown target type', { ...chatReport, targetType: 'lobby_name' }],
      ['an unknown reason', { ...chatReport, reason: 'i_just_dislike_them' }],
      ['a note over 500 characters', { ...chatReport, note: 'x'.repeat(501) }],
      ['a chat report without the lobby code', { ...chatReport, lobbyCode: undefined }],
      ['a chat report without the quoted text', { ...chatReport, quotedText: '' }],
      ['a drawing without a round', { targetType: 'drawing', targetId: 'game_1', reason: 'sexual' }],
      [
        'a profile target naming both a user id and a public profile id',
        { targetType: 'bio', targetId: 'offender_1', publicProfileId: 'pub_1', reason: 'hate' },
      ],
      ['an unexpected field', { ...chatReport, reporterId: 'someone_else' }],
    ])('refuses %s', async (_label, body) => {
      const res = await submit(body)
      expect(res.status).toBe(400)
      expect(db.reports.create).not.toHaveBeenCalled()
    })

    it('refuses a body that is not JSON', async () => {
      const res = await submit('not json')
      expect(res.status).toBe(400)
    })

    it('accepts a note of exactly 500 characters and stores it', async () => {
      const note = 'n'.repeat(500)
      const res = await submit({ ...chatReport, note })
      expect(res.status).toBe(201)
      expect(db.reports.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ note }) })
      )
    })
  })

  describe('self-reports', () => {
    it('refuses a chat message the request says the reporter wrote', async () => {
      const res = await submit({ ...chatReport, reportedUserId: 'reporter_1' })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'CANNOT_REPORT_SELF' })
      expect(db.reports.create).not.toHaveBeenCalled()
    })

    it('refuses a chat message the server says the reporter wrote, whatever the request claims', async () => {
      chatHistory.mockResolvedValue([
        { id: 'msg_1', userId: 'reporter_1', username: 'ReporterName', message: 'mine', lobbyCode: '4821' },
      ])
      const res = await submit(chatReport)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'CANNOT_REPORT_SELF' })
      expect(db.reports.create).not.toHaveBeenCalled()
    })

    it("refuses the reporter's own username by user id", async () => {
      const res = await submit({ targetType: 'username', targetId: 'reporter_1', reason: 'other' })
      expect(res.status).toBe(400)
      expect(db.users.findUnique).not.toHaveBeenCalled()
    })

    it("refuses the reporter's own bio reached through their public profile id", async () => {
      db.users.findUnique.mockResolvedValue({
        id: 'reporter_1', username: 'ReporterName', avatarUrl: null, image: null, bio: 'about me', bot: null,
      })
      const res = await submit({ targetType: 'bio', publicProfileId: 'pub_me', reason: 'other' })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'CANNOT_REPORT_SELF' })
    })

    it('refuses a drawing the reporter drew', async () => {
      db.games.findUnique.mockResolvedValue({
        id: 'game_1',
        gameType: 'sketch_and_guess',
        lobby: { code: '4821' },
        state: { data: { rounds: [{ round: 2, drawerId: 'reporter_1', drawingContent: '{"strokes":[1]}' }] } },
      })
      const res = await submit({ targetType: 'drawing', targetId: 'game_1', round: 2, reason: 'sexual' })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'CANNOT_REPORT_SELF' })
    })
  })

  describe('what is kept', () => {
    it("keeps the server's copy of a chat message, not the reporter's", async () => {
      const res = await submit(chatReport)
      expect(res.status).toBe(201)
      expect(db.reports.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetType: 'chat_message',
            targetId: 'msg_1',
            targetKey: 'chat_message:4821:msg_1',
            reportedUserId: 'offender_1',
            lobbyCode: '4821',
            contentSnapshot: 'the stored text',
            snapshotSource: 'server',
            reason: 'harassment',
            note: null,
          }),
        })
      )
    })

    it("keeps the reporter's copy once the history has lost the message, marked as such", async () => {
      chatHistory.mockResolvedValue([])
      db.players.findFirst.mockResolvedValue({ id: 'seat_1' })
      const res = await submit(chatReport)
      expect(res.status).toBe(201)
      expect(db.players.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'offender_1', game: { lobbyId: 'lobby_1' } } })
      )
      expect(db.reports.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contentSnapshot: 'what the reporter saw', snapshotSource: 'reporter' }),
        })
      )
    })

    it('refuses to put words in the mouth of someone who never sat in the lobby', async () => {
      chatHistory.mockResolvedValue([])
      db.players.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) =>
        where.userId === 'reporter_1' ? { id: 'seat_reporter' } : null
      )
      const res = await submit(chatReport)
      expect(res.status).toBe(404)
      expect(db.reports.create).not.toHaveBeenCalled()
    })

    it("refuses the reporter's copy from a reporter who never sat in the lobby", async () => {
      chatHistory.mockResolvedValue([])
      db.players.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) =>
        where.userId === 'offender_1' ? { id: 'seat_offender' } : null
      )
      const res = await submit(chatReport)
      expect(res.status).toBe(404)
      expect(db.reports.create).not.toHaveBeenCalled()
    })

    it('answers 404 for a lobby that does not exist', async () => {
      db.lobbies.findUnique.mockResolvedValue(null)
      const res = await submit(chatReport)
      expect(res.status).toBe(404)
    })

    it('keeps a drawing from the game state, with the lobby the game is really in', async () => {
      db.games.findUnique.mockResolvedValue({
        id: 'game_1',
        gameType: 'sketch_and_guess',
        lobby: { code: '4821' },
        state: JSON.stringify({ data: { rounds: [{ round: 3, drawerId: 'offender_1', drawingContent: '{"strokes":[[1,2]]}' }] } }),
      })
      const res = await submit({ targetType: 'drawing', targetId: 'game_1', round: 3, lobbyCode: '9999', reason: 'sexual' })
      expect(res.status).toBe(201)
      expect(db.reports.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetType: 'drawing',
            targetKey: 'drawing:game_1:3',
            gameId: 'game_1',
            round: 3,
            lobbyCode: '4821',
            reportedUserId: 'offender_1',
            contentSnapshot: '{"strokes":[[1,2]]}',
            snapshotSource: 'server',
          }),
        })
      )
    })

    it('answers 404 for a round with no drawing stored yet', async () => {
      db.games.findUnique.mockResolvedValue({
        id: 'game_1',
        gameType: 'sketch_and_guess',
        lobby: { code: '4821' },
        state: { data: { rounds: [{ round: 1, drawerId: 'offender_1', drawingContent: null }] } },
      })
      const res = await submit({ targetType: 'drawing', targetId: 'game_1', round: 1, reason: 'sexual' })
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'NOTHING_TO_REPORT' })
    })

    it('keeps the username as it is now, and keys it on its content', async () => {
      db.users.findUnique.mockResolvedValue({
        id: 'offender_1', username: 'RudeName', avatarUrl: null, image: null, bio: null, bot: null,
      })
      const res = await submit({ targetType: 'username', targetId: 'offender_1', lobbyCode: '4821', reason: 'hate' })
      expect(res.status).toBe(201)
      const data = db.reports.create.mock.calls[0][0].data
      expect(data).toMatchObject({ contentSnapshot: 'RudeName', reportedUserId: 'offender_1', snapshotSource: 'server' })
      expect(data.targetKey).toMatch(/^username:offender_1:[0-9a-f]{16}$/)
    })

    it('reaches a bio through the public profile id without the client knowing the user id', async () => {
      db.users.findUnique.mockResolvedValue({
        id: 'offender_1', username: 'Someone', avatarUrl: null, image: null, bio: 'a bad bio', bot: null,
      })
      const res = await submit({ targetType: 'bio', publicProfileId: 'pub_42', reason: 'hate' })
      expect(res.status).toBe(201)
      expect(db.users.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { publicProfileId: 'pub_42' } }))
      expect(db.reports.create.mock.calls[0][0].data).toMatchObject({ targetId: 'offender_1', contentSnapshot: 'a bad bio' })
    })

    it('answers 404 for an empty bio', async () => {
      db.users.findUnique.mockResolvedValue({
        id: 'offender_1', username: 'Someone', avatarUrl: null, image: null, bio: '  ', bot: null,
      })
      const res = await submit({ targetType: 'bio', targetId: 'offender_1', reason: 'hate' })
      expect(res.status).toBe(404)
    })

    it('refuses to report a bot', async () => {
      db.users.findUnique.mockResolvedValue({
        id: 'bot_1', username: 'Bot', avatarUrl: null, image: null, bio: null, bot: { id: 'b' },
      })
      const res = await submit({ targetType: 'username', targetId: 'bot_1', reason: 'spam' })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'TARGET_NOT_REPORTABLE' })
    })
  })

  describe('deduplication', () => {
    it('answers a repeat with duplicate: true and writes nothing', async () => {
      db.reports.findUnique.mockResolvedValue({ id: 'report_0' })
      const res = await submit(chatReport)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, duplicate: true })
      expect(db.reports.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reporterId_targetKey: { reporterId: 'reporter_1', targetKey: 'chat_message:4821:msg_1' } },
        })
      )
      expect(db.reports.create).not.toHaveBeenCalled()
      expect(postMessage).not.toHaveBeenCalled()
    })

    it('treats losing the race to the unique index as a duplicate, not an error', async () => {
      db.reports.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
      const res = await submit(chatReport)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, duplicate: true })
      expect(postMessage).not.toHaveBeenCalled()
    })
  })

  describe('rate limits', () => {
    it('stops at the per-address limit before reading anything', async () => {
      ipLimiter.mockResolvedValue(new Response(JSON.stringify({ error: 'Too many reports' }), { status: 429 }))
      const res = await submit(chatReport)
      expect(res.status).toBe(429)
      expect(requestUser).not.toHaveBeenCalled()
      expect(db.reports.create).not.toHaveBeenCalled()
    })

    it('stops at the per-reporter limit, keyed on the reporter and not the address', async () => {
      keyedLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 120 })
      const res = await submit(chatReport)
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('120')
      expect(keyedLimit).toHaveBeenCalledWith('content-report:reporter_1', expect.objectContaining({ maxRequests: 10 }))
      expect(db.reports.create).not.toHaveBeenCalled()
    })
  })

  describe('Discord notification', () => {
    it('posts the target, the reason, the report id and a preview, and records the message id', async () => {
      await submit({ ...chatReport, note: 'They keep doing this, my email is me@example.com' })
      await flushBackgroundWork()

      expect(postMessage).toHaveBeenCalledTimes(1)
      const [url, payload] = postMessage.mock.calls[0]
      expect(url).toBe(WEBHOOK)
      const serialised = JSON.stringify(payload)
      expect(serialised).toContain('report_1')
      expect(serialised).toContain('the stored text')
      expect(serialised).toContain('harassment')
      // Never the reporter, and never the note, which is the reporter's own words.
      expect(serialised).not.toContain('reporter_1')
      expect(serialised).not.toContain('ReporterName')
      expect(serialised).not.toContain('me@example.com')
      // Nor the reported player's id or name: the content is what is shown.
      expect(serialised).not.toContain('offender_1')
      expect(serialised).not.toContain('Offender')
      expect(payload.allowed_mentions).toEqual({ parse: [] })

      expect(db.reports.update).toHaveBeenCalledWith({
        where: { id: 'report_1' },
        data: { discordMessageId: 'discord_msg_1' },
      })
    })

    it('never puts an avatar URL in the channel', async () => {
      db.users.findUnique.mockResolvedValue({
        id: 'offender_1', username: 'Someone', avatarUrl: 'https://cdn.example/avatars/offender_1.png', image: null, bio: null, bot: null,
      })
      await submit({ targetType: 'avatar', targetId: 'offender_1', reason: 'sexual' })
      await flushBackgroundWork()

      const serialised = JSON.stringify(postMessage.mock.calls[0][1])
      expect(serialised).not.toContain('cdn.example')
      expect(db.reports.create.mock.calls[0][0].data.contentSnapshot).toBe('https://cdn.example/avatars/offender_1.png')
    })

    it('still answers 201 when the webhook fails', async () => {
      postMessage.mockRejectedValue(new Error('Discord is down'))
      const res = await submit(chatReport)
      await flushBackgroundWork()
      expect(res.status).toBe(201)
    })
  })
})
