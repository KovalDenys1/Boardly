import { notFound } from 'next/navigation'
import GameChromeSheet from './GameChromeSheet'

/**
 * Dev-only contact sheet for the shared in-game header and status banner: every
 * seat count and timer level in one page, for screenshots at any width and for
 * e2e/game-chrome-header.spec.ts. Never shipped: 404 in production.
 */
export const metadata = { robots: { index: false, follow: false } }

export default function DevGameChromePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <GameChromeSheet />
}
