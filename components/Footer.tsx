'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { getCatalogAvailableGames } from '@/lib/game-catalog'
import { SOCIAL_PLATFORM_LABELS, SOCIAL_PROFILES } from '@/lib/social-profiles'
import { reopenGoogleConsentMessage } from '@/lib/consent'
import { isProductionDeployment } from '@/lib/feature-flags'

export default function Footer({ listingBadge = false }: { listingBadge?: boolean }) {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()
  // The adsbygoogle loader — which is also what delivers Google's consent
  // message — only runs in production (#1152), so the control that reopens
  // it would do nothing anywhere else. `NODE_ENV === 'production'` alone
  // can't tell a Vercel Preview build from Production (Next.js builds both
  // with NODE_ENV=production), so this goes through the VERCEL_ENV-aware
  // helper that app/layout.tsx's loader gate uses.
  const canReopenConsentMessage = isProductionDeployment()

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
                  boxShadow: '3px 3px 0 var(--bd-coral)',
                  flexShrink: 0,
                }}
              >
                B
              </span>
              <span>
                {/* i18n-allow: brand name, identical in all four locales */}
                Boardly
                <span className="font-semibold" style={{ fontSize: 15, letterSpacing: 0, color: 'var(--bd-ink-soft)' }}>
                  {' – '}{t('footer.brandLine')}
                </span>
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--bd-ink-soft)' }}>
              {t('footer.tagline')}
            </p>
            {listingBadge && (
              // Launchstag publishes the listing once it finds this link on the home page; the image is a local copy, so no visitor request reaches them.
              <a
                href="https://launchstag.com"
                target="_blank"
                rel="noopener"
                className="mt-5 inline-block rounded-[14px] focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bd-lav-deep"
              >
                {(['light', 'dark'] as const).map((theme) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={theme}
                    src={`/launchstag/badge-${theme}.svg`}
                    alt={t('footer.launchstagBadge')}
                    width={198}
                    height={62}
                    loading="lazy"
                    decoding="async"
                    className={theme === 'light' ? 'block dark:hidden' : 'hidden dark:block'}
                  />
                ))}
              </a>
            )}
          </div>

          {/* Games */}
          <div>
            <h3
              className="font-semibold text-xs uppercase tracking-wider mb-4"
              style={{ color: 'var(--bd-ink-soft)' }}
            >
              {t('footer.games')}
            </h3>
            <ul className="space-y-2.5">
              {/* Every available game, from the catalog: this column is on every
                  page, so it is the one set of links to the game pages a crawler
                  finds everywhere. Four were hand-typed here while nine were live. */}
              {getCatalogAvailableGames().map((game) => (
                <li key={game.id}>
                  <Link
                    href={(game.route ?? '').replace(/\/lobbies$/, '')}
                    className="text-sm transition-colors hover:opacity-100"
                    style={{ color: 'var(--bd-ink-soft)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                  >
                    {t(game.nameKey as TranslationKeys)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Play */}
          <div>
            <h3
              className="font-semibold text-xs uppercase tracking-wider mb-4"
              style={{ color: 'var(--bd-ink-soft)' }}
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
                // The only crawlable link to /premium on the site.
                { labelKey: 'common.premium', href: '/premium' },
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
              style={{ color: 'var(--bd-ink-soft)' }}
            >
              {t('footer.legal')}
            </h3>
            <ul className="space-y-2.5">
              {([
                { labelKey: 'footer.privacy', href: '/privacy' },
                { labelKey: 'footer.terms', href: '/terms' },
                { labelKey: 'footer.withdrawal', href: '/withdrawal' },
                // #1173: the community rules are part of the Terms, so they sit with them.
                { labelKey: 'footer.rules', href: '/rules' },
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
              {/* Reopens Google's consent message via the googlefc revocation
                  API (#1153). Only where the adsbygoogle loader itself runs
                  (production, #1152) — elsewhere there is nothing to reopen. */}
              {canReopenConsentMessage && (
                <li>
                  <button
                    type="button"
                    onClick={reopenGoogleConsentMessage}
                    className="cursor-pointer text-sm text-left transition-colors"
                    style={{ color: 'var(--bd-ink-soft)', background: 'none', border: 0, padding: 0, fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                  >
                    {t('footer.privacySettings')}
                  </button>
                </li>
              )}
            </ul>

            <h3
              className="font-semibold text-xs uppercase tracking-wider mb-4 mt-6"
              style={{ color: 'var(--bd-ink-soft)' }}
            >
              {t('footer.community')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/about"
                  className="text-sm transition-colors"
                  style={{ color: 'var(--bd-ink-soft)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                >
                  {t('footer.about')}
                </Link>
              </li>
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
                  {/* i18n-allow: product name, identical in all four locales */}
                  GitHub
                </a>
              </li>
              {/* Renders nothing until lib/social-profiles.ts lists an account (#1091). */}
              {SOCIAL_PROFILES.map((profile) => (
                <li key={profile.url}>
                  <a
                    href={profile.url}
                    target="_blank"
                    rel="me noopener noreferrer"
                    className="text-sm transition-colors"
                    style={{ color: 'var(--bd-ink-soft)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                  >
                    {SOCIAL_PLATFORM_LABELS[profile.platform]}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="/discord"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors"
                  style={{ color: 'var(--bd-ink-soft)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--bd-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--bd-ink-soft)')}
                >
                  {t('footer.discord')}
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
                    // Ink text at rest, not bd-coral-deep — 3.3:1 on this
                    // footer background, below the 4.5:1 AA text minimum
                    // (#1171 axe pass). The coral border still marks it as
                    // the feedback action; the coral *fill* on hover/focus is
                    // the brand-button pattern DESIGN.md documents as
                    // Denys's call, so that one keeps white text.
                    color: 'var(--bd-ink)',
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
                    el.style.color = 'var(--bd-ink)'
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
          className="mt-10 pt-6 text-xs"
          style={{ borderTop: '1.5px solid var(--bd-line)', color: 'var(--bd-ink-soft)' }}
        >
          {/* No operator imprint here (#1227): the seller's name and home address
              show only on /terms, /privacy, /withdrawal and the Premium purchase
              confirmation email, where the law actually asks for them - not on a
              row that every crawled page carries. */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <span>{t('footer.allRightsReserved', { year: currentYear })}</span>
            <span>{t('footer.builtWith')}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
