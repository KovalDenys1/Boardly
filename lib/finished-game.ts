import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'

const KEY = 'boardly:finished-a-game:v1'

/** This browser has seen a game through to its end screen. */
export function noteFinishedGame(): void {
  writeLocal(KEY, '1')
}

export function hasFinishedGame(): boolean {
  return readLocal(KEY) === '1'
}

/** Test seam. */
export function resetFinishedGameNote(): void {
  removeLocal(KEY)
}
