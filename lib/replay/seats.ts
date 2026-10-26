import type { ReplayPlayer } from './types'

export interface ReplayApiPlayer {
  userId: string
  username: string | null
  isBot: boolean
  position?: number | null
}

/**
 * Seats in engine order: the first snapshot's `state.players` is what the
 * boards index (X, disc 1, side 1 are seat 0); the API's position is the
 * fallback for a game whose first snapshot is gone.
 */
export function buildSeats(players: ReplayApiPlayer[], startState: unknown, fallbackName: string): ReplayPlayer[] {
  const engineOrder = ((startState as { players?: Array<{ id?: unknown }> } | null)?.players ?? [])
    .map((p) => (typeof p?.id === 'string' ? p.id : null))
    .filter((id): id is string => id !== null)

  const rank = (player: ReplayApiPlayer) => {
    const index = engineOrder.indexOf(player.userId)
    if (index !== -1) return index
    return engineOrder.length + (player.position ?? Number.MAX_SAFE_INTEGER)
  }

  return [...players]
    .sort((a, b) => rank(a) - rank(b))
    .map((player, seat) => ({
      userId: player.userId,
      name: player.username ?? fallbackName,
      isBot: player.isBot,
      seat,
    }))
}

export function activeSeatId(state: unknown): string | null {
  const s = state as { players?: Array<{ id?: unknown }>; currentPlayerIndex?: unknown; status?: unknown } | null
  if (!s || s.status === 'finished' || typeof s.currentPlayerIndex !== 'number') return null
  const id = s.players?.[s.currentPlayerIndex]?.id
  return typeof id === 'string' ? id : null
}

export function winnerSeatId(state: unknown): string | null {
  const s = state as { status?: unknown; winner?: unknown; players?: Array<{ id?: unknown }> } | null
  if (!s || s.status !== 'finished' || typeof s.winner !== 'string') return null
  return s.players?.some((p) => p?.id === s.winner) ? s.winner : null
}
