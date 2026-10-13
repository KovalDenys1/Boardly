import { stripSketchCustomWords } from '@/lib/games/sketch-and-guess-game'

/**
 * What a finished game's snapshot may leave the server with. Memory faces, Spy
 * roles, RPS choices and Liar's Party bluffs stay: they are the game's content and
 * the viewer played it. What goes is bookkeeping the client never sees live.
 */
export function sanitizeReplayState<T extends object>(gameType: string, state: T): T {
  if (!state || typeof state !== 'object' || !('data' in state)) return state
  const data = (state as { data?: unknown }).data
  if (!data || typeof data !== 'object') return state

  switch (gameType) {
    case 'sketch_and_guess':
      return stripSketchCustomWords(state as T & { data?: unknown })
    case 'alias':
      return 'usedWordIndices' in data ? { ...state, data: { ...(data as Record<string, unknown>), usedWordIndices: [] } } : state
    case 'tic_tac_toe':
    case 'connect_four':
      return 'undoSnapshots' in data ? { ...state, data: { ...(data as Record<string, unknown>), undoSnapshots: [] } } : state
    default:
      return state
  }
}
