'use client'

import { useCallback, type MouseEvent } from 'react'
import { shouldGateNav, type NavViewer, type SiteNavItem } from '@/lib/site-nav'

interface UseNavGateOptions extends NavViewer {
  onUnauthClick?: (dest: string) => void
  /** Runs before the auth prompt opens, e.g. closing the drawer. */
  beforeGate?: () => void
}

/**
 * Nav items are real anchors (#921). This returns the click guard that swaps the
 * navigation for the auth prompt when the viewer may not open the route.
 */
export function useNavGate({ isAuthenticated, isGuest, onUnauthClick, beforeGate }: UseNavGateOptions) {
  return useCallback(
    (item: SiteNavItem) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldGateNav(item, { isAuthenticated, isGuest })) return
      event.preventDefault()
      beforeGate?.()
      onUnauthClick?.(item.href)
    },
    [isAuthenticated, isGuest, onUnauthClick, beforeGate],
  )
}
