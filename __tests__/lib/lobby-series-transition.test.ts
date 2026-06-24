// @ts-nocheck

import { transitionLobbyToWaitingRoom } from '@/lib/lobby-series-transition'
import { prisma } from '@/lib/db'
import { createGameEngine } from '@/lib/game-registry'
import { broadcastToLobby } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    lobbies: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/game-registry', () => ({
  createGameEngine: jest.fn(),
}))

jest.mock('@/lib/persisted-game-state', () => ({
  toPersistedGameStateInput: jest.fn((state) => state),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(),
}))

describe('transitionLobbyToWaitingRoom', () => {
  const mockTx = {
    games: { create: jest.fn() },
    players: { createMany: jest.fn() },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(createGameEngine as jest.Mock).mockReturnValue({
      getState: () => ({ id: 'temp', status: 'waiting', data: {} }),
    })
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockTx))
    mockTx.games.create.mockResolvedValue({ id: 'new-game-id' })
    mockTx.players.createMany.mockResolvedValue({ count: 0 })
    ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
    ;(broadcastToLobby as jest.Mock).mockResolvedValue(true)
  })

  it('creates a fresh waiting game, carries over only human players, reactivates the lobby, and broadcasts game-reset', async () => {
    const result = await transitionLobbyToWaitingRoom({
      lobbyId: 'lobby-1',
      lobbyCode: 'ABCD',
      gameType: 'tic_tac_toe',
      players: [
        { userId: 'human-1', user: { bot: null } },
        { userId: 'bot-1', user: { bot: { id: 'bot-row-1' } } },
        { userId: 'human-2', user: { bot: undefined } },
      ],
    })

    expect(result).toEqual({ gameId: 'new-game-id' })

    expect(mockTx.games.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lobbyId: 'lobby-1',
        gameType: 'tic_tac_toe',
        status: 'waiting',
      }),
      select: { id: true },
    })

    const createManyArg = mockTx.players.createMany.mock.calls[0][0]
    expect(createManyArg.data.map((p: { userId: string }) => p.userId)).toEqual([
      'human-1',
      'human-2',
    ])
    expect(createManyArg.skipDuplicates).toBe(true)

    expect(prisma.lobbies.update).toHaveBeenCalledWith({
      where: { id: 'lobby-1' },
      data: { isActive: true },
    })

    expect(broadcastToLobby).toHaveBeenCalledWith('ABCD', 'game-reset', {
      lobbyCode: 'ABCD',
      gameId: 'new-game-id',
    })
  })

  it('carries over zero players when everyone remaining is a bot', async () => {
    await transitionLobbyToWaitingRoom({
      lobbyId: 'lobby-2',
      lobbyCode: 'WXYZ',
      gameType: 'tic_tac_toe',
      players: [{ userId: 'bot-1', user: { bot: { id: 'bot-row-1' } } }],
    })

    const createManyArg = mockTx.players.createMany.mock.calls[0][0]
    expect(createManyArg.data).toEqual([])
  })
})
