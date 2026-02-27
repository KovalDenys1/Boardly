export type GameOutcome = 'win' | 'loss' | 'draw'

export interface StatsPlayerInput {
  userId: string
  score: number
  finalScore: number | null
  isWinner: boolean
  placement: number | null
}

export interface StatsGameInput {
  id: string
  gameType: string
  status: string
  createdAt: Date | string
  updatedAt: Date | string
  players: StatsPlayerInput[]
}

export interface CalculateUserStatsOptions {
  from?: Date | null
  to?: Date | null
}

export interface UserOverallStats {
  totalGames: number
  wins: number
  losses: number
  draws: number
  winRate: number
  avgGameDurationMinutes: number
  favoriteGame: string | null
  currentWinStreak: number
  longestWinStreak: number
}

export interface UserByGameStats {
  gameType: string
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
  winRate: number
  avgScore: number | null
  bestScore: number | null
  lastPlayed: string | null
}

export interface UserTrendPoint {
  date: string
  gamesPlayed: number
  wins: number
}

export interface UserStatsDashboard {
  overall: UserOverallStats
  byGame: UserByGameStats[]
  trends: UserTrendPoint[]
  dateRange: {
    from: string | null
    to: string | null
  }
  generatedAt: string
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function normalizeOutcome(game: StatsGameInput, player: StatsPlayerInput | undefined): GameOutcome | null {
  if (!player || game.status !== 'finished') {
    return null
  }

  const winnerCount = game.players.filter((entry) => entry.isWinner).length
  if (winnerCount === 0) {
    return 'draw'
  }
  if (player.isWinner && winnerCount > 1) {
    return 'draw'
  }
  if (player.isWinner) {
    return 'win'
  }
  return 'loss'
}

export function calculateUserStats(
  userId: string,
  games: StatsGameInput[],
  options: CalculateUserStatsOptions = {}
): UserStatsDashboard {
  const from = options.from ?? null
  const to = options.to ?? null

  const eligibleGames = games.filter((game) => {
    const createdAt = toDate(game.createdAt)
    if (from && createdAt < from) return false
    if (to && createdAt > to) return false
    return true
  })

  const completedGames = eligibleGames.filter((game) =>
    game.status === 'finished' || game.status === 'abandoned' || game.status === 'cancelled'
  )

  const finishedGames = completedGames.filter((game) => game.status === 'finished')

  let wins = 0
  let losses = 0
  let draws = 0
  let durationSumMs = 0
  let durationCount = 0

  const byGameMap = new Map<
    string,
    {
      gamesPlayed: number
      wins: number
      losses: number
      draws: number
      scoreSum: number
      scoreCount: number
      bestScore: number | null
      lastPlayedAt: Date | null
    }
  >()

  const trendMap = new Map<string, { gamesPlayed: number; wins: number }>()

  for (const game of completedGames) {
    const createdAt = toDate(game.createdAt)
    const updatedAt = toDate(game.updatedAt)
    const durationMs = Math.max(updatedAt.getTime() - createdAt.getTime(), 0)
    durationSumMs += durationMs
    durationCount += 1

    const player = game.players.find((entry) => entry.userId === userId)
    if (!player) continue

    const outcome = normalizeOutcome(game, player)
    if (outcome === 'win') wins += 1
    if (outcome === 'loss') losses += 1
    if (outcome === 'draw') draws += 1

    const byGameEntry =
      byGameMap.get(game.gameType) ??
      {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        scoreSum: 0,
        scoreCount: 0,
        bestScore: null as number | null,
        lastPlayedAt: null as Date | null,
      }

    byGameEntry.gamesPlayed += 1
    if (outcome === 'win') byGameEntry.wins += 1
    if (outcome === 'loss') byGameEntry.losses += 1
    if (outcome === 'draw') byGameEntry.draws += 1

    const normalizedScore = player.finalScore ?? player.score
    if (Number.isFinite(normalizedScore)) {
      byGameEntry.scoreSum += normalizedScore
      byGameEntry.scoreCount += 1
      byGameEntry.bestScore =
        byGameEntry.bestScore === null ? normalizedScore : Math.max(byGameEntry.bestScore, normalizedScore)
    }

    if (!byGameEntry.lastPlayedAt || updatedAt > byGameEntry.lastPlayedAt) {
      byGameEntry.lastPlayedAt = updatedAt
    }

    byGameMap.set(game.gameType, byGameEntry)

    const trendKey = toIsoDay(updatedAt)
    const trendEntry = trendMap.get(trendKey) ?? { gamesPlayed: 0, wins: 0 }
    trendEntry.gamesPlayed += 1
    if (outcome === 'win') {
      trendEntry.wins += 1
    }
    trendMap.set(trendKey, trendEntry)
  }

  const byGame = Array.from(byGameMap.entries())
    .map(([gameType, entry]) => {
      const denominator = entry.wins + entry.losses + entry.draws
      const winRate = denominator > 0 ? roundToOneDecimal((entry.wins / denominator) * 100) : 0

      return {
        gameType,
        gamesPlayed: entry.gamesPlayed,
        wins: entry.wins,
        losses: entry.losses,
        draws: entry.draws,
        winRate,
        avgScore: entry.scoreCount > 0 ? roundToOneDecimal(entry.scoreSum / entry.scoreCount) : null,
        bestScore: entry.bestScore,
        lastPlayed: entry.lastPlayedAt ? entry.lastPlayedAt.toISOString() : null,
      }
    })
    .sort((a, b) => {
      if (b.gamesPlayed !== a.gamesPlayed) {
        return b.gamesPlayed - a.gamesPlayed
      }
      return a.gameType.localeCompare(b.gameType)
    })

  const favoriteGame = byGame.length > 0 ? byGame[0].gameType : null

  const orderedFinishedGames = finishedGames
    .map((game) => ({
      updatedAt: toDate(game.updatedAt),
      outcome: normalizeOutcome(game, game.players.find((player) => player.userId === userId)),
    }))
    .filter((entry): entry is { updatedAt: Date; outcome: GameOutcome } => entry.outcome !== null)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())

  let longestWinStreak = 0
  let runningWinStreak = 0
  for (const entry of orderedFinishedGames) {
    if (entry.outcome === 'win') {
      runningWinStreak += 1
      longestWinStreak = Math.max(longestWinStreak, runningWinStreak)
    } else {
      runningWinStreak = 0
    }
  }

  let currentWinStreak = 0
  for (let i = orderedFinishedGames.length - 1; i >= 0; i -= 1) {
    if (orderedFinishedGames[i].outcome === 'win') {
      currentWinStreak += 1
      continue
    }
    break
  }

  const outcomeDenominator = wins + losses + draws
  const overall: UserOverallStats = {
    totalGames: completedGames.length,
    wins,
    losses,
    draws,
    winRate: outcomeDenominator > 0 ? roundToOneDecimal((wins / outcomeDenominator) * 100) : 0,
    avgGameDurationMinutes: durationCount > 0 ? roundToOneDecimal(durationSumMs / durationCount / 60000) : 0,
    favoriteGame,
    currentWinStreak,
    longestWinStreak,
  }

  const trends = Array.from(trendMap.entries())
    .map(([date, entry]) => ({
      date,
      gamesPlayed: entry.gamesPlayed,
      wins: entry.wins,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    overall,
    byGame,
    trends,
    dateRange: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
    generatedAt: new Date().toISOString(),
  }
}
