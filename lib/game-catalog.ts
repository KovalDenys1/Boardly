export type RegisteredGameType =
  | 'yahtzee'
  | 'guess_the_spy'
  | 'tic_tac_toe'
  | 'rock_paper_scissors'
  | 'memory'

export const DEFAULT_GAME_TYPE: RegisteredGameType = 'yahtzee'

export interface GameMetadata {
  type: RegisteredGameType
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

export function isRegisteredGameType(value: string): value is RegisteredGameType {
  return value in GAME_METADATA
}

export function getGameMetadata(gameType: string): GameMetadata | null {
  if (!isRegisteredGameType(gameType)) {
    return null
  }
  return GAME_METADATA[gameType]
}

export function hasBotSupport(gameType: string): boolean {
  const metadata = getGameMetadata(gameType)
  return metadata?.supportsBots ?? false
}
