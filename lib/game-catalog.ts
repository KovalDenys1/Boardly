import {
  isAliasEnabled,
  isFakeArtistEnabled,
  isLiarsPartyEnabled,
  isSketchAndGuessEnabled,
  isTelephoneDoodleEnabled,
} from './feature-flags'

export type RegisteredGameType =
  | 'yahtzee'
  | 'guess_the_spy'
  | 'tic_tac_toe'
  | 'rock_paper_scissors'
  | 'memory'
export type ExperimentalGameType =
  | 'telephone_doodle'
  | 'sketch_and_guess'
  | 'liars_party'
  | 'fake_artist'
  | 'alias'
export type SupportedCatalogGameType = RegisteredGameType | ExperimentalGameType

export const DEFAULT_GAME_TYPE: RegisteredGameType = 'yahtzee'

export interface GameMetadata {
  type: SupportedCatalogGameType
  name: string
  icon: string
  minPlayers: number
  maxPlayers: number
  supportsBots: boolean
  translationKey: string
}

const GAME_METADATA: Record<RegisteredGameType, GameMetadata> = {
  yahtzee: {
    type: 'yahtzee',
    name: 'Yahtzee',
    icon: '🎲',
    minPlayers: 1,
    maxPlayers: 4,
    supportsBots: true,
    translationKey: 'yahtzee',
  },
  guess_the_spy: {
    type: 'guess_the_spy',
    name: 'Guess the Spy',
    icon: '🕵️',
    minPlayers: 3,
    maxPlayers: 10,
    supportsBots: false,
    translationKey: 'spy',
  },
  tic_tac_toe: {
    type: 'tic_tac_toe',
    name: 'Tic Tac Toe',
    icon: '❌⭕',
    minPlayers: 2,
    maxPlayers: 2,
    supportsBots: true,
    translationKey: 'tictactoe',
  },
  rock_paper_scissors: {
    type: 'rock_paper_scissors',
    name: 'Rock Paper Scissors',
    icon: '✊✋✌️',
    minPlayers: 2,
    maxPlayers: 2,
    supportsBots: true,
    translationKey: 'rps',
  },
  memory: {
    type: 'memory',
    name: 'Memory',
    icon: '🧠',
    minPlayers: 2,
    maxPlayers: 4,
    supportsBots: false,
    translationKey: 'memory',
  },
}

const TELEPHONE_DOODLE_METADATA: GameMetadata = {
  type: 'telephone_doodle',
  name: 'Telephone Doodle',
  icon: '📞',
  minPlayers: 3,
  maxPlayers: 12,
  supportsBots: false,
  translationKey: 'telephone_doodle',
}

const SKETCH_AND_GUESS_METADATA: GameMetadata = {
  type: 'sketch_and_guess',
  name: 'Sketch & Guess',
  icon: '🎨',
  minPlayers: 3,
  maxPlayers: 10,
  supportsBots: false,
  translationKey: 'guess_my_drawing',
}

const LIARS_PARTY_METADATA: GameMetadata = {
  type: 'liars_party',
  name: "Liar's Party",
  icon: '🎭',
  minPlayers: 4,
  maxPlayers: 12,
  supportsBots: false,
  translationKey: 'liars_party',
}

const FAKE_ARTIST_METADATA: GameMetadata = {
  type: 'fake_artist',
  name: 'Fake Artist',
  icon: '🖌️',
  minPlayers: 4,
  maxPlayers: 10,
  supportsBots: false,
  translationKey: 'fake_artist',
}

const ALIAS_METADATA: GameMetadata = {
  type: 'alias',
  name: 'Alias',
  icon: '🗣️',
  minPlayers: 4,
  maxPlayers: 16,
  supportsBots: false,
  translationKey: 'alias',
}

export function isRegisteredGameType(value: string): value is RegisteredGameType {
  return value in GAME_METADATA
}

export function isSupportedGameType(value: string): value is SupportedCatalogGameType {
  return (
    isRegisteredGameType(value) ||
    (value === 'telephone_doodle' && isTelephoneDoodleEnabled()) ||
    (value === 'sketch_and_guess' && isSketchAndGuessEnabled()) ||
    (value === 'liars_party' && isLiarsPartyEnabled()) ||
    (value === 'fake_artist' && isFakeArtistEnabled()) ||
    (value === 'alias' && isAliasEnabled())
  )
}

export function getGameMetadata(gameType: string): GameMetadata | null {
  if (isRegisteredGameType(gameType)) {
    return GAME_METADATA[gameType]
  }
  if (gameType === 'telephone_doodle' && isTelephoneDoodleEnabled()) {
    return TELEPHONE_DOODLE_METADATA
  }
  if (gameType === 'sketch_and_guess' && isSketchAndGuessEnabled()) {
    return SKETCH_AND_GUESS_METADATA
  }
  if (gameType === 'liars_party' && isLiarsPartyEnabled()) {
    return LIARS_PARTY_METADATA
  }
  if (gameType === 'fake_artist' && isFakeArtistEnabled()) {
    return FAKE_ARTIST_METADATA
  }
  if (gameType === 'alias' && isAliasEnabled()) {
    return ALIAS_METADATA
  }
  return null
}

export function hasBotSupport(gameType: string): boolean {
  const metadata = getGameMetadata(gameType)
  return metadata?.supportsBots ?? false
}

/**
 * Returns all registered (always-on) game types.
 * Use this instead of hardcoding game type lists.
 */
export function getAllRegisteredGameTypes(): RegisteredGameType[] {
  return Object.keys(GAME_METADATA) as RegisteredGameType[]
}

/**
 * Returns all currently enabled game types (registered + feature-flagged).
 * Use this for UI lists, filters, and validation.
 */
export function getAllEnabledGameTypes(): SupportedCatalogGameType[] {
  const types: SupportedCatalogGameType[] = getAllRegisteredGameTypes()
  if (isTelephoneDoodleEnabled()) types.push('telephone_doodle')
  if (isSketchAndGuessEnabled()) types.push('sketch_and_guess')
  if (isLiarsPartyEnabled()) types.push('liars_party')
  if (isFakeArtistEnabled()) types.push('fake_artist')
  if (isAliasEnabled()) types.push('alias')
  return types
}

/**
 * Returns all enabled game types that support bots (usable for quick play).
 */
export function getBotSupportedGameTypes(): SupportedCatalogGameType[] {
  return getAllEnabledGameTypes().filter(hasBotSupport)
}
