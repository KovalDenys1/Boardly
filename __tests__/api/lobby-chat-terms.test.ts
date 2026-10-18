/**
 * @jest-environment @edge-runtime/jest-environment
 */

/**
 * #1466: Google Play's user-generated-content policy wants the terms accepted
 * before a person can post. The chat route is the one place a message enters
 * the product, so the gate lives here, and POST /api/user/accept-terms is what
 * lifts it. Guests and old registered accounts both start with a null date.
 */

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/lobby/[code]/chat/route'
import { POST as acceptTerms } from '@/app/api/user/accept-terms/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { persistChatMessage } from '@/lib/chat-history'
import { broadcastToLobby } from '@/lib/supabase-server'

type Row = { termsAcceptedAt: Date | null; bot: { id: string } | null }
const rows = new Map<string, Row>()

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: { findUnique: jest.fn() },
    games: { findUnique: jest.fn() },
    users: { findUnique: jest.fn(), updateMany: jest.fn() },
  },
}))

jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/chat-history', () => ({
  persistChatMessage: jest.fn().mockResolvedValue(undefined),
  getChatHistory: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { api: {}, lobbyChatPost: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockAuth = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockPersist = persistChatMessage as jest.MockedFunction<typeof persistChatMessage>
const mockBroadcast = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>
const mockUsers = prisma.users as unknown as { findUnique: jest.Mock; updateMany: jest.Mock }

const ACCEPTED = new Date('2026-10-01T08:30:00.000Z')

function seedUser(id: string, row: Partial<Row> = {}, isGuest = false) {
  rows.set(id, { termsAcceptedAt: null, bot: null, ...row })
  mockAuth.mockResolvedValue({ id, username: 'Someone', isGuest } as never)
}

function seedLobby({ member = true } = {}) {
  ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
    id: 'lobby-1',
    games: [{ id: 'game-1', gameType: 'tic_tac_toe', status: 'playing', players: member ? [{ id: 'p-1' }] : [] }],
  })
}

const params = { params: Promise.resolve({ code: 'ABCD12' }) }
const post = () =>
  POST(
    new NextRequest('http://localhost:3000/api/lobby/ABCD12/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'good game' }),
    }),
    params
  )
const get = () => GET(new NextRequest('http://localhost:3000/api/lobby/ABCD12/chat'), params)

describe('lobby chat asks for the terms before the first message (#1466)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    rows.clear()
    mockBroadcast.mockResolvedValue(true as never)
    mockPersist.mockResolvedValue(undefined as never)
    mockUsers.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null)
    mockUsers.updateMany.mockImplementation(
      async ({ where, data }: { where: { id: string; termsAcceptedAt: null }; data: { termsAcceptedAt: Date } }) => {
        const row = rows.get(where.id)
        if (!row || row.termsAcceptedAt !== null) return { count: 0 }
        row.termsAcceptedAt = data.termsAcceptedAt
        return { count: 1 }
      }
    )
    seedLobby()
  })

  describe('POST', () => {
    it('refuses a guest who has not accepted, with TERMS_REQUIRED, and sends nothing', async () => {
      seedUser('guest-1', {}, true)

      const response = await post()

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual(expect.objectContaining({ code: 'TERMS_REQUIRED' }))
      expect(mockPersist).not.toHaveBeenCalled()
      expect(mockBroadcast).not.toHaveBeenCalled()
    })

    it('lets the same guest through once they have accepted', async () => {
      seedUser('guest-1', {}, true)
      expect((await post()).status).toBe(403)

      const accepted = await acceptTerms(new NextRequest('http://localhost:3000/api/user/accept-terms', { method: 'POST' }))
      expect(accepted.status).toBe(200)

      const response = await post()
      expect(response.status).toBe(200)
      expect(mockPersist).toHaveBeenCalledTimes(1)
      expect(mockBroadcast).toHaveBeenCalledTimes(1)
    })

    it('gates a registered account that predates the terms too', async () => {
      seedUser('user-1')

      const response = await post()

      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('TERMS_REQUIRED')
      expect(mockBroadcast).not.toHaveBeenCalled()
    })

    it('lets someone who accepted earlier post', async () => {
      seedUser('user-1', { termsAcceptedAt: ACCEPTED })

      expect((await post()).status).toBe(200)
    })

    it('never refuses a bot', async () => {
      seedUser('bot-user', { bot: { id: 'bot-1' } })

      const response = await post()

      expect(response.status).toBe(200)
      expect(mockBroadcast).toHaveBeenCalledTimes(1)
    })

    it('answers a non-player with the plain Forbidden, not with the terms prompt', async () => {
      seedLobby({ member: false })
      seedUser('guest-1', {}, true)

      const response = await post()

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Forbidden' })
    })
  })

  describe('GET', () => {
    it('tells a viewer who has not accepted', async () => {
      seedUser('guest-1', {}, true)

      const response = await get()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ messages: [], viewer: { termsAccepted: false } })
    })

    it('tells a viewer who has', async () => {
      seedUser('user-1', { termsAcceptedAt: ACCEPTED })

      const response = await get()

      expect(await response.json()).toEqual({ messages: [], viewer: { termsAccepted: true } })
    })
  })
})
