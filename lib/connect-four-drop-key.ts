import type { ConnectFourMoveRecord } from '@/lib/games/connect-four-game'
import { nextMoveKey, type MoveKey } from '@/lib/move-key'

export type DropKey = MoveKey<ConnectFourMoveRecord>

const sameDrop = (a: ConnectFourMoveRecord, b: ConnectFourMoveRecord) =>
  a.disc === b.disc && a.col === b.col && a.row === b.row

export function nextDropKey(
  previous: DropKey | null,
  history: readonly ConnectFourMoveRecord[] | undefined,
): DropKey | null {
  return nextMoveKey(previous, history, sameDrop)
}
