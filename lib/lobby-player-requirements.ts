import { DEFAULT_GAME_TYPE, getGameMetadata } from './game-catalog'

export interface LobbyPlayerRequirements {
  gameType: string
  supportsBots: boolean
  minPlayersRequired: number
  desiredPlayerCount: number
}

export function getLobbyPlayerRequirements(gameType: string | null | undefined): LobbyPlayerRequirements {
  const normalizedGameType =
    typeof gameType === 'string' && gameType.trim().length > 0
      ? gameType.trim()
      : DEFAULT_GAME_TYPE

  const metadata = getGameMetadata(normalizedGameType)
  if (!metadata) {
    return {
      gameType: normalizedGameType,
      supportsBots: false,
      minPlayersRequired: 2,
      desiredPlayerCount: 2,
    }
  }

  const supportsBots = metadata.supportsBots
  const minPlayersRequired = supportsBots ? metadata.minPlayers : Math.max(2, metadata.minPlayers)
  const desiredPlayerCount = supportsBots ? Math.max(2, minPlayersRequired) : minPlayersRequired

  return {
    gameType: normalizedGameType,
    supportsBots,
    minPlayersRequired,
    desiredPlayerCount,
  }
}
