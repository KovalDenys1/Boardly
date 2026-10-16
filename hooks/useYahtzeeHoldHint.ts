'use client'

import { useEffect, useRef, useState } from 'react'

const SEEN_KEY = 'boardly_yz_hold_hint_seen'

export function useYahtzeeHoldHint({
  myTurn,
  rollsLeft,
  heldCount,
}: {
  myTurn: boolean
  rollsLeft: number
  heldCount: number
}): boolean {
  const [coarse, setCoarse] = useState(false)
  const [seen, setSeen] = useState(true)
  const hadTurn = useRef(false)
  const rolled = myTurn && rollsLeft < 3

  useEffect(() => {
    setCoarse(window.matchMedia('(pointer: coarse)').matches)
    try {
      setSeen(window.localStorage.getItem(SEEN_KEY) === '1')
    } catch {
      setSeen(false)
    }
  }, [])

  useEffect(() => {
    if (seen) return
    const markSeen = () => {
      setSeen(true)
      try {
        window.localStorage.setItem(SEEN_KEY, '1')
      } catch {
        // A blocked storage only means the hint can come back on the next visit.
      }
    }
    if (rolled && heldCount > 0) markSeen()
    else if (rolled) hadTurn.current = true
    else if (!myTurn && hadTurn.current) markSeen()
  }, [seen, rolled, myTurn, heldCount])

  return coarse && !seen && rolled && rollsLeft > 0 && heldCount === 0
}
