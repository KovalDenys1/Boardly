export interface MoveKey<M> {
  key: string
  history: readonly M[]
}

export function nextMoveKey<M extends { timestamp: number }>(
  previous: MoveKey<M> | null,
  history: readonly M[] | undefined,
  sameMove: (a: M, b: M) => boolean,
): MoveKey<M> | null {
  const move = history?.[history.length - 1]
  if (!history || !move) return null
  const count = history.length
  const shown = previous?.history[count - 1]
  const onScreen =
    previous != null &&
    shown !== undefined &&
    sameMove(shown, move) &&
    // The client and the server stamp the same move with their own clocks.
    (count === previous.history.length || shown.timestamp === move.timestamp)
  return { key: onScreen ? previous.key : `${count}:${move.timestamp}`, history }
}
