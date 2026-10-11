import { useEffect, useRef, useState } from 'react'
import type { RollHistoryEntry } from '@/components/RollHistory'
import { readLocal, writeLocal } from '@/lib/safe-storage'
import { readStoredRollHistory, serializeRollHistory } from '@/lib/yahtzee-roll-history'

export function useStoredRollHistory(code: string, gameId: string | null | undefined, active: boolean) {
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>([])
  // The game the entries in memory belong to; after a rematch they are the old game's until the load below runs.
  const ownerRef = useRef<string | null>(null)
  const key = `rollHistory_${code}`

  useEffect(() => {
    if (gameId && ownerRef.current === gameId && rollHistory.length > 0) {
      writeLocal(key, serializeRollHistory(gameId, rollHistory))
    }
  }, [rollHistory, gameId, key])

  useEffect(() => {
    if (!active || !gameId || ownerRef.current === gameId) return
    ownerRef.current = gameId
    setRollHistory(readStoredRollHistory(readLocal(key), gameId))
  }, [active, gameId, key])

  return [rollHistory, setRollHistory] as const
}
