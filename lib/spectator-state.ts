import { stripSketchCustomWords } from '@/lib/games/sketch-and-guess-game'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'

type JsonObject = Record<string, unknown>

function parseGameState(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function scrubSpyIdentity(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubSpyIdentity(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const source = value as JsonObject
  const result: JsonObject = {}

  for (const [key, rawChild] of Object.entries(source)) {
    const lowerKey = key.toLowerCase()
    if (
      lowerKey === 'isspy' ||
      lowerKey === 'spyid' ||
      lowerKey === 'spyuserid' ||
      lowerKey === 'spyplayerid' ||
      lowerKey === 'spyindex' ||
      lowerKey === 'playerroles'
    ) {
      continue
    }

    const shouldTryParseJsonString =
      typeof rawChild === 'string' &&
      (lowerKey === 'state' || lowerKey === 'initialstate' || lowerKey === 'game')

    if (shouldTryParseJsonString) {
      const parsed = parseGameState(rawChild)
      if (parsed && typeof parsed === 'object') {
        result[key] = scrubSpyIdentity(parsed)
        continue
      }
    }

    result[key] = scrubSpyIdentity(rawChild)
  }

  return result
}

export function sanitizeGameStateForSpectator(
  gameType: string,
  rawState: unknown,
  gameStatus?: string
): unknown {
  const parsed = parseGameState(rawState)
  if (!parsed) {
    return parsed
  }

  // A finished game has nothing left to hide, and every per-game sanitizer
  // already encodes that rule via `status === 'finished'`. The authoritative
  // status arrives as a separate argument here and isn't always present on the
  // state blob itself, so apply it once up front rather than relying on each
  // sanitizer to find it.
  if (gameStatus === 'finished') {
    // The one secret that outlives a game: the host's word list is the next game's answers.
    return gameType === 'sketch_and_guess' ? stripSketchCustomWords(parsed as { data?: unknown }) : parsed
  }

  // Spy keeps its own key-name scrubber because it also has to reach spy
  // identity nested inside serialized `state`/`initialState`/`game` strings,
  // which the structured per-game sanitizers don't walk into.
  if (gameType === 'guess_the_spy') {
    return scrubSpyIdentity(parsed)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return parsed
  }

  // A spectator is never a participant, so they get the no-viewer treatment:
  // every per-game sanitizer redacts fully when viewerUserId is null. Routing
  // through the shared dispatcher means a newly added game is covered here the
  // moment it's registered, instead of needing a second edit that gets forgotten.
  return sanitizeStateForBroadcast(gameType, parsed as { data?: unknown; status?: string }, null)
}
