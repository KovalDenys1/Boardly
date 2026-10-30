'use client'

import Image from 'next/image'
import { useTranslation } from '@/lib/i18n-helpers'

/**
 * The desktop frames captured by `npm run capture:screenshots` (#932), one per
 * theme, keyed by the catalog id the detail page already passes. A game
 * without a capture renders nothing rather than a broken image.
 */
const SCREENSHOT_SLUG: Record<string, string> = {
  'tic-tac-toe': 'tic-tac-toe',
  'connect-four': 'connect-four',
  memory: 'memory',
  yahtzee: 'yahtzee',
  rps: 'rock-paper-scissors',
  spy: 'spy',
  alias: 'alias',
  'liars-party': 'liars-party',
  'guess-my-drawing': 'sketch-and-guess',
  checkers: 'checkers',
  ludo: 'ludo',
}

const FRAME = 'h-auto w-full rounded-2xl border-2 border-bd-ink bg-bd-bg shadow-[4px_4px_0_var(--bd-ink)]'

/** Whether `npm run capture:screenshots` has produced a frame for this catalog id. */
export function hasScreenshot(gameId: string): boolean {
  return gameId in SCREENSHOT_SLUG
}

export default function GameScreenshot({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { t } = useTranslation()
  const slug = SCREENSHOT_SLUG[gameId]
  if (!slug) return null
  const alt = t('games.screenshotAlt', { gameName })
  // The hero frame is the page's LCP, and the theme class comes from an inline script the server cannot see, so both frames load eagerly.
  return (
    <>
      <Image
        src={`/screenshots/${slug}-desktop.png`}
        alt={alt}
        width={1280}
        height={800}
        sizes="(min-width: 1024px) 24rem, 100vw"
        preload
        fetchPriority="high"
        data-theme-shot="light"
        className={`bd-shot-light ${FRAME}`}
      />
      <Image
        src={`/screenshots/${slug}-desktop-dark.png`}
        alt={alt}
        width={1280}
        height={800}
        sizes="(min-width: 1024px) 24rem, 100vw"
        loading="eager"
        fetchPriority="high"
        data-theme-shot="dark"
        className={`bd-shot-dark ${FRAME}`}
      />
    </>
  )
}
