'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

const ITEM_ICONS = [
  { key: 'home.marquee.playYahtzee',  icon: '🎲', color: 'var(--bd-coral)' },
  { key: 'home.marquee.findTheSpy',   icon: '🕵️', color: 'var(--bd-lav)'   },
  { key: 'home.marquee.quickTicTacToe', icon: '❌', color: 'var(--bd-mint)'  },
  { key: 'home.marquee.matchCards',   icon: '🧠', color: 'var(--bd-sun)'   },
  { key: 'home.marquee.joinAsGuest',  icon: '👤', color: 'var(--bd-sky)'   },
  { key: 'home.marquee.shareCode',    icon: '🔗', color: 'var(--bd-coral)' },
  { key: 'home.marquee.inviteFriends', icon: '💌', color: 'var(--bd-mint)'  },
  { key: 'home.marquee.keepStats',    icon: '📊', color: 'var(--bd-lav)'   },
  { key: 'home.marquee.noDownload',   icon: '⚡', color: 'var(--bd-sky)'   },
  { key: 'home.marquee.playInBrowser', icon: '🌐', color: 'var(--bd-sun)'   },
] as const

function MarqueeItem({
  icon,
  color,
  txt,
  index,
}: {
  icon: string
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
      <span style={{ fontSize: 26 }}>{icon}</span>
      <span style={{ color: index % 3 === 0 ? color : 'var(--bd-bg)' }}>{txt}</span>
    </span>
  )
}

interface MarqueeStripProps {
  variant?: 'section' | 'hero'
}

export default function MarqueeStrip({ variant = 'section' }: MarqueeStripProps) {
  const { t } = useTranslation()
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
            {ITEM_ICONS.map(({ key, icon, color }, itemIndex) => (
              <MarqueeItem
                key={`${groupIndex}-${key}`}
                icon={icon}
                color={color}
                txt={t(key)}
                index={itemIndex}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
