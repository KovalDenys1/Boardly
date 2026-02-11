interface StatePlayer {
  id?: string
  isActive?: boolean
  disconnectedAt?: number
  [key: string]: unknown
}

interface TurnStateData {
  held?: boolean[]
  rollsLeft?: number
  [key: string]: unknown
}

export interface TurnState {
  players?: StatePlayer[]
  currentPlayerIndex?: number
  lastMoveAt?: number
  updatedAt?: string | number | Date
  data?: TurnStateData
  [key: string]: unknown
}

export interface TurnAdvanceResult {
  changed: boolean
  skippedPlayerIds: string[]
  currentPlayerId: string | null
}

function isPlayerDisconnected(player: StatePlayer, botUserIds: Set<string>): boolean {
  const playerId = typeof player.id === 'string' ? player.id : null
  if (!playerId) return false
  if (botUserIds.has(playerId)) return false
  return player.isActive === false
}

function getCurrentPlayerId(players: StatePlayer[], index: number): string | null {
  const candidate = players[index]
  return typeof candidate?.id === 'string' ? candidate.id : null
}

function findNextPlayablePlayerIndex(
  players: StatePlayer[],
  startIndex: number,
  botUserIds: Set<string>
): number {
  if (players.length === 0) return startIndex

  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (startIndex + offset) % players.length
    const player = players[index]
    const playerId = typeof player?.id === 'string' ? player.id : null
    if (!playerId) continue

    if (!isPlayerDisconnected(player, botUserIds)) {
      return index
    }
  }

  return startIndex
}

export function setPlayerConnectionInState(
  state: TurnState,
  userId: string,
  isActive: boolean,
  timestampMs: number = Date.now()
): boolean {
  if (!Array.isArray(state.players)) return false

  const playerIndex = state.players.findIndex((player) => player?.id === userId)
  if (playerIndex === -1) return false

  const player = state.players[playerIndex]
  if (player.isActive === isActive) return false

  const nextPlayer: StatePlayer = {
    ...player,
    isActive,
  }

  if (isActive) {
    delete nextPlayer.disconnectedAt
  } else {
    nextPlayer.disconnectedAt = timestampMs
  }

  state.players[playerIndex] = nextPlayer
  state.updatedAt = new Date(timestampMs).toISOString()
  return true
}

export function advanceTurnPastDisconnectedPlayers(
  state: TurnState,
  botUserIds: Set<string>,
  timestampMs: number = Date.now()
): TurnAdvanceResult {
  if (!Array.isArray(state.players) || state.players.length === 0) {
    return { changed: false, skippedPlayerIds: [], currentPlayerId: null }
  }

  const players = state.players
  const totalPlayers = players.length
  let currentIndex =
    typeof state.currentPlayerIndex === 'number' && Number.isFinite(state.currentPlayerIndex)
      ? state.currentPlayerIndex
      : 0

  currentIndex = ((currentIndex % totalPlayers) + totalPlayers) % totalPlayers

  let changed = false
  const skippedPlayerIds: string[] = []

  for (let safety = 0; safety < totalPlayers; safety += 1) {
    const currentPlayer = players[currentIndex]
    const currentPlayerId = typeof currentPlayer?.id === 'string' ? currentPlayer.id : null
    if (!currentPlayerId) {
      break
    }

    if (!isPlayerDisconnected(currentPlayer, botUserIds)) {
      break
    }

    const nextIndex = findNextPlayablePlayerIndex(players, currentIndex, botUserIds)
    if (nextIndex === currentIndex) {
      break
    }

    skippedPlayerIds.push(currentPlayerId)
    currentIndex = nextIndex
    changed = true
  }

  if (changed) {
    state.currentPlayerIndex = currentIndex
    state.lastMoveAt = timestampMs
    state.updatedAt = new Date(timestampMs).toISOString()

    if (state.data && typeof state.data === 'object') {
      if (Array.isArray(state.data.held) && state.data.held.length > 0) {
        state.data.held = state.data.held.map(() => false)
      }
      if (typeof state.data.rollsLeft === 'number') {
        state.data.rollsLeft = 3
      }
    }
  }

  return {
    changed,
    skippedPlayerIds,
    currentPlayerId: getCurrentPlayerId(players, currentIndex),
  }
}
