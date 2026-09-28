import type { GameConfig } from '@/lib/game-engine'

/**
 * The per-game rules a lobby is created with (POST /api/lobby) live in the game
 * state, not on the lobby row: Tic-Tac-Toe's series length, Memory's
 * difficulty, Yahtzee's and Ludo's mode. So every path that builds the next
 * game from the last one has to read them back out of its state, or the room
 * silently falls back to the defaults – "Back to lobby" turned a classic Ludo
 * room into a quick one (#1260). One reader for all of those paths.
 */

function parseStateData(rawState: unknown): Record<string, unknown> | undefined {
  let parsedState = rawState

  if (typeof rawState === 'string') {
    try {
      parsedState = JSON.parse(rawState)
    } catch {
      return undefined
    }
  }

  if (!parsedState || typeof parsedState !== 'object') {
    return undefined
  }

  const stateData = (parsedState as { data?: unknown }).data
  return stateData && typeof stateData === 'object' ? (stateData as Record<string, unknown>) : undefined
}

/** Tic-Tac-Toe's series length; `null` is a deliberate "no limit", `undefined` is "not found". */
export function extractTicTacToeTargetRounds(rawState: unknown): number | null | undefined {
  const matchState = parseStateData(rawState)?.match
  if (!matchState || typeof matchState !== 'object') {
    return undefined
  }

  const targetRounds = (matchState as { targetRounds?: unknown }).targetRounds
  if (targetRounds === null) {
    return null
  }
  if (typeof targetRounds === 'number' && Number.isInteger(targetRounds) && targetRounds > 0) {
    return targetRounds
  }

  return undefined
}

/**
 * The modes a game keeps in `state.data.mode`, which is where a mode has to be read
 * back from when a waiting game starts or a finished one is played again. One
 * reader and one list instead of a copy per game (#1102).
 */
const STATE_DATA_MODES: Readonly<Record<string, readonly string[]>> = {
  yahtzee: ['classic', 'short'],
  ludo: ['quick', 'classic'],
}

/** The mode of a game that keeps one in state.data, or undefined for every other game. */
export function extractGameMode(gameType: string, rawState: unknown): string | undefined {
  const allowed = STATE_DATA_MODES[gameType]
  if (!allowed) return undefined
  const mode = parseStateData(rawState)?.mode
  return typeof mode === 'string' && allowed.includes(mode) ? mode : undefined
}

export function extractMemoryDifficulty(rawState: unknown): 'easy' | 'medium' | 'hard' | undefined {
  const difficulty = parseStateData(rawState)?.difficulty
  if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
    return difficulty
  }
  return undefined
}

/**
 * The engine config that rebuilds `gameType` with the rules found in a previous
 * game's state, or undefined when that game carries none (the engine's defaults
 * then apply). Only for the same game type: a different game starts from its
 * own defaults.
 */
export function extractCarriedGameConfig(gameType: string, rawState: unknown): Partial<GameConfig> | undefined {
  if (gameType === 'tic_tac_toe') {
    const targetRounds = extractTicTacToeTargetRounds(rawState)
    return targetRounds !== undefined ? { rules: { targetRounds } } : undefined
  }
  if (gameType === 'memory') {
    const difficulty = extractMemoryDifficulty(rawState)
    return difficulty !== undefined ? { rules: { difficulty } } : undefined
  }
  const mode = extractGameMode(gameType, rawState)
  return mode !== undefined ? { rules: { mode } } : undefined
}
