/** @jest-environment node */
import { DELETE } from '@/app/api/lobby/[code]/kick-player/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({
  prisma: { lobbies: { findUnique: jest.fn(), update: jest.fn() } },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitPresets: { api: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const HOST = 'host-1'
const KICKED = 'kicked-1'

function req(body: unknown) {
  return new Request('http://localhost/api/lobby/ABCD/kick-player', {
    method: 'DELETE',
    body: JSON.stringify(body),
  }) as never
}
const params = { params: Promise.resolve({ code: 'ABCD' }) }

function lobby(over: Record<string, unknown> = {}) {
  return { id: 'lobby-1', creatorId: HOST, isActive: true, kickedUserIds: [KICKED], ...over }
}

describe('DELETE kick-player — the host lets someone back in (#1024)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: HOST })
    ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
  })

  it('removes only that player from the kick list', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(
      lobby({ kickedUserIds: [KICKED, 'someone-else'] })
    )

    const res = await DELETE(req({ userId: KICKED }), params)
    expect(res.status).toBe(200)
    expect((prisma.lobbies.update as jest.Mock).mock.calls[0][0].data).toEqual({
      kickedUserIds: ['someone-else'],
    })
  })

  it('asks for kickedUserIds by name, because lib/db.ts omits it globally', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(lobby())
    await DELETE(req({ userId: KICKED }), params)
    const query = (prisma.lobbies.findUnique as jest.Mock).mock.calls[0][0]
    expect(query.select.kickedUserIds).toBe(true)
    // Prisma refuses select and omit in the same query.
    expect(query.omit).toBeUndefined()
  })

  it('tells the room, so the kicked player is shown as welcome again', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(lobby())
    await DELETE(req({ userId: KICKED }), params)
    expect(broadcastToLobby).toHaveBeenCalledWith('ABCD', 'player-unkicked', {
      lobbyCode: 'ABCD',
      userId: KICKED,
    })
  })

  it('refuses anyone who is not the host', async () => {
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'someone-else' })
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(lobby())

    const res = await DELETE(req({ userId: KICKED }), params)
    expect(res.status).toBe(403)
    expect(prisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue(null)
    const res = await DELETE(req({ userId: KICKED }), params)
    expect(res.status).toBe(401)
  })

  it('will not reopen a lobby that is over', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(lobby({ isActive: false }))
    const res = await DELETE(req({ userId: KICKED }), params)
    expect(res.status).toBe(409)
    expect(prisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('is fine with a player who was never kicked, and writes nothing', async () => {
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(lobby({ kickedUserIds: [] }))
    const res = await DELETE(req({ userId: KICKED }), params)
    expect(res.status).toBe(200)
    expect(prisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('rejects a missing userId', async () => {
    const res = await DELETE(req({}), params)
    expect(res.status).toBe(400)
  })
})
