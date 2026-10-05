'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { COMMUNITY_RULES_BANNED, MODERATION_ACTIONS } from '@/lib/community-rules'
import { useTranslation } from '@/lib/i18n-helpers'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import { INACTIVITY_RULE_STARTS, TERMS_FIGURES, TERMS_VERSION } from '@/lib/terms-version'
import PremiumTerms from './PremiumTerms'

/**
 * The Terms of Service (#1166), every section through t() in en, no, ru and uk.
 *
 * angrerettloven § 8 second paragraph wants the information given in Norwegian
 * when the marketing targets Norwegian consumers, and Forbrukertilsynet's
 * guidance on digital-service terms says the same of the terms themselves.
 * A client island because i18n runs in the browser, like PrivacyNotice; the
 * page around it is prerendered.
 *
 * Section 3 is PremiumTerms, the part a buyer agrees to at checkout. Sections 4
 * and 5 render the community rules from lib/community-rules.ts, the same lists
 * /rules shows. The figures come from lib/retention-periods.ts through
 * TERMS_FIGURES. Changing any of this text means bumping TERMS_VERSION; the
 * digest test in __tests__/lib/legal-text-versions.test.ts enforces it.
 */

export type TermsSeller = { name: string; address: string; email: string } | null

const strong = { color: 'var(--bd-ink)' } as const
const linkClass = 'underline'

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId}>
      <h2 className="mb-3 text-base font-semibold" style={strong}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function MailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className={linkClass}>
      {email}
    </a>
  )
}

