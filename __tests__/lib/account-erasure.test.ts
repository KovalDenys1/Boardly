import { gunzipSync, gzipSync } from 'node:zlib'
import { prisma } from '@/lib/db'
import {
  DELETED_PLAYER_NAME,
  detachFeedbackFrom,
  scrubErasedPlayers,
  scrubPlayersFromGameRecords,
} from '@/lib/account-erasure'

jest.mock('@/lib/db', () => ({
  prisma: {
    players: { findMany: jest.fn() },
    games: { findUnique: jest.fn(), updateMany: jest.fn() },
    gameStateSnapshots: { findMany: jest.fn(), update: jest.fn() },
    feedback: { updateMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const ERASED = { id: 'guest-erased', username: 'Denys' }
const OTHER = 'user-other'

const gameState = () => ({
  players: [
    { id: ERASED.id, name: 'Denys', score: 12 },
    { id: OTHER, name: 'Ann', score: 9 },
  ],
  currentPlayerIndex: 1,
  data: {
    teams: [{ id: 'team-1', name: 'Team 1', playerIds: [ERASED.id] }],
    questions: [
      { askerId: ERASED.id, askerName: 'Denys', targetId: OTHER, targetName: 'Ann', question: 'Where?' },
      { askerId: OTHER, askerName: 'Ann', targetId: ERASED.id, targetName: 'Denys', question: 'Why?' },
    ],
    results: [{ playerId: ERASED.id, playerName: 'Denys', totalScore: 12 }],
    winnerName: 'Denys',
  },
})

describe('scrubErasedPlayers (#1128)', () => {
  it('replaces the erased name everywhere it is tied to them and nowhere else', () => {
    const { value, changed } = scrubErasedPlayers(gameState(), [ERASED])
    const state = value as ReturnType<typeof gameState>

    expect(changed).toBe(true)
    expect(state.players[0]).toEqual({ id: ERASED.id, name: DELETED_PLAYER_NAME, score: 12 })
    expect(state.players[1].name).toBe('Ann')
    expect(state.data.questions[0].askerName).toBe(DELETED_PLAYER_NAME)
    expect(state.data.questions[0].targetName).toBe('Ann')
    expect(state.data.questions[1].askerName).toBe('Ann')
    expect(state.data.questions[1].targetName).toBe(DELETED_PLAYER_NAME)
    expect(state.data.results[0].playerName).toBe(DELETED_PLAYER_NAME)
    expect(state.data.winnerName).toBe(DELETED_PLAYER_NAME)
    // Ids, scores and structure survive – only the name goes.
    expect(state.data.teams[0]).toEqual({ id: 'team-1', name: 'Team 1', playerIds: [ERASED.id] })
    expect(JSON.stringify(state)).not.toContain('"Denys"')
  })

  it('leaves a team alone even when a player once used its name', () => {
    const { value } = scrubErasedPlayers(gameState(), [{ id: ERASED.id, username: 'Team 1' }])
    expect((value as ReturnType<typeof gameState>).data.teams[0].name).toBe('Team 1')
  })

  it('returns the input by reference when nothing matches, so the caller skips the write', () => {
    const state = gameState()
    const result = scrubErasedPlayers(state, [{ id: 'someone-else', username: 'Zed' }])
    expect(result.changed).toBe(false)
    expect(result.value).toBe(state)
  })

  it('does not mutate the stored object it was given', () => {
    const state = gameState()
    scrubErasedPlayers(state, [ERASED])
    expect(state.players[0].name).toBe('Denys')
  })
})

describe('scrubPlayersFromGameRecords (#1128)', () => {
  const updatedAt = new Date('2026-09-01T00:00:00Z')
  const encoded = (state: unknown) => gzipSync(Buffer.from(JSON.stringify(state), 'utf-8')).toString('base64')

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.players.findMany as jest.Mock).mockResolvedValue([{ gameId: 'g1' }])
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'g1' }, { id: 'g2' }])
    ;(prisma.gameStateSnapshots.findMany as jest.Mock).mockImplementation(async (args: { where: { gameId?: string } }) => {
      if (!args.where.gameId) return [{ gameId: 'g2' }]
      if (args.where.gameId === 'g1') {
        return [
          { id: 's1', stateCompressed: encoded(gameState()), stateEncoding: 'gzip-base64', actionPayload: null },
          { id: 's2', stateCompressed: encoded({ players: [{ id: OTHER, name: 'Ann' }] }), stateEncoding: 'gzip-base64', actionPayload: null },
        ]
      }
      return []
    })
    ;(prisma.games.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'g1' ? { state: gameState(), updatedAt } : { state: { players: [] }, updatedAt }
    )
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.gameStateSnapshots.update as jest.Mock).mockResolvedValue({})
  })

  it('rewrites the game state and the snapshots that name the player, and only those', async () => {
    const result = await scrubPlayersFromGameRecords([ERASED])

    expect(result).toEqual({ games: 1, snapshots: 1 })

    expect(prisma.games.updateMany).toHaveBeenCalledTimes(1)
    const gameWrite = (prisma.games.updateMany as jest.Mock).mock.calls[0][0]
    // Guarded on updatedAt so a move landing between read and write is never overwritten.
    expect(gameWrite.where).toEqual({ id: 'g1', updatedAt })
    expect(JSON.stringify(gameWrite.data.state)).not.toContain('"Denys"')

    expect(prisma.gameStateSnapshots.update).toHaveBeenCalledTimes(1)
    const snapshotWrite = (prisma.gameStateSnapshots.update as jest.Mock).mock.calls[0][0]
    expect(snapshotWrite.where).toEqual({ id: 's1' })
    expect(snapshotWrite.data.stateEncoding).toBe('gzip-base64')
    const restored = gunzipSync(Buffer.from(snapshotWrite.data.stateCompressed, 'base64')).toString('utf-8')
    expect(restored).not.toContain('"Denys"')
    expect(restored).toContain(DELETED_PLAYER_NAME)
  })

  it('looks the games up by Players row, by id in the stored state and by recorded move', async () => {
    await scrubPlayersFromGameRecords([ERASED])

    expect(prisma.players.findMany).toHaveBeenCalledWith({ where: { userId: { in: [ERASED.id] } }, select: { gameId: true } })
    expect(prisma.gameStateSnapshots.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: { in: [ERASED.id] } } })
    )
    const games = (prisma.games.findUnique as jest.Mock).mock.calls.map(([args]) => args.where.id)
    expect(games.sort()).toEqual(['g1', 'g2'])
  })

  it('retries once when the game moved under it, then gives up rather than overwrite', async () => {
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 0 })

    const result = await scrubPlayersFromGameRecords([ERASED])

    expect(result.games).toBe(0)
    expect(prisma.games.updateMany).toHaveBeenCalledTimes(2)
  })

  it('does nothing for an empty list', async () => {
    await expect(scrubPlayersFromGameRecords([])).resolves.toEqual({ games: 0, snapshots: 0 })
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })
})

describe('detachFeedbackFrom (#1128)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.feedback.updateMany as jest.Mock).mockResolvedValue({ count: 2 })
  })

  it('nulls the email and the user link by id and by address', async () => {
    await expect(detachFeedbackFrom(['u1'], 'Ann@Example.com')).resolves.toBe(2)

    expect(prisma.feedback.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: { in: ['u1'] } }, { email: { in: ['Ann@Example.com', 'ann@example.com'] } }] },
      data: { email: null, userId: null },
    })
  })

  it('matches guests by id only', async () => {
    await detachFeedbackFrom(['guest-1'])

    expect(prisma.feedback.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: { in: ['guest-1'] } }] },
      data: { email: null, userId: null },
    })
  })
})
