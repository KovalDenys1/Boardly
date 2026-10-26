'use client'

import Link from 'next/link'
import Footer from '@/components/Footer'
import { COMMUNITY_RULES_BANNED, COMMUNITY_RULES_KIND, MODERATION_ACTIONS } from '@/lib/community-rules'
import { useTranslation } from '@/lib/i18n-helpers'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'

// bd-ink plus underline, as on /withdrawal: bd-coral text fell below the 4.5:1
// AA minimum on this card background (#1171).
const linkStyle = { color: 'var(--bd-ink)', textDecoration: 'underline', textUnderlineOffset: 3 } as const

const headingStyle = { color: 'var(--bd-ink)' } as const

/**
 * The community rules and how reports and moderation work (#1173), in plain
 * words for an audience that starts at 13. The lists are the ones sections 4
 * and 5 of /terms render (lib/community-rules.ts), so the two pages cannot
 * drift. A client island because i18n runs in the browser; the page around it
 * is prerendered.
 */
export default function RulesContent() {
  const { t } = useTranslation()
  const email = (
    <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>
      {SUPPORT_EMAIL}
    </a>
  )

  return (
    <div className="bd-page flex min-h-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-soft)' }} aria-label={t('breadcrumbs.label')}>
          <Link href="/" className="transition-colors hover:text-bd-ink">{t('breadcrumbs.home')}</Link>
          <span aria-hidden="true">/</span>
          <span style={headingStyle}>{t('rules.breadcrumb')}</span>
        </nav>

        <article className="bd-card p-6 sm:p-8 md:p-12">
          <h1
            className="mb-6 text-3xl font-extrabold leading-tight tracking-tight"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {t('rules.heading')}
          </h1>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            <p className="text-base" style={headingStyle} data-testid="rules-intro">
              {t('rules.intro')}
            </p>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={headingStyle}>{t('rules.kindTitle')}</h2>
              <ul className="list-disc space-y-1.5 pl-5">
                {COMMUNITY_RULES_KIND.map((id) => (
                  <li key={id}>{t(`rules.kind.${id}`)}</li>
                ))}
              </ul>
            </section>

            <section data-testid="rules-banned">
              <h2 className="mb-3 text-base font-semibold" style={headingStyle}>{t('rules.bannedTitle')}</h2>
              <ul className="list-disc space-y-1.5 pl-5">
                {COMMUNITY_RULES_BANNED.map((id) => (
                  <li key={id}>{t(`rules.banned.${id}`)}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={headingStyle}>{t('rules.reportTitle')}</h2>
              <p>{t('rules.report')}</p>
              <p className="mt-3">
                {t('rules.reportEmail')} {email}
              </p>
            </section>

            <section data-testid="rules-actions">
              <h2 className="mb-3 text-base font-semibold" style={headingStyle}>{t('rules.actionsTitle')}</h2>
              <p className="mb-3">{t('rules.actionsLead')}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {MODERATION_ACTIONS.map((id) => (
                  <li key={id}>{t(`rules.actions.${id}`)}</li>
                ))}
              </ul>
              <p className="mt-3">{t('rules.police')}</p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={headingStyle}>{t('rules.appealTitle')}</h2>
              <p>
                {t('rules.appeal')} {email}
              </p>
            </section>

            <p className="pt-4" style={{ borderTop: '1px solid var(--bd-line)' }}>
              {t('rules.termsNote')}{' '}
              <Link href="/terms" style={linkStyle}>{t('rules.termsLink')}</Link>
            </p>
          </div>
        </article>
      </div>
      <Footer />
    </div>
  )
}
