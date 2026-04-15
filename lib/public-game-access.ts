import { isAliasEnabled } from './feature-flags'

const ALWAYS_PUBLIC_GAME_TYPES = [
  'yahtzee',
  'guess_the_spy',
  'tic_tac_toe',
  'rock_paper_scissors',
  'memory',
] as const

export type PublicGameType = (typeof ALWAYS_PUBLIC_GAME_TYPES)[number] | 'alias'

interface PublicGameAvailabilityOptions {
  aliasEnabled?: boolean
}

export function getPublicAvailableGameTypes(
  options: PublicGameAvailabilityOptions = {}
): PublicGameType[] {
  const aliasEnabled = options.aliasEnabled ?? isAliasEnabled()

  return aliasEnabled
    ? [...ALWAYS_PUBLIC_GAME_TYPES, 'alias']
    : [...ALWAYS_PUBLIC_GAME_TYPES]
}

export function isPublicAvailableGameType(
  value: string,
  options: PublicGameAvailabilityOptions = {}
): value is PublicGameType {
  return getPublicAvailableGameTypes(options).includes(value as PublicGameType)
}
