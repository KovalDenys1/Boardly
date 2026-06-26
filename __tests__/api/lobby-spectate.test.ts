/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma and route mocks are intentionally lightweight in route tests.

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/lobby/[code]/spectate/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { sanitizeGameStateForSpectator } from '@/lib/spectator-state'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    api: {},
  },
}))

jest.mock('@/lib/lobby-snapshot', () => ({
  pickRelevantLobbyGame: jest.fn((games: any[]) => games[0] || null),
}))

jest.mock('@/lib/spectator-state', () => ({
  sanitizeGameStateForSpectator: jest.fn((_gameType: string, state: string) => state),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockSanitizeGameStateForSpectator = sanitizeGameStateForSpectator as jest.MockedFunction<
  typeof sanitizeGameStateForSpectator
>

describe('GET /api/lobby/[code]/spectate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 404 when lobby is not found', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)
    mockPrisma.lobbies.findUnique.mockResolvedValue(null)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/lobby/ABC123/spectate'),
      { params: Promise.resolve({ code: 'ABC123' }) }
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Lobby not found' })
  })

  it('returns 403 PLAYER_IN_GAME when authenticated user is a player in the active game', async () => {
    mockGetRequestAuthUser.mockResolvedValue({
      id: 'player-1',
      username: 'alice',
      isGuest: false,
    })
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby-1',
      code: 'ABC123',
      name: 'Test Lobby',
      maxPlayers: 4,
      allowSpectators: true,
      maxSpectators: 0,
      spectatorCount: 0,
      turnTimer: 60,
      isActive: true,
      gameType: 'yahtzee',
      createdAt: new Date('2026-02-27T18:00:00.000Z'),
      creator: { id: 'owner-1', username: 'owner' },
      games: [
        {
          id: 'game-1',
          status: 'playing',
          updatedAt: new Date('2026-02-27T18:05:00.000Z'),
          state: JSON.stringify({ status: 'playing' }),
          players: [
            {
              user: {
                id: 'player-1',
                username: 'alice',
                isGuest: false,
                bot: null,
              },
            },
          ],
        },
      ],
    } as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/lobby/ABC123/spectate'),
      { params: Promise.resolve({ code: 'ABC123' }) }
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'PLAYER_IN_GAME' })
  })

  it('removes email fields from creator and players in spectator payload', async () => {
    mockGetRequestAuthUser.mockResolvedValue({
      id: 'user-1',
      username: 'viewer',
      isGuest: false,
    })
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby-1',
      code: 'ABC123',
      name: 'Spectate Lobby',
      maxPlayers: 4,
      allowSpectators: true,
      maxSpectators: 10,
      spectatorCount: 1,
      turnTimer: 60,
      isActive: true,
      gameType: 'yahtzee',
      createdAt: new Date('2026-02-27T18:00:00.000Z'),
      creator: {
        id: 'owner-1',
        username: 'owner',
        email: 'owner@example.com',
      },
      games: [
        {
          id: 'game-1',
          status: 'playing',
          updatedAt: new Date('2026-02-27T18:05:00.000Z'),
          state: JSON.stringify({ status: 'playing' }),
          players: [
            {
              user: {
                id: 'player-1',
                username: 'player',
                email: 'player@example.com',
                isGuest: false,
                bot: null,
              },
            },
          ],
        },
      ],
    } as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/lobby/ABC123/spectate'),
      { params: Promise.resolve({ code: 'ABC123' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lobby.creator.email).toBeUndefined()
    expect(payload.lobby.activeGame.players[0].user.email).toBeUndefined()
    expect(payload.activeGame.players[0].user.email).toBeUndefined()
    expect(payload.activeGame.players[0].user).toEqual({
      id: 'player-1',
      username: 'player',
      isGuest: false,
      isBot: false,
      isPremium: false,
      image: null,
      avatarUrl: null,
      bot: null,
    })
    const queryArgs = mockPrisma.lobbies.findUnique.mock.calls[0][0] as any
    expect(queryArgs.select.creator.select.email).toBeUndefined()
    expect(queryArgs.select.games.include.players.include.user.select.bot.select.difficulty).toBe(true)
    expect(queryArgs.select.games.include.players.include.user.select.email).toBeUndefined()
    expect(mockSanitizeGameStateForSpectator).toHaveBeenCalledTimes(1)
  })

  const baseLobby = {
    id: 'lobby-1',
    code: 'ABC123',
    name: 'Test Lobby',
    maxPlayers: 4,
    allowSpectators: false,
    maxSpectators: 0,
    spectatorCount: 0,
    turnTimer: 60,
    isActive: true,
    gameType: 'yahtzee',
    createdAt: new Date('2026-02-27T18:00:00.000Z'),
    creator: { id: 'owner-1', username: 'owner' },
    games: [],
  }

  it('an admin requesting adminView bypasses the disabled-spectators 403', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'admin-1', username: 'root', isGuest: false })
    mockPrisma.lobbies.findUnique.mockResolvedValue(baseLobby as any)
    mockPrisma.users.findUnique.mockResolvedValue({ role: 'admin', suspended: false } as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/lobby/ABC123/spectate?adminView=true'),
      { params: Promise.resolve({ code: 'ABC123' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.isAdminView).toBe(true)
  })

  it('a non-admin requesting adminView still gets the normal disabled-spectators 403', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1', username: 'bob', isGuest: false })
    mockPrisma.lobbies.findUnique.mockResolvedValue(baseLobby as any)
    mockPrisma.users.findUnique.mockResolvedValue({ role: 'user', suspended: false } as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/lobby/ABC123/spectate?adminView=true'),
      { params: Promise.resolve({ code: 'ABC123' }) }
    )

    expect(response.status).toBe(403)
  })

  it('an admin without adminView gets the normal disabled-spectators 403', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'admin-1', username: 'root', isGuest: false })
    mockPrisma.lobbies.findUnique.mockResolvedValue(baseLobby as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/lobby/ABC123/spectate'),
      { params: Promise.resolve({ code: 'ABC123' }) }
    )

    expect(response.status).toBe(403)
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled()
  })

  it('a guest cannot use adminView even if adminView=true is requested', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'guest-1', username: 'Guest', isGuest: true })
    mockPrisma.lobbies.findUnique.mockResolvedValue(baseLobby as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/lobby/ABC123/spectate?adminView=true'),
      { params: Promise.resolve({ code: 'ABC123' }) }
    )

    expect(response.status).toBe(403)
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled()
  })
})
