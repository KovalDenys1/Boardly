/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are intentionally loose here
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lobby/[code]/rematch/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby, broadcastToUser } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({ prisma: { lobbies: { findUnique: jest.fn() } } }))
jest.mock('@/lib/logger', () => ({ apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn(() => jest.fn(async () => null)), rateLimitPresets: { lobbyRematch: {} } }))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn(), broadcastToUser: jest.fn() }))
jest.mock('@/lib/in-app-notifications', () => ({ createInAppNotification: jest.fn() }))

const lobby = {
  id: 'lobby-1', code: 'AB12', name: 'Lobby', gameType: 'tic_tac_toe', creatorId: 'host-1',
  games: [{ id: 'game-1', players: [{ userId: 'host-1' }, { userId: 'guest-2' }] }],
}

function ask(userId: string, username: string) {
  getRequestAuthUser.mockResolvedValue({ id: userId, username })
  return POST(new NextRequest('http://localhost:3000/api/lobby/AB12/rematch', { method: 'POST' }), { params: Promise.resolve({ code: 'AB12' }) })
}

describe('POST /api/lobby/[code]/rematch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.lobbies.findUnique.mockResolvedValue(lobby)
  })

  it("tells the lobby's channel who asked, so a guest host's end screen hears it", async () => {
    const res = await ask('guest-2', 'Ada')

    expect(res.status).toBe(200)
    expect(broadcastToLobby).toHaveBeenCalledWith('AB12', 'rematch-request', { requestedById: 'guest-2', requestedByName: 'Ada' })
    expect(broadcastToUser).toHaveBeenCalledWith('host-1', 'rematch-request', expect.anything())
  })

  it('sends nothing to the lobby when the host asks the others', async () => {
    await ask('host-1', 'Host')

    expect(broadcastToLobby).not.toHaveBeenCalled()
  })

  it('refuses someone who did not play the game', async () => {
    const res = await ask('stranger', 'Eve')

    expect(res.status).toBe(403)
    expect(broadcastToLobby).not.toHaveBeenCalled()
  })
})
