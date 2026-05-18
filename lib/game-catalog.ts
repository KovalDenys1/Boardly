import {
  isFakeArtistEnabled,
  isSketchAndGuessEnabled,
  isTelephoneDoodleEnabled,
} from './feature-flags'

export type RegisteredGameType =
  | 'yahtzee'
  | 'guess_the_spy'
  | 'tic_tac_toe'
  | 'rock_paper_scissors'
  | 'memory'
  | 'connect_four'
  | 'alias'
  | 'liars_party'
export type ExperimentalGameType =
  | 'telephone_doodle'
  | 'sketch_and_guess'
  | 'fake_artist'
export type SupportedCatalogGameType = RegisteredGameType | ExperimentalGameType
export type GameCatalogAvailability = 'available' | 'in-development' | 'planned'

export type LobbyCreateConfig = {
  gradient: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
  turnTimer?: { options: number[]; default: number }
  rounds?: { options: number[]; default: number | null }
  difficulty?: { options: string[]; default: string }
}

type GameCatalogEntryBase = {
  id: string
  nameKey: string
  emoji: string
  descriptionKey: string
  players: string
  difficultyKey: string
  color: string
}

/** A game that is live and playable — gameType, route, and lobbyCreateConfig are all required. */
export type AvailableGameCatalogEntry = GameCatalogEntryBase & {
  availability: 'available'
  gameType: SupportedCatalogGameType
  route: string
  lobbyCreateConfig: LobbyCreateConfig
}

/** A game that is not yet available — all fields beyond the base are optional. */
export type NonAvailableGameCatalogEntry = GameCatalogEntryBase & {
  availability: 'in-development' | 'planned'
  gameType?: SupportedCatalogGameType
  route?: string
  lobbyCreateConfig?: LobbyCreateConfig
}

export type GameCatalogEntry = AvailableGameCatalogEntry | NonAvailableGameCatalogEntry

