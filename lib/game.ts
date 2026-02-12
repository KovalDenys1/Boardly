import { GameState } from './game-engine'

/**
 * Save game state to the database via API
 */
export async function saveGameState(
  gameId: string,
  state: GameState<unknown>,
  status?: 'waiting' | 'playing' | 'finished'
): Promise<boolean> {
  try {
    const res = await fetch(`/api/game/${gameId}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, status }),
    })

    if (!res.ok) {
      const data = await res.json()
      console.error('Failed to save game state:', data.error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error saving game state:', error)
    return false
  }
}
