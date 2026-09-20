'use client'

import { useEffect, useState } from 'react'
import { MOBILE_MAX_MEDIA_QUERY, PHONE_LANDSCAPE_MEDIA_QUERY } from '@/lib/responsive-tokens'

export type ActiveGameLayout = 'desktop' | 'landscape' | 'mobile'

/**
 * Which of a game screen's three layout trees is the visible one (#1052).
 *
 * A game page renders its desktop, phone-landscape and mobile trees at the same
 * time and hides two of them with `display: none`. That hides pixels and nothing
 * else: React mounts all three subtrees and runs all three sets of effects. For
 * a board that is fine – a hidden grid of buttons costs nothing but DOM. For the
 * result overlay it is not: the after-game block inside it reports
 * `push_prompt_shown` and `signup_prompt shown` on mount, so a finished Memory
 * game sent three of each, and Memory is the most played game on the site.
 *
 * Which copy is visible is a CSS fact, so the components inside the overlay
 * cannot see it and must not try to elect one. This hook reads the same two
 * media queries the stylesheet switches on – from `lib/responsive-tokens`, which
 * is the single source those `@media` literals are checked against – so the tree
 * that mounts the overlay is exactly the tree the player can see.
 *
 * Returns `null` until the first client effect has run. The server render and
 * the first client render must agree, and guessing "desktop" there would mount
 * the hidden desktop overlay on a phone for one commit – which is another mount,
 * and another pair of beacons. One frame with no overlay over an already-visible
 * finished board is the cheaper trade.
 */
export function useActiveGameLayout(): ActiveGameLayout | null {
  const [layout, setLayout] = useState<ActiveGameLayout | null>(null)

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_MAX_MEDIA_QUERY)
    const landscape = window.matchMedia(PHONE_LANDSCAPE_MEDIA_QUERY)

    const update = () => {
      setLayout(landscape.matches ? 'landscape' : mobile.matches ? 'mobile' : 'desktop')
    }

    update()
    mobile.addEventListener('change', update)
    landscape.addEventListener('change', update)

    return () => {
      mobile.removeEventListener('change', update)
      landscape.removeEventListener('change', update)
    }
  }, [])

  return layout
}
