'use client'

import React, { useEffect, useState } from 'react'
import { CelebrationEvent, getCategoryDisplayName } from '@/lib/celebrations'
import { useTranslation } from '@/lib/i18n-helpers'

interface CelebrationBannerProps {
  event: CelebrationEvent | null
  onComplete: () => void
}

export default function CelebrationBanner({ event, onComplete }: CelebrationBannerProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (event) {
      setVisible(true)

      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(onComplete, 300)
      }, 2500)

      return () => clearTimeout(timer)
    }
  }, [event, onComplete])

  if (!event || !visible) return null

  const getTone = () => {
    switch (event.type) {
      case 'yahtzee':
        return {
          shell: 'border-[rgba(255,196,77,0.34)] bg-[linear-gradient(135deg,rgba(255,196,77,0.2),rgba(255,255,255,0.98))]',
          icon: 'bg-[rgba(255,196,77,0.24)]',
          badge: 'bg-[rgba(255,196,77,0.22)] text-[var(--bd-coral-deep)]',
        }
      case 'largeStraight':
        return {
          shell: 'border-[rgba(155,140,255,0.28)] bg-[linear-gradient(135deg,rgba(155,140,255,0.16),rgba(255,255,255,0.98))]',
          icon: 'bg-[rgba(155,140,255,0.18)]',
          badge: 'bg-[rgba(155,140,255,0.18)] text-[var(--bd-lav-deep)]',
        }
      case 'fullHouse':
        return {
          shell: 'border-[rgba(79,201,166,0.28)] bg-[linear-gradient(135deg,rgba(79,201,166,0.18),rgba(255,255,255,0.98))]',
          icon: 'bg-[rgba(79,201,166,0.18)]',
          badge: 'bg-[rgba(79,201,166,0.18)] text-[var(--bd-mint-deep)]',
        }
      case 'highScore':
        return {
          shell: 'border-[rgba(255,107,91,0.28)] bg-[linear-gradient(135deg,rgba(255,107,91,0.16),rgba(255,255,255,0.98))]',
          icon: 'bg-[rgba(255,107,91,0.16)]',
          badge: 'bg-[rgba(255,107,91,0.18)] text-[var(--bd-coral-deep)]',
        }
      case 'perfectRoll':
        return {
          shell: 'border-[rgba(107,193,240,0.28)] bg-[linear-gradient(135deg,rgba(107,193,240,0.18),rgba(255,255,255,0.98))]',
          icon: 'bg-[rgba(107,193,240,0.18)]',
          badge: 'bg-[rgba(107,193,240,0.18)] text-[var(--bd-sky-deep)]',
        }
      default:
        return {
          shell: 'border-[rgba(107,193,240,0.28)] bg-[linear-gradient(135deg,rgba(107,193,240,0.18),rgba(255,255,255,0.98))]',
          icon: 'bg-[rgba(107,193,240,0.18)]',
          badge: 'bg-[rgba(107,193,240,0.18)] text-[var(--bd-sky-deep)]',
        }
    }
  }

  const tone = getTone()

  return (
    <div
      className={`
        pointer-events-none fixed top-20 left-1/2 z-50 -translate-x-1/2
        ${visible ? 'animate-bounce-in opacity-100' : 'animate-fade-out opacity-0'}
      `}
    >
      <div
        className={`w-[min(92vw,460px)] rounded-[24px] border px-4 py-3 shadow-[0_18px_40px_rgba(41,37,36,0.18)] backdrop-blur-sm ${tone.shell}`}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] text-[30px] shadow-sm ${tone.icon}`}>
            {event.emoji}
          </div>

          <div className="min-w-0 flex-1">
            <div className="bd-kicker">Hot Hand</div>
            <h3 className="mt-0.5 text-lg font-semibold leading-tight text-bd-ink sm:text-xl">
              {event.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-bd-ink-soft">
              {event.category && (
                <span className="font-semibold text-bd-ink">{getCategoryDisplayName(event.category)} </span>
              )}
              {t('celebration.scorePoints', { count: event.score })}
            </p>
          </div>

          <div className={`shrink-0 rounded-full px-2.5 py-1.5 text-sm font-bold ${tone.badge}`}>
            +{event.score}
          </div>
        </div>
      </div>
    </div>
  )
}
