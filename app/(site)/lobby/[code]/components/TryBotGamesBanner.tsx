'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import GameIcon from '@/components/GameIcon'
import { useTranslation } from '@/lib/i18n-helpers'
import { getAvailableGameTypes, getBotSupportedGameTypes, getGameMetadata } from '@/lib/game-catalog'
import { getGameLobbiesRoute } from '@/lib/public-game-access'

const SUGGESTION_DELAY_MS = 60_000

interface TryBotGamesBannerProps {
  /** When the current waiting game was created — used to time the suggestion, not component mount. */
  waitingSinceMs: number
}

export default function TryBotGamesBanner({ waitingSinceMs }: TryBotGamesBannerProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const elapsed = Date.now() - waitingSinceMs
    if (elapsed >= SUGGESTION_DELAY_MS) {
      setVisible(true)
      return
    }
    const timer = setTimeout(() => setVisible(true), SUGGESTION_DELAY_MS - elapsed)
    return () => clearTimeout(timer)
  }, [waitingSinceMs])

  if (!visible || dismissed) return null

  const botGameTypes = getBotSupportedGameTypes().filter((type) =>
    getAvailableGameTypes().includes(type)
  )

  if (botGameTypes.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        marginTop: 8,
        borderRadius: 14,
        border: '1.5px solid var(--bd-lav)',
        background: 'color-mix(in srgb, var(--bd-lav) 8%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--bd-ink)', lineHeight: 1.35, margin: 0 }}>
          {t('game.ui.tryBotGamesTitle')}
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('common.close')}
          style={{
            flexShrink: 0,
            padding: 2,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--bd-ink-muted)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {botGameTypes.map((gameType) => {
          const metadata = getGameMetadata(gameType)
          const route = getGameLobbiesRoute(gameType)
          if (!metadata || !route) return null
          return (
            <Link
              key={gameType}
              href={route}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 10,
                border: '1.5px solid var(--bd-line)',
                background: 'var(--bd-card-warm)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--bd-ink)',
                textDecoration: 'none',
              }}
            >
              <GameIcon gameId={metadata.svgId} accentColor={metadata.accentColor} size={16} />
              {metadata.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
