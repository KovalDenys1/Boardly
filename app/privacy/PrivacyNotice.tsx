'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { reopenGoogleConsentMessage } from '@/lib/consent'
import { isProductionDeployment } from '@/lib/feature-flags'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import { CHAT_RETENTION_HOURS, RETENTION_DAYS, retentionMonths } from '@/lib/retention-periods'
import { PRIVACY_UPDATED } from '@/lib/terms-version'

/**
 * The privacy notice (#1126, GDPR Art. 13).
 *
 * A client island because i18n runs in the browser (i18next + language
 * detector, see i18n.ts); the page around it stays a prerendered server
 * component. Every retention figure comes from lib/retention-periods.ts, the
 * module the cleanup jobs read, so the notice cannot promise a period the code
 * does not keep. Every sentence describes the merged code as it runs with its
 * flags off (no ad units, no marketing email yet); change the copy in the same
 * commit as the behaviour, and bump PRIVACY_UPDATED.
 */

const PURPOSES = [
  'account',
  'guest',
  'games',
  'signIn',
  'email',
  'marketing',
  'push',
  'premium',
  'feedback',
  'security',
  'analytics',
] as const

/** Provider names are proper nouns and stay untranslated; the rest is copy. */
const RECIPIENTS = [
  { id: 'supabase', name: 'Supabase' },
  { id: 'vercel', name: 'Vercel' },
  { id: 'upstash', name: 'Upstash' },
  { id: 'resend', name: 'Resend' },
  // Premium is sold through Stripe Managed Payments (#1179): Stripe holds our
  // customer records, its affiliate Sold through Link, LLC is merchant of record.
  { id: 'stripe', name: 'Stripe / Link (Sold through Link, LLC)' },
  { id: 'sentry', name: 'Sentry' },
  { id: 'discord', name: 'Discord' },
  { id: 'google', name: 'Google' },
  { id: 'github', name: 'GitHub' },
] as const

const STORAGE_ITEMS = [
  'session',
  'guest',
  'preferences',
  'lastAccount',
  'google',
  'serviceWorker',
] as const

const RIGHTS_ITEMS = ['export', 'correct', 'delete', 'forget'] as const

