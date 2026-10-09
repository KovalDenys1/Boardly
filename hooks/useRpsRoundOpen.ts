import { useEffect, useState } from 'react'

// Both players read the server's nextRoundAt, so the hold and the next round agree on both screens.
export function useRpsRoundOpen(nextRoundAt: number | null | undefined): boolean {
  const pending = typeof nextRoundAt === 'number' && Number.isFinite(nextRoundAt)
  const [openedAt, setOpenedAt] = useState<number | null>(null)
  useEffect(() => {
    if (typeof nextRoundAt !== 'number' || !Number.isFinite(nextRoundAt)) return
    const timer = setTimeout(() => setOpenedAt(nextRoundAt), Math.max(0, nextRoundAt - Date.now()))
    return () => clearTimeout(timer)
  }, [nextRoundAt])
  return !pending || openedAt === nextRoundAt
}
