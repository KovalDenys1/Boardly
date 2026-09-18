// @ts-nocheck

import {
  transitionLobbyToWaitingRoom,
  maybeAutoTransitionCompletedSeries,
  getFinishedGameHumanRoster,
} from '@/lib/lobby-series-transition'
import { prisma } from '@/lib/db'
import { createGameEngine } from '@/lib/game-registry'
import { broadcastToLobby } from '@/lib/supabase-server'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'

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

describe('maybeAutoTransitionCompletedSeries', () => {
  const mockTx = {
    games: { create: jest.fn() },
    players: { createMany: jest.fn() },
  }
  const baseParams = { lobbyId: 'lobby-1', lobbyCode: 'ABCD', gameType: 'tic_tac_toe', players: [] }

  const makeEngine = (seriesComplete: boolean) => {
    const engine = new TicTacToeGame('game-1', { maxPlayers: 2, minPlayers: 2, rules: { targetRounds: 3 } })
    jest.spyOn(engine, 'isSeriesComplete').mockReturnValue(seriesComplete)
    return engine
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

  it('triggers the transition once a tic-tac-toe series is complete on a finished game', () => {
    maybeAutoTransitionCompletedSeries(makeEngine(true), 'tic_tac_toe', 'finished', baseParams, jest.fn())
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('does not trigger when the series is not yet complete', () => {
    maybeAutoTransitionCompletedSeries(makeEngine(false), 'tic_tac_toe', 'finished', baseParams, jest.fn())
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('does not trigger for a non-tic-tac-toe game type', () => {
    maybeAutoTransitionCompletedSeries(makeEngine(true), 'connect_four', 'finished', baseParams, jest.fn())
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('does not trigger when the game status is not finished', () => {
    maybeAutoTransitionCompletedSeries(makeEngine(true), 'tic_tac_toe', 'playing', baseParams, jest.fn())
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('reports transition failures via onError instead of throwing', async () => {
    ;(prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const onError = jest.fn()
    maybeAutoTransitionCompletedSeries(makeEngine(true), 'tic_tac_toe', 'finished', baseParams, onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getFinishedGameHumanRoster (#1005)', () => {
  const makeClient = (game: unknown) => ({
    games: { findFirst: jest.fn().mockResolvedValue(game) },
  })

  it('returns the humans still in the newest finished game, in seat order', async () => {
    const client = makeClient({
      players: [
        { userId: 'human-1', user: { bot: null } },
        { userId: 'bot-1', user: { bot: { id: 'bot-row-1' } } },
        { userId: 'human-2', user: { bot: null } },
      ],
    })

    await expect(getFinishedGameHumanRoster(client, 'lobby-1')).resolves.toEqual([
      'human-1',
      'human-2',
    ])
    expect(client.games.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lobbyId: 'lobby-1', status: 'finished' },
        orderBy: { updatedAt: 'desc' },
        select: expect.objectContaining({
          players: expect.objectContaining({ where: { leftAt: null } }),
        }),
      })
    )
  })

  it('returns nothing when the lobby has never finished a game', async () => {
    const client = makeClient(null)

    await expect(getFinishedGameHumanRoster(client, 'lobby-1')).resolves.toEqual([])
  })
})