export type PrivacyController = { name: string; address: string } | null

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <dt className="font-semibold" style={{ color: 'var(--bd-ink)' }}>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function PrivacyNotice({ controller }: { controller: PrivacyController }) {
  const { t, i18n } = useTranslation()
  const email = SUPPORT_EMAIL

  const retention = {
    unverifiedDays: RETENTION_DAYS.unverifiedAccounts,
    guestIdle: RETENTION_DAYS.guestIdle,
    guestPlayed: RETENTION_DAYS.guestPlayedIdle,
    gamesMonths: retentionMonths(RETENTION_DAYS.games),
    lobbiesMonths: retentionMonths(RETENTION_DAYS.lobbies),
    replayDays: RETENTION_DAYS.replays,
    chatHours: CHAT_RETENTION_HOURS,
    notificationsMonths: retentionMonths(RETENTION_DAYS.notifications),
    feedbackMonths: retentionMonths(RETENTION_DAYS.feedback),
    eventsDays: RETENTION_DAYS.operationalEvents,
    auditMonths: retentionMonths(RETENTION_DAYS.adminAuditLogs),
    participationsMonths: retentionMonths(RETENTION_DAYS.lobbyParticipations),
  }

  // A hand-bumped constant, never the render date (#1126 acceptance).
  const updated = new Date(`${PRIVACY_UPDATED}T00:00:00Z`).toLocaleDateString(i18n.language || 'en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  const strong = { color: 'var(--bd-ink)' }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
      <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label="Breadcrumb">
        <Link href="/" className="transition-colors hover:text-bd-ink">{t('privacyPolicy.breadcrumbHome')}</Link>
        <span aria-hidden="true">/</span>
        <span style={strong}>{t('privacyPolicy.title')}</span>
      </nav>

      <div className="bd-card p-6 sm:p-8 md:p-12">
        <h1
          className="mb-6 text-3xl font-extrabold leading-tight tracking-tight"
          style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
        >
          {t('privacyPolicy.title')}
        </h1>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
          <p>{t('privacyPolicy.intro')}</p>

          <Section title={t('privacyPolicy.controller.title')}>
            <p>
              {controller
                ? t('privacyPolicy.controller.body', { name: controller.name, address: controller.address })
                : t('privacyPolicy.controller.bodyNoIdentity')}
            </p>
            <p className="mt-3">{t('privacyPolicy.controller.contact', { email })}</p>
            <p className="mt-3">{t('privacyPolicy.controller.dpo')}</p>
          </Section>

          <Section title={t('privacyPolicy.purposes.title')}>
            <p>{t('privacyPolicy.purposes.lead')}</p>
            <div className="mt-4 space-y-4">
              {PURPOSES.map((id) => (
                <div key={id} className="rounded-xl p-4" style={{ border: '1px solid var(--bd-line)' }}>
                  <h3 className="font-semibold" style={strong}>{t(`privacyPolicy.purposes.${id}.title`)}</h3>
                  <dl>
                    <Labelled label={t('privacyPolicy.purposes.dataLabel')}>
                      {t(`privacyPolicy.purposes.${id}.data`)}
                    </Labelled>
                    <Labelled label={t('privacyPolicy.purposes.basisLabel')}>
                      {t(`privacyPolicy.purposes.${id}.basis`)}
                    </Labelled>
                    <Labelled label={t('privacyPolicy.purposes.retentionLabel')}>
                      {t(`privacyPolicy.purposes.${id}.retention`, retention)}
                    </Labelled>
                  </dl>
                  {id === 'account' && <p className="mt-2">{t('privacyPolicy.purposes.account.extra')}</p>}
                </div>
              ))}
            </div>
          </Section>

          <Section title={t('privacyPolicy.recipients.title')}>
            <p>{t('privacyPolicy.recipients.lead')}</p>
            <div className="mt-4 space-y-4">
              {RECIPIENTS.map(({ id, name }) => (
                <div key={id} className="rounded-xl p-4" style={{ border: '1px solid var(--bd-line)' }}>
                  <h3 className="font-semibold" style={strong}>{name}</h3>
                  <dl>
                    <Labelled label={t('privacyPolicy.recipients.purposeLabel')}>
                      {t(`privacyPolicy.recipients.${id}.purpose`)}
                    </Labelled>
                    <Labelled label={t('privacyPolicy.recipients.whereLabel')}>
                      {t(`privacyPolicy.recipients.${id}.where`)}
                    </Labelled>
                  </dl>
                </div>
              ))}
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--bd-line)' }}>
                <h3 className="font-semibold" style={strong}>{t('privacyPolicy.recipients.pushService.name')}</h3>
                <dl>
                  <Labelled label={t('privacyPolicy.recipients.purposeLabel')}>
                    {t('privacyPolicy.recipients.pushService.purpose')}
                  </Labelled>
                  <Labelled label={t('privacyPolicy.recipients.whereLabel')}>
                    {t('privacyPolicy.recipients.pushService.where')}
                  </Labelled>
                </dl>
              </div>
            </div>
            <p className="mt-4">{t('privacyPolicy.recipients.note')}</p>
          </Section>

          <Section title={t('privacyPolicy.discord.title')}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{t('privacyPolicy.discord.feed')}</li>
              <li>{t('privacyPolicy.discord.bot')}</li>
              <li>{t('privacyPolicy.discord.linkedRoles')}</li>
            </ul>
          </Section>

          <Section title={t('privacyPolicy.ads.title')}>
            <p>{t('privacyPolicy.ads.current')}</p>
            <p className="mt-3">{t('privacyPolicy.ads.future')}</p>
            <p className="mt-3">
              {t('privacyPolicy.ads.choices')}{' '}
              <a href="https://adssettings.google.com" className="underline" target="_blank" rel="noopener noreferrer">
                {t('privacyPolicy.ads.adsSettingsLink')}
              </a>
              .
            </p>
            {/* The same control as the footer's (#1153), because the footer is not on
                this page and consent must be as easy to withdraw as to give (GDPR
                Art. 7(3)). Same gate: the consent message only loads in production. */}
            {isProductionDeployment() && (
              <p className="mt-3">
                <button type="button" onClick={reopenGoogleConsentMessage} className="underline cursor-pointer">
                  {t('footer.privacySettings')}
                </button>
              </p>
            )}
          </Section>

          <Section title={t('privacyPolicy.storage.title')}>
            <p className="mb-3">{t('privacyPolicy.storage.lead')}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {STORAGE_ITEMS.map((id) => (
                <li key={id}>
                  {t(`privacyPolicy.storage.${id}`, { guestTokenDays: RETENTION_DAYS.guestIdentityToken })}
                </li>
              ))}
            </ul>
            <p className="mt-3">{t('privacyPolicy.storage.noTrackers')}</p>
          </Section>

          <Section title={t('privacyPolicy.rights.title')}>
            <p className="mb-3">{t('privacyPolicy.rights.lead')}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {RIGHTS_ITEMS.map((id) => (
                <li key={id}>{t(`privacyPolicy.rights.${id}`)}</li>
              ))}
              <li>{t('privacyPolicy.rights.email', { email })}</li>
            </ul>
            <p className="mt-3">{t('privacyPolicy.rights.required')}</p>
          </Section>

          <Section title={t('privacyPolicy.complaints.title')}>
            <p>{t('privacyPolicy.complaints.body', { email })}</p>
            <p className="mt-2">
              <a href="https://www.datatilsynet.no" className="underline" target="_blank" rel="noopener noreferrer">
                datatilsynet.no
              </a>
            </p>
          </Section>

          <Section title={t('privacyPolicy.security.title')}>
            <p>{t('privacyPolicy.security.body')}</p>
          </Section>

          <Section title={t('privacyPolicy.children.title')}>
            <p>{t('privacyPolicy.children.body', { email })}</p>
          </Section>

          <Section title={t('privacyPolicy.changes.title')}>
            <p>{t('privacyPolicy.changes.body')}</p>
          </Section>

          <p className="pt-4 text-xs" style={{ color: 'var(--bd-ink-muted)', borderTop: '1px solid var(--bd-line)' }}>
            {t('privacyPolicy.updated', { date: updated })}
          </p>
        </div>
      </div>
    </div>
  )
}
