'use client'

import Image from 'next/image'
import { useTranslation } from '@/lib/i18n-helpers'

/**
 * The desktop frame captured by `npm run capture:screenshots` (#932), keyed by
 * the catalog id the detail page already passes. A game without a capture
 * renders nothing rather than a broken image.
 */
const SCREENSHOT_SLUG: Record<string, string> = {
  'tic-tac-toe': 'tic-tac-toe',
  'connect-four': 'connect-four',
  memory: 'memory',
  yahtzee: 'yahtzee',
  rps: 'rock-paper-scissors',
  spy: 'spy',
  alias: 'alias',
}

export default function GameScreenshot({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { t } = useTranslation()
  const slug = SCREENSHOT_SLUG[gameId]
  if (!slug) return null
  return (
    <Image
      src={`/screenshots/${slug}-desktop.png`}
      alt={t('games.screenshotAlt', { gameName })}
      width={1280}
      height={800}
      sizes="(min-width: 1024px) 26rem, 100vw"
      priority
      className="h-auto w-full rounded-2xl border-2 border-bd-ink bg-bd-bg shadow-[4px_4px_0_var(--bd-ink)]"
    />
  )
}
