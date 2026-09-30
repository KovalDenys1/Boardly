/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/spy-init/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getActiveSpyLocations } from '@/lib/spy-locations'
import { SpyGame, SpyGameData } from '@/lib/games/spy-game'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/spy-locations', () => ({
  getActiveSpyLocations: jest.fn(),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn().mockResolvedValue(true),
}))

jest.mock('@/lib/game-replay', () => ({
  appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const LOCATIONS = [
  { name: 'Airport', category: 'Travel', roles: ['Pilot', 'Passenger', 'Security Guard', 'Mechanic'] },
]
const PLAYER_IDS = ['host', 'player-2', 'player-3', 'player-4']

function waitingState(leftId?: string) {
  const game = new SpyGame('game-123')
  for (const id of PLAYER_IDS) game.addPlayer({ id, name: id })
  game.startGame()
  if (leftId) game.handlePlayerLeave(leftId)
  return JSON.stringify(game.getState())
}

function row(state: string, updatedAt: Date) {
  return {
    id: 'game-123',
    state,
    status: 'playing',
    gameType: 'guess_the_spy',
    currentTurn: 0,
    updatedAt,
    lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'guess_the_spy', creatorId: 'host' },
  }
}

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/game/game-123/spy-init', { method: 'POST' })
}

const READ_AT = new Date('2026-09-30T10:00:00.000Z')
const LEAVE_AT = new Date('2026-09-30T10:00:01.000Z')

/**
 * #1277: spy-init wrote on the primary key alone. A leave that committed while
 * it fetched the locations was overwritten with the snapshot read before it,
 * so the departed player was active again next round and could be dealt the spy.
 */
describe('POST /api/game/[gameId]/spy-init optimistic lock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'host', username: 'Host', isGuest: false })
    ;(getActiveSpyLocations as jest.Mock).mockResolvedValue({ locations: LOCATIONS, source: 'database' })
  })

  it('writes only while the row still carries the revision it read', async () => {
    ;(prisma.games.findUnique as jest.Mock).mockResolvedValueOnce(row(waitingState(), READ_AT))
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })

    const response = await POST(buildRequest(), { params: Promise.resolve({ gameId: 'game-123' }) })

    expect(response.status).toBe(200)
    expect(prisma.games.update).not.toHaveBeenCalled()
    expect(prisma.games.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'game-123', currentTurn: 0, updatedAt: READ_AT } })
    )
  })

  it('deals the round on the row a leave committed, never to the player who left', async () => {
    ;(prisma.games.findUnique as jest.Mock)
      .mockResolvedValueOnce(row(waitingState(), READ_AT))
      .mockResolvedValueOnce(row(waitingState('player-3'), LEAVE_AT))
    ;(prisma.games.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })

    const response = await POST(buildRequest(), { params: Promise.resolve({ gameId: 'game-123' }) })

    expect(response.status).toBe(200)
    expect(prisma.games.update).not.toHaveBeenCalled()
    expect(prisma.games.updateMany).toHaveBeenCalledTimes(2)
    const second = (prisma.games.updateMany as jest.Mock).mock.calls[1][0]
    expect(second.where).toEqual({ id: 'game-123', currentTurn: 0, updatedAt: LEAVE_AT })
    const written = second.data.state as { players: Array<{ id: string; isActive?: boolean }>; data: SpyGameData }
    expect(written.players.find((p) => p.id === 'player-3')?.isActive).toBe(false)
    expect(written.data.spyPlayerId).not.toBe('player-3')
    expect(written.data.playerRoles['player-3']).toBeUndefined()
    // Locations are fetched once; only the row is read again.
    expect(getActiveSpyLocations).toHaveBeenCalledTimes(1)
  })

  it('answers 409 STATE_CONFLICT when the row keeps changing', async () => {
    ;(prisma.games.findUnique as jest.Mock).mockResolvedValue(row(waitingState(), READ_AT))
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 0 })

    const response = await POST(buildRequest(), { params: Promise.resolve({ gameId: 'game-123' }) })

    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('STATE_CONFLICT')
    expect(prisma.games.update).not.toHaveBeenCalled()
  })

  it('refuses the re-read row when a move already started the round', async () => {
    const started = new SpyGame('game-123')
    started.restoreState(JSON.parse(waitingState()))
    started.initializeRound(LOCATIONS)
    ;(prisma.games.findUnique as jest.Mock)
      .mockResolvedValueOnce(row(waitingState(), READ_AT))
      .mockResolvedValueOnce(row(JSON.stringify(started.getState()), LEAVE_AT))
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 })

    const response = await POST(buildRequest(), { params: Promise.resolve({ gameId: 'game-123' }) })

    expect(response.status).toBe(400)
    expect(prisma.games.updateMany).toHaveBeenCalledTimes(1)
  })
})
