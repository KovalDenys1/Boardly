'use client'

import { useEffect, useState } from 'react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import GameIcon from '@/components/GameIcon'
import { Icon, type IconName } from '@/components/icons'
import { useIsPlayApp } from '@/hooks/useIsPlayApp'

/**
 * A marquee row is either a game (drawn with its own GameIcon, bare so it sits
 * on the strip without a tile) or a platform claim (a chrome Icon).
 */
type MarqueeItemSpec =
  | { key: TranslationKeys; game: string; color: string }
  | { key: TranslationKeys; icon: IconName; color: string }

const ITEM_ICONS: readonly MarqueeItemSpec[] = [
  { key: 'home.marquee.playYahtzee',    game: 'yahtzee',     color: 'var(--bd-coral)' },
  { key: 'home.marquee.findTheSpy',     game: 'spy',         color: 'var(--bd-lav)'   },
  { key: 'home.marquee.quickTicTacToe', game: 'tic-tac-toe', color: 'var(--bd-mint)'  },
  { key: 'home.marquee.matchCards',     game: 'memory',      color: 'var(--bd-sun)'   },
  { key: 'home.marquee.joinAsGuest',    icon: 'user',        color: 'var(--bd-sky)'   },
  { key: 'home.marquee.shareCode',      icon: 'link',        color: 'var(--bd-coral)' },
  { key: 'home.marquee.inviteFriends',  icon: 'mail',        color: 'var(--bd-mint)'  },
  { key: 'home.marquee.keepStats',      icon: 'chart',       color: 'var(--bd-lav)'   },
  { key: 'home.marquee.noDownload',     icon: 'bolt',        color: 'var(--bd-sky)'   },
  { key: 'home.marquee.playInBrowser',  icon: 'globe',       color: 'var(--bd-sun)'   },
] as const

// Claims that are false inside the installed Play app.
const WEB_ONLY_KEYS: ReadonlySet<TranslationKeys> = new Set(['home.marquee.noDownload', 'home.marquee.playInBrowser'])

function MarqueeItem({
  spec,
  color,
  txt,
  index,
}: {
  spec: MarqueeItemSpec
  color: string
  txt: string
  index: number
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: 'var(--bd-font-display)',
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {'game' in spec
        ? <GameIcon gameId={spec.game} accentColor={color} size={26} variant="bare" />
        : <Icon name={spec.icon} size={26} />}
      <span style={{ color: index % 3 === 0 ? color : 'var(--bd-bg)' }}>{txt}</span>
    </span>
  )
}

interface MarqueeStripProps {
  variant?: 'section' | 'hero'
}

export default function MarqueeStrip({ variant = 'section' }: MarqueeStripProps) {
  const { t } = useTranslation()
  const isPlayApp = useIsPlayApp()
  const items = isPlayApp ? ITEM_ICONS.filter((spec) => !WEB_ONLY_KEYS.has(spec.key)) : ITEM_ICONS
  const [canAnimate, setCanAnimate] = useState(false)
  const isHero = variant === 'hero'

  useEffect(() => {
    let cancelled = false
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setCanAnimate(true)
    }, 1200)

    if ('fonts' in document) {
      document.fonts.ready
        .then(() => {
          if (!cancelled) setCanAnimate(true)
        })
        .catch(() => {
          if (!cancelled) setCanAnimate(true)
        })
    } else {
      setCanAnimate(true)
    }

    return () => {
      cancelled = true
      window.clearTimeout(fallbackTimer)
    }
  }, [])

  return (
    <section
      aria-hidden
      style={{
        margin: isHero ? 0 : '24px 0',
        padding: isHero ? '20px 0' : '20px 0',
        background: 'var(--bd-ink)',
        color: 'var(--bd-bg)',
        borderTop: '3px solid var(--bd-ink)',
        borderBottom: '3px solid var(--bd-ink)',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: isHero ? '0 16px 0 rgba(31,27,22,0.08)' : 'none',
      }}
    >
      <style>{`
        @keyframes boardly-marquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-33.333333%, 0, 0); }
        }
        .bd-marquee-track {
          display: flex;
          width: max-content;
          animation: boardly-marquee 40s linear infinite;
          animation-play-state: paused;
          transform: translate3d(0, 0, 0);
          will-change: transform;
        }
        .bd-marquee-track.is-ready {
          animation-play-state: running;
        }
        .bd-marquee-group {
          display: flex;
          align-items: center;
          gap: 48px;
          padding-right: 48px;
        }
        @media (prefers-reduced-motion: reduce) {
          .bd-marquee-track { animation: none; }
        }
      `}</style>
      <div className={`bd-marquee-track ${canAnimate ? 'is-ready' : ''}`}>
        {[0, 1, 2].map((groupIndex) => (
          <div key={groupIndex} className="bd-marquee-group">
            {items.map((spec, itemIndex) => (
              <MarqueeItem
                key={`${groupIndex}-${spec.key}`}
                spec={spec}
                color={spec.color}
                txt={t(spec.key)}
                index={itemIndex}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
