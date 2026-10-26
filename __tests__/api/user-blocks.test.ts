/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { GET, POST } from '@/app/api/user/blocks/route'
import { DELETE } from '@/app/api/user/blocks/[blockedId]/route'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    users: {
      findUnique: jest.fn(),
    },
    userBlocks: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    api: {},
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

// The write path runs inside prisma.$transaction, so its reads and writes go through this
// object and never through `prisma`: a call that escaped the transaction would find no mock.
const tx = {
  $executeRaw: jest.fn(),
  users: { findMany: jest.fn() },
  userBlocks: { findMany: jest.fn(), createMany: jest.fn() },
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/user/blocks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest() {
  return new NextRequest('http://localhost:3000/api/user/blocks')
}

function deleteRequest(blockedId: string) {
  return new NextRequest(`http://localhost:3000/api/user/blocks/${blockedId}`, { method: 'DELETE' })
}

function blockRow(blockedId: string, username: string | null, createdAt: string) {
  return { blockedId, createdAt: new Date(createdAt), blocked: { username } }
}

describe('/api/user/blocks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({ suspended: false } as any)
    mockPrisma.$transaction.mockImplementation(async (run: any) => run(tx))
    mockPrisma.userBlocks.findMany.mockResolvedValue([] as any)
    mockPrisma.userBlocks.deleteMany.mockResolvedValue({ count: 0 } as any)
    tx.$executeRaw.mockResolvedValue(1)
    tx.userBlocks.findMany.mockResolvedValue([] as any)
    tx.userBlocks.createMany.mockResolvedValue({ count: 0 } as any)
    tx.users.findMany.mockResolvedValue([] as any)
  })

  describe('GET', () => {
    it('lists the caller\'s blocks newest first with the blocked usernames', async () => {
      mockPrisma.userBlocks.findMany.mockResolvedValue([
        blockRow('user-3', 'newer', '2026-10-02T10:00:00.000Z'),
        blockRow('user-2', 'older', '2026-10-01T10:00:00.000Z'),
      ] as any)

      const response = await GET(getRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        blocks: [
          { id: 'user-3', username: 'newer', blockedAt: '2026-10-02T10:00:00.000Z' },
          { id: 'user-2', username: 'older', blockedAt: '2026-10-01T10:00:00.000Z' },
        ],
      })
      const query = mockPrisma.userBlocks.findMany.mock.calls[0][0]
      expect(query.where).toEqual({ blockerId: 'user-1' })
      expect(query.orderBy).toEqual({ createdAt: 'desc' })
    })

    it('answers an empty username for an account without one', async () => {
      mockPrisma.userBlocks.findMany.mockResolvedValue([
        blockRow('user-2', null, '2026-10-01T10:00:00.000Z'),
      ] as any)

      const body = await (await GET(getRequest())).json()

      expect(body.blocks[0].username).toBe('')
    })

    it('answers 401 to a guest', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const response = await GET(getRequest())

      expect(response.status).toBe(401)
      expect(mockPrisma.userBlocks.findMany).not.toHaveBeenCalled()
    })
  })

  describe('POST', () => {
    it('refuses to block yourself', async () => {
      const response = await POST(postRequest({ userIds: ['user-2', 'user-1'] }))

      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('CANNOT_BLOCK_SELF')
      expect(tx.userBlocks.createMany).not.toHaveBeenCalled()
    })

    it('refuses a body that is not 1 to 200 ids', async () => {
      for (const body of [
        {},
        { userIds: [] },
        { userIds: 'user-2' },
        { userIds: [''] },
        { userIds: Array.from({ length: 201 }, (_, i) => `user-${i + 10}`) },
      ]) {
        const response = await POST(postRequest(body))
        expect(response.status).toBe(400)
      }
      expect(tx.userBlocks.createMany).not.toHaveBeenCalled()
    })

    it('refuses a block that would pass 500 in total', async () => {
      tx.userBlocks.findMany.mockResolvedValue(
        Array.from({ length: 499 }, (_, i) => ({ blockedId: `old-${i}` })) as any
      )
      tx.users.findMany.mockResolvedValue([{ id: 'new-1' }, { id: 'new-2' }] as any)

      const response = await POST(postRequest({ userIds: ['new-1', 'new-2'] }))

      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('BLOCK_LIMIT')
      expect(tx.userBlocks.createMany).not.toHaveBeenCalled()
    })

    it('does not count ids that are already blocked towards the limit', async () => {
      tx.userBlocks.findMany.mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, i) => ({ blockedId: `old-${i}` })) as any
      )

      const response = await POST(postRequest({ userIds: ['old-1', 'old-2'] }))

      expect(response.status).toBe(200)
      expect(tx.users.findMany).not.toHaveBeenCalled()
      expect(tx.userBlocks.createMany).not.toHaveBeenCalled()
    })

    it('creates the rows with skipDuplicates so blocking twice leaves one row', async () => {
      tx.users.findMany.mockResolvedValue([{ id: 'user-2' }] as any)

      await POST(postRequest({ userIds: ['user-2', 'user-2'] }))
      await POST(postRequest({ userIds: ['user-2'] }))

      expect(tx.userBlocks.createMany).toHaveBeenCalledTimes(2)
      for (const [args] of tx.userBlocks.createMany.mock.calls) {
        expect(args).toEqual({
          data: [{ blockerId: 'user-1', blockedId: 'user-2' }],
          skipDuplicates: true,
        })
      }
    })

    it('skips ids that match no account', async () => {
      tx.users.findMany.mockResolvedValue([{ id: 'user-2' }] as any)

      const response = await POST(postRequest({ userIds: ['user-2', 'ghost'] }))

      expect(response.status).toBe(200)
      expect(tx.userBlocks.createMany.mock.calls[0][0].data).toEqual([
        { blockerId: 'user-1', blockedId: 'user-2' },
      ])
    })

    it('answers the full list after the write', async () => {
      tx.users.findMany.mockResolvedValue([{ id: 'user-2' }] as any)
      mockPrisma.userBlocks.findMany.mockResolvedValue([
        blockRow('user-2', 'someone', '2026-10-01T10:00:00.000Z'),
      ] as any)

      const response = await POST(postRequest({ userIds: ['user-2'] }))

      expect(await response.json()).toEqual({
        blocks: [{ id: 'user-2', username: 'someone', blockedAt: '2026-10-01T10:00:00.000Z' }],
      })
    })

    it('takes the per-account lock before it counts, so concurrent posts cannot pass the cap', async () => {
      tx.users.findMany.mockResolvedValue([{ id: 'user-2' }] as any)

      await POST(postRequest({ userIds: ['user-2'] }))

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      const [strings, ...values] = tx.$executeRaw.mock.calls[0]
      expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtext(?))')
      expect(values).toEqual(['user-1'])
      const lockedAt = tx.$executeRaw.mock.invocationCallOrder[0]
      expect(lockedAt).toBeLessThan(tx.userBlocks.findMany.mock.invocationCallOrder[0])
      expect(lockedAt).toBeLessThan(tx.userBlocks.createMany.mock.invocationCallOrder[0])
    })

    it('writes nothing on the limit path', async () => {
      tx.userBlocks.findMany.mockResolvedValue(
        Array.from({ length: 500 }, (_, i) => ({ blockedId: `old-${i}` })) as any
      )
      tx.users.findMany.mockResolvedValue([{ id: 'new-1' }] as any)

      const response = await POST(postRequest({ userIds: ['new-1'] }))

      expect(response.status).toBe(400)
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      expect(tx.userBlocks.createMany).not.toHaveBeenCalled()
      expect(mockPrisma.userBlocks.findMany).not.toHaveBeenCalled()
    })

    it('answers 401 to a guest', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const response = await POST(postRequest({ userIds: ['user-2'] }))

      expect(response.status).toBe(401)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('DELETE', () => {
    it('removes only the caller\'s own row', async () => {
      const response = await DELETE(deleteRequest('user-2'), {
        params: Promise.resolve({ blockedId: 'user-2' }),
      })

      expect(response.status).toBe(204)
      expect(mockPrisma.userBlocks.deleteMany).toHaveBeenCalledWith({
        where: { blockerId: 'user-1', blockedId: 'user-2' },
      })
    })

    it('refuses an id longer than a POST accepts', async () => {
      const blockedId = 'x'.repeat(129)

      const response = await DELETE(deleteRequest(blockedId), {
        params: Promise.resolve({ blockedId }),
      })

      expect(response.status).toBe(400)
      expect(mockPrisma.userBlocks.deleteMany).not.toHaveBeenCalled()
    })

    it('answers 401 to a guest', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const response = await DELETE(deleteRequest('user-2'), {
        params: Promise.resolve({ blockedId: 'user-2' }),
      })

      expect(response.status).toBe(401)
      expect(mockPrisma.userBlocks.deleteMany).not.toHaveBeenCalled()
    })
  })
})