export default function TermsContent({ seller }: { seller: TermsSeller }) {
  const { t, i18n } = useTranslation()

  // A hand-bumped constant, never the render date (#1166 acceptance: the date
  // changes only when the text does).
  const longDate = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(i18n.language || 'en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
  const updated = longDate(TERMS_VERSION)
  const inactiveFrom = longDate(INACTIVITY_RULE_STARTS)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
      <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-soft)' }} aria-label={t('breadcrumbs.label')}>
        <Link href="/" className="transition-colors hover:text-bd-ink">{t('breadcrumbs.home')}</Link>
        <span aria-hidden="true">/</span>
        <span style={strong}>{t('terms.title')}</span>
      </nav>

      <div className="bd-card p-6 sm:p-8 md:p-12">
        <h1
          className="mb-6 text-3xl font-extrabold leading-tight tracking-tight"
          style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
        >
          {t('terms.title')}
        </h1>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
          <p>{t('terms.intro')}</p>

          {/* The operator (#1163). Absent until NEXT_PUBLIC_SELLER_LEGAL_NAME and
              NEXT_PUBLIC_SELLER_ADDRESS are set, and then this section is not drawn. */}
          {seller && (
            <Section title={t('terms.seller.title')} testId="terms-seller">
              <p>
                {t('terms.seller.body', { name: seller.name, address: seller.address })}{' '}
                <MailLink email={seller.email} />
              </p>
              <p className="mt-3">{t('terms.seller.responsible', { name: seller.name })}</p>
            </Section>
          )}

          <Section title={t('terms.about.title')}>
            <p>{t('terms.about.scope')}</p>
            <p className="mt-3">{t('terms.about.accept')}</p>
            <p className="mt-3">{t('terms.about.languages')}</p>
            <p className="mt-3">{t('terms.about.version')}</p>
          </Section>

          <Section title={t('terms.accounts.title')} testId="terms-accounts">
            <p>{t('terms.accounts.guests', TERMS_FIGURES)}</p>
            <p className="mt-3">{t('terms.accounts.age')}</p>
            <p className="mt-3">{t('terms.accounts.under13')}</p>
            <p className="mt-3">{t('terms.accounts.premiumAge')}</p>
            <p className="mb-3 mt-3">{t('terms.accounts.dutiesLead')}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{t('terms.accounts.duties.accurate')}</li>
              <li>{t('terms.accounts.duties.password')}</li>
              <li>{t('terms.accounts.duties.tell')}</li>
              <li>{t('terms.accounts.duties.own')}</li>
            </ul>
            <p className="mt-3">{t('terms.accounts.responsible')}</p>
            <p className="mt-3">{t('terms.accounts.unverified', TERMS_FIGURES)}</p>
            <p className="mt-3">{t('terms.accounts.inactive', { ...TERMS_FIGURES, inactiveFrom })}</p>
          </Section>

          {/* Section 3, the part a Premium buyer agrees to at checkout (#1179). */}
          <PremiumTerms />

          <Section title={t('terms.conduct.title')} testId="terms-conduct">
            <p className="mb-3">{t('terms.conduct.lead')}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {COMMUNITY_RULES_BANNED.map((id) => (
                <li key={id}>{t(`rules.banned.${id}`)}</li>
              ))}
            </ul>
            <p className="mt-3">
              {t('terms.conduct.rulesPage')}{' '}
              <Link href="/rules" className={linkClass}>{t('terms.conduct.rulesLink')}</Link>
            </p>
            <p className="mt-3">{t('terms.conduct.responsibility')}</p>
          </Section>

          <Section title={t('terms.moderation.title')} testId="terms-moderation">
            <p>{t('terms.moderation.report')}</p>
            {/* The one address for content notices (#1172). */}
            <p className="mt-3">
              {t('terms.moderation.noticeLead')} <MailLink email={SUPPORT_EMAIL} />.{' '}
              {t('terms.moderation.noticeDetails')}
            </p>
            <p className="mb-3 mt-3">{t('terms.moderation.actionsLead')}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {MODERATION_ACTIONS.map((id) => (
                <li key={id}>{t(`rules.actions.${id}`)}</li>
              ))}
            </ul>
            <p className="mt-3">{t('terms.moderation.reasons')}</p>
            <p className="mt-3">{t('terms.moderation.appeal')}</p>
          </Section>

          <Section title={t('terms.content.title')}>
            <p>{t('terms.content.body', TERMS_FIGURES)}</p>
          </Section>

          <Section title={t('terms.ip.title')}>
            <p>{t('terms.ip.body')}</p>
          </Section>

          <Section title={t('terms.service.title')}>
            <p>{t('terms.service.free')}</p>
            <p className="mt-3">{t('terms.service.premium')}</p>
            <p className="mt-3">{t('terms.service.closing')}</p>
          </Section>

          <Section title={t('terms.liability.title')} testId="terms-liability">
            <p>{t('terms.liability.premium')}</p>
            <p className="mt-3">{t('terms.liability.damages')}</p>
            <p className="mt-3">{t('terms.liability.mandatory')}</p>
          </Section>

          <Section title={t('terms.termination.title')} testId="terms-termination">
            <p>{t('terms.termination.yours')}</p>
            {/* digitalytelsesloven § 33 fourth paragraph: the running-subscription notice (#1165). */}
            <p className="mt-3">{t('terms.termination.reminder')}</p>
            <p className="mb-3 mt-3">{t('terms.termination.oursLead')}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{t('terms.termination.reasons.breach')}</li>
              <li>{t('terms.termination.reasons.law')}</li>
              <li>{t('terms.termination.reasons.age')}</li>
              <li>{t('terms.termination.reasons.security')}</li>
            </ul>
            <p className="mt-3">{t('terms.termination.warning')}</p>
            <p className="mt-3">{t('terms.termination.premium')}</p>
          </Section>

          <Section title={t('terms.changes.title')} testId="terms-changes">
            <p>{t('terms.changes.reasons')}</p>
            <p className="mt-3">{t('terms.changes.notice')}</p>
            <p className="mt-3">{t('terms.changes.exit')}</p>
          </Section>

          <Section title={t('terms.law.title')} testId="terms-law">
            <p>{t('terms.law.law')}</p>
            <p className="mt-3">{t('terms.law.contactFirst')}</p>
            <p className="mt-3">
              {t('terms.law.complaints')}{' '}
              <a href="https://www.forbrukertilsynet.no" className={linkClass} target="_blank" rel="noopener noreferrer">
                {/* i18n-allow: a domain name, the same in every language */}
                forbrukertilsynet.no
              </a>
              .
            </p>
            <p className="mt-3">{t('terms.law.courts')}</p>
          </Section>

          <Section title={t('terms.contact.title')}>
            <p>
              {t('terms.contact.body')} <MailLink email={SUPPORT_EMAIL} />.
            </p>
          </Section>

          <div className="pt-4 text-xs" style={{ color: 'var(--bd-ink-soft)', borderTop: '1px solid var(--bd-line)' }}>
            <p>{t('terms.updated', { date: updated })}</p>
            <p className="mt-1" data-testid="terms-change-note">{t('terms.changeNote', { inactiveFrom })}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
