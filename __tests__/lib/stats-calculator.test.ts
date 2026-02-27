import { calculateUserStats, type StatsGameInput } from '@/lib/stats-calculator'

const USER_ID = 'user-1'
const OPPONENT_ID = 'user-2'

function buildGame(overrides: Partial<StatsGameInput>): StatsGameInput {
  return {
    id: overrides.id ?? 'game-id',
    gameType: overrides.gameType ?? 'yahtzee',
    status: overrides.status ?? 'finished',
    createdAt: overrides.createdAt ?? '2026-01-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T10:10:00.000Z',
    players:
      overrides.players ??
      [
        {
          userId: USER_ID,
          score: 100,
          finalScore: 100,
          isWinner: true,
          placement: 1,
        },
        {
          userId: OPPONENT_ID,
          score: 90,
          finalScore: 90,
          isWinner: false,
          placement: 2,
        },
      ],
  }
}

describe('calculateUserStats', () => {
  it('calculates overall, per-game, and trend statistics', () => {
    const games: StatsGameInput[] = [
      buildGame({
        id: 'g1',
        gameType: 'yahtzee',
        status: 'finished',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:10:00.000Z',
        players: [
          { userId: USER_ID, score: 120, finalScore: 120, isWinner: true, placement: 1 },
          { userId: OPPONENT_ID, score: 75, finalScore: 75, isWinner: false, placement: 2 },
        ],
      }),
      buildGame({
        id: 'g2',
        gameType: 'yahtzee',
        status: 'finished',
        createdAt: '2026-01-02T11:00:00.000Z',
        updatedAt: '2026-01-02T11:20:00.000Z',
        players: [
          { userId: USER_ID, score: 80, finalScore: 80, isWinner: false, placement: 2 },
          { userId: OPPONENT_ID, score: 115, finalScore: 115, isWinner: true, placement: 1 },
        ],
      }),
      buildGame({
        id: 'g3',
        gameType: 'tic_tac_toe',
        status: 'finished',
        createdAt: '2026-01-03T12:00:00.000Z',
        updatedAt: '2026-01-03T12:05:00.000Z',
        players: [
          { userId: USER_ID, score: 0, finalScore: 0, isWinner: false, placement: 1 },
          { userId: OPPONENT_ID, score: 0, finalScore: 0, isWinner: false, placement: 1 },
        ],
      }),
      buildGame({
        id: 'g4',
        gameType: 'guess_the_spy',
        status: 'abandoned',
        createdAt: '2026-01-04T13:00:00.000Z',
        updatedAt: '2026-01-04T13:25:00.000Z',
        players: [
          { userId: USER_ID, score: 0, finalScore: null, isWinner: false, placement: null },
          { userId: OPPONENT_ID, score: 0, finalScore: null, isWinner: false, placement: null },
        ],
      }),
    ]

    const result = calculateUserStats(USER_ID, games)

    expect(result.overall).toMatchObject({
      totalGames: 4,
      wins: 1,
      losses: 1,
      draws: 1,
      winRate: 33.3,
      avgGameDurationMinutes: 15,
      favoriteGame: 'yahtzee',
      currentWinStreak: 0,
      longestWinStreak: 1,
    })

    const yahtzeeStats = result.byGame.find((entry) => entry.gameType === 'yahtzee')
    expect(yahtzeeStats).toMatchObject({
      gamesPlayed: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      winRate: 50,
      avgScore: 100,
      bestScore: 120,
    })

    const ticTacToeStats = result.byGame.find((entry) => entry.gameType === 'tic_tac_toe')
    expect(ticTacToeStats).toMatchObject({
      gamesPlayed: 1,
      wins: 0,
      losses: 0,
      draws: 1,
      winRate: 0,
      avgScore: 0,
      bestScore: 0,
    })

    expect(result.trends).toEqual([
      { date: '2026-01-01', gamesPlayed: 1, wins: 1 },
      { date: '2026-01-02', gamesPlayed: 1, wins: 0 },
      { date: '2026-01-03', gamesPlayed: 1, wins: 0 },
      { date: '2026-01-04', gamesPlayed: 1, wins: 0 },
    ])
  })

  it('respects date range filtering', () => {
    const games: StatsGameInput[] = [
      buildGame({
        id: 'g1',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:10:00.000Z',
      }),
      buildGame({
        id: 'g2',
        createdAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T10:15:00.000Z',
        players: [
          { userId: USER_ID, score: 50, finalScore: 50, isWinner: false, placement: 2 },
          { userId: OPPONENT_ID, score: 100, finalScore: 100, isWinner: true, placement: 1 },
        ],
      }),
    ]

    const result = calculateUserStats(USER_ID, games, {
      from: new Date('2026-01-10T00:00:00.000Z'),
      to: new Date('2026-01-20T23:59:59.999Z'),
    })

    expect(result.overall.totalGames).toBe(1)
    expect(result.overall.wins).toBe(0)
    expect(result.overall.losses).toBe(1)
    expect(result.trends).toEqual([{ date: '2026-01-15', gamesPlayed: 1, wins: 0 }])
  })

  it('calculates current and longest win streaks', () => {
    const games: StatsGameInput[] = [
      buildGame({
        id: 'g1',
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:10:00.000Z',
        players: [
          { userId: USER_ID, score: 40, finalScore: 40, isWinner: false, placement: 2 },
          { userId: OPPONENT_ID, score: 90, finalScore: 90, isWinner: true, placement: 1 },
        ],
      }),
      buildGame({
        id: 'g2',
        createdAt: '2026-02-02T10:00:00.000Z',
        updatedAt: '2026-02-02T10:10:00.000Z',
        players: [
          { userId: USER_ID, score: 110, finalScore: 110, isWinner: true, placement: 1 },
          { userId: OPPONENT_ID, score: 70, finalScore: 70, isWinner: false, placement: 2 },
        ],
      }),
      buildGame({
        id: 'g3',
        createdAt: '2026-02-03T10:00:00.000Z',
        updatedAt: '2026-02-03T10:10:00.000Z',
        players: [
          { userId: USER_ID, score: 130, finalScore: 130, isWinner: true, placement: 1 },
          { userId: OPPONENT_ID, score: 60, finalScore: 60, isWinner: false, placement: 2 },
        ],
      }),
    ]

    const result = calculateUserStats(USER_ID, games)

    expect(result.overall.currentWinStreak).toBe(2)
    expect(result.overall.longestWinStreak).toBe(2)
  })
})
