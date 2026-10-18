import type { GameCatalogAvailability, GameDifficulty } from './game-catalog'

export type GameStatusFilter = 'all' | 'available' | 'coming-soon'

export type GamesFilters = {
  status: GameStatusFilter
  /** Group size. PLAYER_COUNT_CAP stands for that many players or more. */
  players: number | null
  difficulty: GameDifficulty | null
}

export type FilterableGame = {
  players: string
  difficulty: GameDifficulty
  availability: GameCatalogAvailability
}

export type PlayerRange = { min: number; max: number }

export const PLAYER_COUNT_CAP = 8
export const GAME_DIFFICULTIES: readonly GameDifficulty[] = ['easy', 'medium', 'hard']
export const DEFAULT_GAMES_FILTERS: GamesFilters = { status: 'all', players: null, difficulty: null }

const STATUS_VALUES: readonly GameStatusFilter[] = ['available', 'coming-soon']

/** Reads the catalog's `players` text: '1-4', '2' or '8+'. */
export function parsePlayerRange(players: string): PlayerRange | null {
  const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+)|(\+))?\s*$/.exec(players)
  if (!match) return null
  const min = Number(match[1])
  const max = match[3] ? Infinity : match[2] !== undefined ? Number(match[2]) : min
  if (min < 1 || max < min) return null
  return { min, max }
}

export function canSeat(range: PlayerRange, count: number): boolean {
  if (count >= PLAYER_COUNT_CAP) return range.max >= PLAYER_COUNT_CAP
  return range.min <= count && count <= range.max
}

export function gameStatus(game: Pick<FilterableGame, 'availability'>): Exclude<GameStatusFilter, 'all'> {
  return game.availability === 'available' ? 'available' : 'coming-soon'
}

export function matchesGamesFilters(game: FilterableGame, filters: GamesFilters): boolean {
  if (filters.status !== 'all' && gameStatus(game) !== filters.status) return false
  if (filters.difficulty !== null && game.difficulty !== filters.difficulty) return false
  if (filters.players !== null) {
    const range = parsePlayerRange(game.players)
    if (!range || !canSeat(range, filters.players)) return false
  }
  return true
}

export function filterGames<T extends FilterableGame>(games: readonly T[], filters: GamesFilters): T[] {
  return games.filter((game) => matchesGamesFilters(game, filters))
}

/** Every group size from 1 to the cap that at least one game can seat. */
export function playerCountOptions(games: readonly Pick<FilterableGame, 'players'>[]): number[] {
  const ranges = games.flatMap((game) => parsePlayerRange(game.players) ?? [])
  const options: number[] = []
  for (let count = 1; count <= PLAYER_COUNT_CAP; count++) {
    if (ranges.some((range) => canSeat(range, count))) options.push(count)
  }
  return options
}

export function difficultyOptions(games: readonly Pick<FilterableGame, 'difficulty'>[]): GameDifficulty[] {
  return GAME_DIFFICULTIES.filter((level) => games.some((game) => game.difficulty === level))
}

type ParamReader = { get(name: string): string | null }

function oneOf<T extends string>(values: readonly T[], value: string | null | undefined): T | null {
  return values.find((candidate) => candidate === value) ?? null
}

function parsePlayerCount(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null
  const count = Number(value)
  return count < 1 ? null : Math.min(count, PLAYER_COUNT_CAP)
}

/** Unknown or malformed values fall back to "no filter" rather than an empty page. */
export function parseGamesFilters(params: ParamReader | null | undefined): GamesFilters {
  return {
    status: oneOf(STATUS_VALUES, params?.get('status')) ?? 'all',
    players: parsePlayerCount(params?.get('players')),
    difficulty: oneOf(GAME_DIFFICULTIES, params?.get('difficulty')),
  }
}

/** The query string for these filters, keeping unrelated params; '' when nothing is left. */
export function buildGamesQuery(current: string | URLSearchParams, filters: GamesFilters): string {
  const params = new URLSearchParams(current)
  const entries: Array<[string, string | null]> = [
    ['status', filters.status === 'all' ? null : filters.status],
    ['players', filters.players === null ? null : String(filters.players)],
    ['difficulty', filters.difficulty],
  ]
  for (const [name, value] of entries) {
    if (value === null) params.delete(name)
    else params.set(name, value)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function sameGamesFilters(a: GamesFilters, b: GamesFilters): boolean {
  return a.status === b.status && a.players === b.players && a.difficulty === b.difficulty
}
