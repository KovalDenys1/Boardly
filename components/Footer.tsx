'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'

export default function Footer() {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <footer
      className="mt-auto"
      style={{
        background: 'var(--bd-bg2)',
        borderTop: '1.5px solid var(--bd-line)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Top section: brand + columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div
              className="flex items-center gap-2 mb-3"
              style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', color: 'var(--bd-ink)' }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'var(--bd-ink)',
                  color: 'var(--bd-sun)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--bd-font-display)',
                  fontWeight: 800,
                  fontSize: 20,
                  transform: 'rotate(-6deg)',
                  boxShadow: '3px 3px 0 var(--bd-coral)',
                  flexShrink: 0,
                }}
              >
                B
              </span>
              boardly
            </div>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--bd-ink-muted)' }}>
              {t('footer.tagline')}
            </p>
          </div>

          {/* Games */}
          <div>
            <h3
              className="font-semibold text-xs uppercase tracking-wider mb-4"
              style={{ color: 'var(--bd-ink-muted)' }}
            >
              {t('footer.games')}
            </h3>
            <ul className="space-y-2.5">
              {[
                { label: 'Yahtzee', href: '/games/yahtzee' },
                { label: 'Tic-Tac-Toe', href: '/games/tic-tac-toe' },
                { label: 'Guess the Spy', href: '/games/spy' },
                { label: 'Memory', href: '/games/memory' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:opacity-100"
                    style={{ color: 'var(--bd-ink-soft)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Play */}
          <div>
            <h3
              className="font-semibold text-xs uppercase tracking-wider mb-4"
              style={{ color: 'var(--bd-ink-muted)' }}
            >
              {t('footer.play')}
            </h3>
            <ul className="space-y-2.5">
              {([
                { labelKey: 'footer.games', href: '/games' },
                { labelKey: 'footer.quickPlay', href: '/#quick-play' },
                { labelKey: 'footer.createRoom', href: '/lobby/create' },
                { labelKey: 'footer.leaderboard', href: '/leaderboard' },
                { labelKey: 'footer.guides', href: '/guides' },
              ] as { labelKey: TranslationKeys; href: string }[]).map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors"
                    style={{ color: 'var(--bd-ink-soft)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal & Community */}
          <div>
            <h3
              className="font-semibold text-xs uppercase tracking-wider mb-4"
              style={{ color: 'var(--bd-ink-muted)' }}
            >
              {t('footer.legal')}
            </h3>
            <ul className="space-y-2.5">
              {([
                { labelKey: 'footer.privacy', href: '/privacy' },
                { labelKey: 'footer.terms', href: '/terms' },
              ] as { labelKey: TranslationKeys; href: string }[]).map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors"
                    style={{ color: 'var(--bd-ink-soft)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>

            <h3
              className="font-semibold text-xs uppercase tracking-wider mb-4 mt-6"
              style={{ color: 'var(--bd-ink-muted)' }}
            >
              {t('footer.community')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/KovalDenys1/Boardly"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors"
                  style={{ color: 'var(--bd-ink-soft)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                >
                  GitHub
                </a>
              </li>
              <li>
                <button
                  id="footer-feedback-trigger"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
                  className="cursor-pointer rounded-xl text-sm font-semibold transition-all"
                  style={{
                    padding: '6px 14px',
                    border: '1.5px solid var(--bd-coral)',
                    background: 'transparent',
                    color: 'var(--bd-coral-deep)',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.background = 'var(--bd-coral)'
                    el.style.color = '#fff'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.background = 'transparent'
                    el.style.color = 'var(--bd-coral-deep)'
                  }}
                >
                  {t('footer.sendFeedback')}
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          style={{ borderTop: '1.5px solid var(--bd-line)', color: 'var(--bd-ink-muted)' }}
        >
          <span>{t('footer.allRightsReserved', { year: currentYear })}</span>
          <span>{t('footer.builtWith')}</span>
        </div>
      </div>
    </footer>
  )
}