/** Type guard — narrows to AvailableGameCatalogEntry (static available + has lobbyCreateConfig). */
export function isAvailableCatalogEntry(game: GameCatalogEntry): game is AvailableGameCatalogEntry {
  return game.availability === 'available' && game.lobbyCreateConfig !== undefined
}

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
    supportsBots: true,
    translationKey: 'memory',
  },
  connect_four: {
    type: 'connect_four',
    name: 'Connect Four',
    icon: '🔴',
    minPlayers: 2,
    maxPlayers: 2,
    supportsBots: true,
    translationKey: 'connect_four',
  },

  alias: {
    type: 'alias',
    name: 'Alias',
    icon: '🗣️',
    minPlayers: 4,
    maxPlayers: 16,
    supportsBots: false,
    translationKey: 'alias',
  },

  liars_party: {
    type: 'liars_party',
    name: "Liar's Party",
    icon: '🎭',
    minPlayers: 4,
    maxPlayers: 12,
    supportsBots: false,
    translationKey: 'liars_party',
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

const FAKE_ARTIST_METADATA: GameMetadata = {
  type: 'fake_artist',
  name: 'Fake Artist',
  icon: '🖌️',
  minPlayers: 4,
  maxPlayers: 10,
  supportsBots: false,
  translationKey: 'fake_artist',
}

const FEATURED_GAME_CATALOG: readonly GameCatalogEntry[] = [
  {
    id: 'yahtzee',
    gameType: 'yahtzee',
    nameKey: 'games.yahtzee.name',
    emoji: '🎲',
    descriptionKey: 'games.yahtzee.description',
    players: '2-8',
    difficultyKey: 'games.yahtzee.difficulty',
    availability: 'available',
    route: '/games/yahtzee/lobbies',
    color: 'from-blue-500 to-purple-600',
    lobbyCreateConfig: {
      gradient: 'from-purple-600 via-pink-500 to-orange-400',
      allowedPlayers: [2, 3, 4],
      defaultMaxPlayers: 4,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
    },
  },
  {
    id: 'spy',
    gameType: 'guess_the_spy',
    nameKey: 'games.spy.name',
    emoji: '🕵️',
    descriptionKey: 'games.spy.description',
    players: '3-10',
    difficultyKey: 'games.spy.difficulty',
    availability: 'available',
    route: '/games/spy/lobbies',
    color: 'from-red-500 to-pink-600',
    lobbyCreateConfig: {
      gradient: 'from-blue-600 via-cyan-500 to-green-400',
      allowedPlayers: [3, 4, 5, 6, 7, 8],
      defaultMaxPlayers: 6,
    },
  },
  {
    id: 'tic-tac-toe',
    gameType: 'tic_tac_toe',
    nameKey: 'games.tictactoe.name',
    emoji: '❌',
    descriptionKey: 'games.tictactoe.description',
    players: '2',
    difficultyKey: 'games.tictactoe.difficulty',
    availability: 'available',
    route: '/games/tic-tac-toe/lobbies',
    color: 'from-red-500 to-coral-500',
    lobbyCreateConfig: {
      gradient: 'from-indigo-600 via-blue-500 to-sky-400',
      allowedPlayers: [2],
      defaultMaxPlayers: 2,
      rounds: { options: [3, 5, 10], default: null },
    },
  },
  {
    id: 'memory',
    gameType: 'memory',
    nameKey: 'games.memory.name',
    emoji: '🧠',
    descriptionKey: 'games.memory.description',
    players: '2-4',
    difficultyKey: 'games.memory.difficulty',
    availability: 'available',
    route: '/games/memory/lobbies',
    color: 'from-green-400 to-teal-500',
    lobbyCreateConfig: {
      gradient: 'from-emerald-500 via-teal-500 to-cyan-400',
      allowedPlayers: [2, 3, 4],
      defaultMaxPlayers: 4,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
      difficulty: { options: ['easy', 'medium', 'hard'], default: 'easy' },
    },
  },
  {
    id: 'connect-four',
    gameType: 'connect_four',
    nameKey: 'games.connect_four.name',
    emoji: '🔴',
    descriptionKey: 'games.connect_four.description',
    players: '2',
    difficultyKey: 'games.connect_four.difficulty',
    availability: 'available',
    route: '/games/connect-four/lobbies',
    color: 'from-red-500 to-yellow-400',
    lobbyCreateConfig: {
      gradient: 'from-red-500 via-orange-400 to-yellow-400',
      allowedPlayers: [2],
      defaultMaxPlayers: 2,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
    },
  },
  {
    id: 'alias',
    gameType: 'alias',
    nameKey: 'games.alias.name',
    emoji: '🗣️',
    descriptionKey: 'games.alias.description',
    players: '4-16',
    difficultyKey: 'games.alias.difficulty',
    availability: 'available',
    route: '/games/alias/lobbies',
    color: 'from-coral-400 to-red-500',
    lobbyCreateConfig: {
      gradient: 'from-coral-500 via-red-500 to-pink-500',
      allowedPlayers: [4, 6, 8, 10, 12, 16],
      defaultMaxPlayers: 8,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
    },
  },
  {
    id: 'liars-party',
    gameType: 'liars_party',
    nameKey: 'games.liars_party.name',
    emoji: '🎭',
    descriptionKey: 'games.liars_party.description',
    players: '4-12',
    difficultyKey: 'games.liars_party.difficulty',
    availability: 'in-development',
    route: '/games/liars-party/lobbies',
    color: 'from-violet-500 to-purple-600',
    lobbyCreateConfig: {
      gradient: 'from-violet-600 via-purple-500 to-fuchsia-400',
      allowedPlayers: [4, 5, 6, 7, 8, 9, 10, 11, 12],
      defaultMaxPlayers: 8,
    },
  },
  {
    id: 'rps',
    gameType: 'rock_paper_scissors',
    nameKey: 'games.rock_paper_scissors.name',
    emoji: '✊',
    descriptionKey: 'games.rock_paper_scissors.description',
    players: '2',
    difficultyKey: 'games.rock_paper_scissors.difficulty',
    availability: 'in-development',
    route: '/games/rock-paper-scissors/lobbies',
    color: 'from-indigo-400 to-purple-500',
    lobbyCreateConfig: {
      gradient: 'from-indigo-500 via-purple-500 to-pink-400',
      allowedPlayers: [2],
      defaultMaxPlayers: 2,
    },
  },
  {
    id: 'guess-my-drawing',
    gameType: 'sketch_and_guess',
    nameKey: 'games.guess_my_drawing.name',
    emoji: '🎨',
    descriptionKey: 'games.guess_my_drawing.description',
    players: '3-10',
    difficultyKey: 'games.guess_my_drawing.difficulty',
    availability: 'in-development',
    route: '/games/sketch-and-guess/lobbies',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'fake-artist',
    gameType: 'fake_artist',
    nameKey: 'games.fake_artist.name',
    emoji: '🖌️',
    descriptionKey: 'games.fake_artist.description',
    players: '4-10',
    difficultyKey: 'games.fake_artist.difficulty',
    availability: 'in-development',
    route: '/games/fake-artist/lobbies',
    color: 'from-fuchsia-500 to-violet-600',
  },
  {
    id: 'telephone-doodle',
    gameType: 'telephone_doodle',
    nameKey: 'games.telephone_doodle.name',
    emoji: '📞',
    descriptionKey: 'games.telephone_doodle.description',
    players: '3-12',
    difficultyKey: 'games.telephone_doodle.difficulty',
    availability: 'in-development',
    route: '/games/telephone-doodle/lobbies',
    color: 'from-sky-500 to-indigo-600',
  },
  {
    id: 'words-mines',
    nameKey: 'games.wordsmines.name',
    emoji: '💣',
    descriptionKey: 'games.wordsmines.description',
    players: '2-8',
    difficultyKey: 'games.wordsmines.difficulty',
    availability: 'planned',
    color: 'from-gray-400 to-black',
  },
  {
    id: 'anagrams',
    nameKey: 'games.anagrams.name',
    emoji: '🔀',
    descriptionKey: 'games.anagrams.description',
    players: '2-8',
    difficultyKey: 'games.anagrams.difficulty',
    availability: 'planned',
    color: 'from-blue-300 to-indigo-500',
  },
  {
    id: 'crocodile',
    nameKey: 'games.crocodile.name',
    emoji: '🐊',
    descriptionKey: 'games.crocodile.description',
    players: '3-12',
    difficultyKey: 'games.crocodile.difficulty',
    availability: 'planned',
    color: 'from-green-600 to-lime-400',
  },
  {
    id: 'alibi-night',
    nameKey: 'games.alibi_night.name',
    emoji: '🕶️',
    descriptionKey: 'games.alibi_night.description',
    players: '4-12',
    difficultyKey: 'games.alibi_night.difficulty',
    availability: 'planned',
    color: 'from-amber-500 to-red-600',
  },
]

export function isRegisteredGameType(value: string): value is RegisteredGameType {
  return value in GAME_METADATA
}

export function isSupportedGameType(value: string): value is SupportedCatalogGameType {
  return (
    isRegisteredGameType(value) ||
    (value === 'telephone_doodle' && isTelephoneDoodleEnabled()) ||
    (value === 'sketch_and_guess' && isSketchAndGuessEnabled()) ||
    (value === 'fake_artist' && isFakeArtistEnabled())
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
  if (gameType === 'fake_artist' && isFakeArtistEnabled()) {
    return FAKE_ARTIST_METADATA
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
  if (isFakeArtistEnabled()) types.push('fake_artist')
  return types
}

/**
 * Returns all enabled game types that support bots (usable for quick play).
 */
export function getBotSupportedGameTypes(): SupportedCatalogGameType[] {
  return getAllEnabledGameTypes().filter(hasBotSupport)
}

export function isAvailableGameType(
  gameType: string | null | undefined
): gameType is SupportedCatalogGameType {
  return (
    typeof gameType === 'string' &&
    getAvailableGameTypes().includes(gameType as SupportedCatalogGameType)
  )
}

export function getAvailableGameTypes(options?: {
  enabledExperimental?: readonly string[]
}): SupportedCatalogGameType[] {
  return getCatalogAvailableGames(options).flatMap((game) =>
    game.gameType !== undefined ? [game.gameType] : []
  )
}

export function getCatalogGames(options?: {
  enabledExperimental?: readonly string[]
}): GameCatalogEntry[] {
  const enabledExperimental = new Set(options?.enabledExperimental ?? [])

  return FEATURED_GAME_CATALOG.map((game) => {
    if (!game.gameType || game.availability !== 'in-development') {
      return { ...game }
    }

    const isEnabled =
      enabledExperimental.has(game.id) ||
      (game.gameType === 'sketch_and_guess' && isSketchAndGuessEnabled()) ||
      (game.gameType === 'fake_artist' && isFakeArtistEnabled()) ||
      (game.gameType === 'telephone_doodle' && isTelephoneDoodleEnabled())

    // Promoted experimental games may lack lobbyCreateConfig — isAvailableCatalogEntry guards this.
    return {
      ...game,
      availability: isEnabled ? 'available' : game.availability,
    } as GameCatalogEntry
  })
}

export function getCatalogAvailableGames(options?: {
  enabledExperimental?: readonly string[]
}): GameCatalogEntry[] {
  return getCatalogGames(options).filter((game) => game.availability === 'available')
}
