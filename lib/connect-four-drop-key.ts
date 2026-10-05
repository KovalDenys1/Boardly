import type { ConnectFourMoveRecord } from '@/lib/games/connect-four-game'

export interface DropKey {
  key: string
  count: number
  move: ConnectFourMoveRecord
}

// The optimistic copy of a move carries the client's timestamp and the server's copy its own.
export function nextDropKey(
  previous: DropKey | null,
  history: readonly ConnectFourMoveRecord[] | undefined,
): DropKey | null {
  const move = history?.[history.length - 1]
  if (!history || !move) return null
  const count = history.length
  const sameDrop =
    previous !== null &&
    previous.count === count &&
    previous.move.disc === move.disc &&
    previous.move.col === move.col &&
    previous.move.row === move.row
  return { key: sameDrop ? previous.key : `${count}:${move.timestamp}`, count, move }
}
