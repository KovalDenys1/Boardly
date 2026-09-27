import { getAvailableGameTypes } from '@/lib/game-catalog'

/**
 * Shape shared by /api/leaderboard, the server-rendered /leaderboard page and its client hook.
 *
 * No user id (#1226): the internal id opens other routes by id, and the leaderboard lists
 * players whose profile the viewer may not see. A row is linked by `publicProfileId`, which
 * answers with the visibility rule, and keyed by `rank`.
 */
export interface LeaderboardEntry {
  rank: number
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
