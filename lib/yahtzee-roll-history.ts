import type { RollHistoryEntry } from '@/components/RollHistory'
import { ALL_CATEGORIES, type YahtzeeCategory, type YahtzeeScorecard } from '@/lib/yahtzee'

export const ROLL_HISTORY_LIMIT = 20

interface StoredRollHistory {
  gameId: string
  entries: RollHistoryEntry[]
}

export function serializeRollHistory(gameId: string, entries: readonly RollHistoryEntry[]): string {
  const stored: StoredRollHistory = { gameId, entries: entries.slice(-ROLL_HISTORY_LIMIT) }
  return JSON.stringify(stored)
}

/** The history saved for this game, or nothing when it belongs to another game or cannot be read. */
export function readStoredRollHistory(raw: string | null, gameId: string): RollHistoryEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRollHistory> | null
    if (!parsed || parsed.gameId !== gameId || !Array.isArray(parsed.entries)) return []
    return parsed.entries
  } catch {
    return []
  }
}

export function heldIndexes(held: readonly boolean[] | readonly number[] | null | undefined): number[] {
  if (!Array.isArray(held)) return []
  return held.flatMap((value, index) => (typeof value === 'number' ? [value] : value ? [index] : []))
}

function turnNumberFor(scorecard: YahtzeeScorecard | undefined): number {
  const filled = ALL_CATEGORIES.filter((category) => scorecard?.[category] !== undefined).length
  return Math.min(ALL_CATEGORIES.length, filled + 1)
}

export function scoreHistoryEntry(input: {
  playerId: string
  playerName: string
  category: YahtzeeCategory
  points: number
  turnNumber: number
  timestamp: number
  isBot?: boolean
}): RollHistoryEntry {
  return {
    id: `score-${input.playerId}-${input.category}-${input.timestamp}`,
    type: 'score',
    playerName: input.playerName,
    turnNumber: input.turnNumber,
    category: input.category,
    scoredPoints: input.points,
    isBot: !!input.isBot,
    botId: input.isBot ? input.playerId : null,
    timestamp: input.timestamp,
  }
}

export interface SeedRollHistoryInput {
  players: ReadonlyArray<{ id: string; name: string; isBot: boolean }>
  scorecards: ReadonlyArray<YahtzeeScorecard | undefined>
  rollsLeft: number
  currentPlayerId: string | null
  lastRoll: { playerId: string; dice: number[]; rollNumber: number; held: boolean[] | number[]; timestamp: number } | null | undefined
}

// The order of one player's boxes is not stored anywhere, so a seeded list follows the card.
export function seedRollHistory({ players, scorecards, rollsLeft, currentPlayerId, lastRoll }: SeedRollHistoryInput): RollHistoryEntry[] {
  const perPlayer = players.map((player, index) => {
    const scorecard = scorecards[index]
    return ALL_CATEGORIES.filter((category) => scorecard?.[category] !== undefined).map((category, turn) =>
      scoreHistoryEntry({
        playerId: player.id,
        playerName: player.name,
        category,
        points: scorecard?.[category] ?? 0,
        turnNumber: turn + 1,
        timestamp: 0,
        isBot: player.isBot,
      })
    )
  })

  const entries: RollHistoryEntry[] = []
  const rounds = Math.max(0, ...perPlayer.map((list) => list.length))
  for (let round = 0; round < rounds; round += 1) {
    for (const list of perPlayer) {
      if (list[round]) entries.push(list[round])
    }
  }

  const turnInProgress = rollsLeft < 3 && !!lastRoll && lastRoll.playerId === currentPlayerId
  if (turnInProgress && lastRoll) {
    const index = players.findIndex((player) => player.id === lastRoll.playerId)
    const player = players[index]
    if (player) {
      entries.push({
        id: `${lastRoll.playerId}-${lastRoll.timestamp}`,
        type: 'roll',
        playerName: player.name,
        dice: [...lastRoll.dice],
        rollNumber: lastRoll.rollNumber,
        turnNumber: turnNumberFor(scorecards[index]),
        held: heldIndexes(lastRoll.held),
        isBot: player.isBot,
        botId: player.isBot ? player.id : null,
        timestamp: lastRoll.timestamp,
      })
    }
  }

  return entries.slice(-ROLL_HISTORY_LIMIT)
}
