import {
  normalizeLobbySnapshotResponse,
  pickRelevantLobbyGame,
} from '@/lib/lobby-snapshot'

describe('lobby snapshot helpers', () => {
  it('prefers playing game over waiting even if waiting is newer', () => {
    const result = pickRelevantLobbyGame([
      {
        id: 'waiting-1',
        status: 'waiting',
        updatedAt: '2026-02-13T13:00:00.000Z',
      },
      {
        id: 'playing-1',
        status: 'playing',
        updatedAt: '2026-02-13T12:00:00.000Z',
      },
    ] as any[])

    expect((result as any)?.id).toBe('playing-1')
  })

  it('returns finished game only when includeFinished=true', () => {
    const games = [
      {
        id: 'finished-1',
        status: 'finished',
        updatedAt: '2026-02-13T13:00:00.000Z',
      },
    ] as any[]

    expect(pickRelevantLobbyGame(games)).toBeNull()
    expect((pickRelevantLobbyGame(games, { includeFinished: true }) as any)?.id).toBe('finished-1')
  })

  it('includes abandoned/cancelled games when includeFinished=true', () => {
    const games = [
      {
        id: 'cancelled-1',
        status: 'cancelled',
        updatedAt: '2026-02-13T11:00:00.000Z',
      },
      {
        id: 'abandoned-1',
        status: 'abandoned',
        updatedAt: '2026-02-13T12:00:00.000Z',
      },
    ] as any[]

    expect(pickRelevantLobbyGame(games)).toBeNull()
    expect((pickRelevantLobbyGame(games, { includeFinished: true }) as any)?.id).toBe('abandoned-1')
  })

  it('normalizes payload using activeGame fallback chain', () => {
    const payload = {
      lobby: {
        id: 'lobby-1',
        code: 'ABCD',
        games: [
          {
            id: 'waiting-1',
            status: 'waiting',
            updatedAt: '2026-02-13T13:00:00.000Z',
          },
        ],
      },
    }

    const normalized = normalizeLobbySnapshotResponse(payload)
    expect(normalized.lobby?.code).toBe('ABCD')
    expect((normalized.activeGame as any)?.id).toBe('waiting-1')
  })
})
