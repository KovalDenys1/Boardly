'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import type { TranslationKeys } from '@/lib/i18n-helpers'

export default function Footer() {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-black/30 backdrop-blur-sm border-t border-white/10 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Top section: brand + columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 text-2xl font-bold text-white mb-3">
              🎲 Boardly
            </div>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Games */}
          <div>
            <h3 className="text-white/80 font-semibold text-sm uppercase tracking-wider mb-4">{t('footer.games')}</h3>
            <ul className="space-y-2.5">
              {[
                { label: 'Yahtzee', href: '/games/yahtzee' },
                { label: 'Tic-Tac-Toe', href: '/games/tic-tac-toe' },
                { label: 'Rock Paper Scissors', href: '/games/rock-paper-scissors' },
                { label: 'Guess the Spy', href: '/games/spy' },
                { label: 'Memory', href: '/games/memory' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/50 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Play */}
          <div>
            <h3 className="text-white/80 font-semibold text-sm uppercase tracking-wider mb-4">{t('footer.play')}</h3>
            <ul className="space-y-2.5">
              {([
                { labelKey: 'footer.quickPlay', href: '/#quick-play' },
                { labelKey: 'footer.createRoom', href: '/lobby/create' },
                { labelKey: 'footer.leaderboard', href: '/leaderboard' },
                { labelKey: 'footer.guides', href: '/guides' },
              ] as { labelKey: TranslationKeys; href: string }[]).map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/50 hover:text-white text-sm transition-colors"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal & Community */}
          <div>
            <h3 className="text-white/80 font-semibold text-sm uppercase tracking-wider mb-4">{t('footer.legal')}</h3>
            <ul className="space-y-2.5">
              {([
                { labelKey: 'footer.privacy', href: '/privacy' },
                { labelKey: 'footer.terms', href: '/terms' },
              ] as { labelKey: TranslationKeys; href: string }[]).map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/50 hover:text-white text-sm transition-colors"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>

            <h3 className="text-white/80 font-semibold text-sm uppercase tracking-wider mb-4 mt-6">{t('footer.community')}</h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/KovalDenys1/Boardly"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/50 hover:text-white text-sm transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <button
                  id="footer-feedback-trigger"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
                  className="text-white/50 hover:text-white text-sm transition-colors cursor-pointer bg-transparent border-0 p-0"
                >
                  {t('footer.sendFeedback')}
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-white/35 text-xs">
          <span>{t('footer.allRightsReserved', { year: currentYear })}</span>
          <span>{t('footer.builtWith')}</span>
        </div>
      </div>
    </footer>
  )
}
