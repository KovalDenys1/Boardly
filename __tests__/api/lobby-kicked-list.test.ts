/** @jest-environment node */
import { GET } from '@/app/api/lobby/[code]/kick-player/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'

jest.mock('@/lib/db', () => ({
  prisma: { lobbies: { findUnique: jest.fn() }, users: { findMany: jest.fn() } },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitPresets: { api: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const HOST = 'host-1'

function req() {
  return new Request('http://localhost/api/lobby/ABCD/kick-player') as never
}
const params = { params: Promise.resolve({ code: 'ABCD' }) }

describe('GET kick-player – the host sees who was removed (#899 / #1024)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: HOST })
  })

  it('names the removed players, in the order they were kicked', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      creatorId: HOST,
      kickedUserIds: ['kicked-1', 'kicked-2'],
    })
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([
      { id: 'kicked-2', username: 'Bea', image: null, avatarUrl: '/bea.png' },
      { id: 'kicked-1', username: 'Ann', image: '/ann.png', avatarUrl: null },
    ])

    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      kickedPlayers: [
        { userId: 'kicked-1', username: 'Ann', avatarUrl: '/ann.png' },
        { userId: 'kicked-2', username: 'Bea', avatarUrl: '/bea.png' },
      ],
    })
  })

  it('keeps an id whose account is gone, because that entry still needs clearing', async () => {
    // Guest rows are hard-deleted after three days; the id stays on kickedUserIds.
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      creatorId: HOST,
      kickedUserIds: ['ghost-1'],
    })
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])

    const res = await GET(req(), params)
    expect(await res.json()).toEqual({
      kickedPlayers: [{ userId: 'ghost-1', username: null, avatarUrl: null }],
    })
  })

  it('asks for kickedUserIds by name, because lib/db.ts omits it globally', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      creatorId: HOST,
      kickedUserIds: ['kicked-1'],
    })
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])

    await GET(req(), params)
    const query = (prisma.lobbies.findUnique as jest.Mock).mock.calls[0][0]
    expect(query.select.kickedUserIds).toBe(true)
    // Prisma refuses select and omit in the same query.
    expect(query.omit).toBeUndefined()
  })

  it('never selects the email address, which this list renders next to a name', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      creatorId: HOST,
      kickedUserIds: ['kicked-1'],
    })
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])

    await GET(req(), params)
    const userQuery = (prisma.users.findMany as jest.Mock).mock.calls[0][0]
    expect(Object.keys(userQuery.select).sort()).toEqual(['avatarUrl', 'id', 'image', 'username'])
  })

  it('does not look up users when nobody was removed', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      creatorId: HOST,
      kickedUserIds: [],
    })

    const res = await GET(req(), params)
    expect(await res.json()).toEqual({ kickedPlayers: [] })
    expect(prisma.users.findMany).not.toHaveBeenCalled()
  })

  it('refuses anyone who is not the host', async () => {
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'someone-else' })
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      creatorId: HOST,
      kickedUserIds: ['kicked-1'],
    })

    const res = await GET(req(), params)
    expect(res.status).toBe(403)
    expect(prisma.users.findMany).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue(null)
    const res = await GET(req(), params)
    expect(res.status).toBe(401)
  })

  it('404s on a lobby that is not there', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(null)
    const res = await GET(req(), params)
    expect(res.status).toBe(404)
  })
})
