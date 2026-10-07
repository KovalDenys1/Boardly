import type { GameOutcome } from '@/components/game-chrome/GameStatusBanner'

/**
 * The finished game as the viewer's seat sees it, for GameStatusBanner's
 * `outcome`. Undefined while the game runs, for spectators, for a viewer who
 * holds no seat, and when the winner is not known - the banner then shows its
 * neutral badge rather than guess.
 */
export function viewerOutcome({
  isFinished,
  isDraw,
  isSpectator,
  isSeated,
  isViewerWinner,
  isViewerAtTop = true,
}: {
  isFinished: boolean
  /** No single winner: the top score is shared. */
  isDraw: boolean
  isSpectator: boolean
  /** The viewer plays in this game. */
  isSeated: boolean
  /** Whether the viewer won; null when no winner is recorded. */
  isViewerWinner: boolean | null
  /**
   * On a draw, whether the viewer shares the top score. Games with three or
   * more players record no winner for a tie at the top, and everyone below it lost.
   */
  isViewerAtTop?: boolean
}): GameOutcome | undefined {
  if (!isFinished || isSpectator || !isSeated) return undefined
  if (isDraw) return isViewerAtTop ? 'draw' : 'loss'
  if (isViewerWinner === null) return undefined
  return isViewerWinner ? 'win' : 'loss'
}

/** Whether `viewerId` holds the highest score among `playerIds` (ties included). */
export function hasTopScore(
  scores: Record<string, number> | undefined,
  playerIds: readonly string[],
  viewerId: string | null | undefined,
): boolean {
  if (!viewerId || playerIds.length === 0) return false
  const scoreOf = (id: string) => scores?.[id] ?? 0
  const top = Math.max(...playerIds.map(scoreOf))
  return scoreOf(viewerId) === top
}
