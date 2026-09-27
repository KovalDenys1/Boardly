import type { AliasGameData } from '@/lib/games/alias'

/** The guess box's own limit (alias-page.tsx `maxLength`). */
export const MAX_ALIAS_GUESS_LENGTH = 80

/**
 * Who may post an Alias guess right now: anyone seated while a turn is
 * running, except the player describing – the same rule the page applies when
 * it decides whether to show the guess box. Takes the persisted game state
 * (`{ data: AliasGameData, ... }`).
 */
export function canPostAliasGuess(state: unknown, userId: string): boolean {
  const data = (state as { data?: AliasGameData } | null | undefined)?.data
  if (!data || data.phase !== 'turn_active' || !Array.isArray(data.teams)) return false
  const team = data.teams[data.currentTeamIndex]
  if (!team || !Array.isArray(team.playerIds)) return false
  const describerId = team.playerIds[team.describerIndex ?? 0]
  return describerId !== userId
}
