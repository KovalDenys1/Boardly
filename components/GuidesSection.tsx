'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { ALL_GUIDES } from '@/lib/guides-catalog'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'

/**
 * Compact "Guides & tips" strip rendered on `/` and `/games`.
 * Purpose is internal linking: those two pages are the only ones Google
 * indexes today, and the guides were unreachable from them (GSC 2026-08-29).
 * Lists every guide (#921): the six-slug shortlist left eight guides with no
 * inbound link from a crawled page. Two columns, and the last card spans both
 * when the catalog is an odd length, so the strip never ends on a half-empty
 * row – #923 took the catalog from 14 guides to 11.
 */
export default function GuidesSection() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="home-guides-heading"
      className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="home-guides-heading"
            className="text-2xl font-bold sm:text-3xl"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {t('home.guidesTitle')}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
            {t('home.guidesSubtitle')}
          </p>
        </div>
        <Link href="/guides" className="bd-btn bd-btn-soft text-sm">
          {t('home.allGuides')} →
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ALL_GUIDES.map((guide, index) => (
          <li
            key={guide.slug}
            className={index === ALL_GUIDES.length - 1 && ALL_GUIDES.length % 2 === 1 ? 'sm:col-span-2' : undefined}
          >
            <Link
              href={`/guides/${guide.slug}`}
              className="bd-card group flex h-full items-start gap-3 p-4 transition-transform hover:-translate-y-0.5"
            >
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 text-xl shadow-[2px_2px_0_var(--bd-ink)]"
                style={{
                  borderColor: 'var(--bd-ink)',
                  background: `color-mix(in srgb, ${guide.accent} 18%, var(--bd-bg2))`,
                }}
              >
                {'game' in guide.icon ? (
                  <GameIcon gameId={guide.icon.game} accentColor={guide.accent} size={22} variant="bare" />
                ) : (
                  <Icon name={guide.icon.glyph} size={22} style={{ color: guide.accent }} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-sm font-bold leading-snug group-hover:text-bd-coral"
                  style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
                >
                  {guide.title}
                </span>
                <span className="mt-0.5 block text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                  {guide.readTime}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
