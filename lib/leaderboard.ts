import { getAvailableGameTypes } from '@/lib/game-catalog'

/** Shape shared by /api/leaderboard, the server-rendered /leaderboard page and its client hook. */
export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  publicProfileId: string | null
  avatarUrl: string | null
  isPremium: boolean
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
}

export type LeaderboardPeriod = 'all' | '30d'

export interface LeaderboardPage {
  entries: LeaderboardEntry[]
  hasMore: boolean
}

export const LEADERBOARD_PAGE_SIZE = 50

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** Same validation as useLeaderboard: unknown values fall back to the defaults. */
export function parseLeaderboardSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): { period: LeaderboardPeriod; gameType: string } {
  const period: LeaderboardPeriod = first(searchParams.period) === '30d' ? '30d' : 'all'
  const rawGameType = first(searchParams.gameType)
  const gameType = (getAvailableGameTypes() as string[]).includes(rawGameType) ? rawGameType : ''
  return { period, gameType }
}
