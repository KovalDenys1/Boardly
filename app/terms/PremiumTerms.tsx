'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import { LINK_SUPPORT_URL, LINK_TERMS_URL } from '@/lib/sold-through-link'

/**
 * Section 3 of /terms: the Premium subscription, its sale through Link
 * (Stripe Managed Payments, #1179) and the right of withdrawal.
 *
 * A client island because i18n runs in the browser, like PrivacyNotice; the
 * rest of /terms is still English-only server markup. This section is the one
 * a Premium buyer agrees to at checkout, so it is the one that has to reach a
 * Norwegian buyer in Norwegian. Changing it means bumping TERMS_VERSION.
 */
export default function PremiumTerms() {
  const { t } = useTranslation()

  return (
    <section data-testid="terms-premium">
      <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>
        {t('terms.premium.title')}
      </h2>
      <p>{t('terms.premium.price')}</p>
      <p className="mt-3">
        {t('terms.premium.seller')}{' '}
        <a href={LINK_TERMS_URL} className="underline" target="_blank" rel="noopener noreferrer">
          {t('terms.premium.linkTermsLabel')}
        </a>
      </p>
      <p className="mt-3">{t('terms.premium.renewal')}</p>
      <p className="mt-3">{t('terms.premium.withdrawal')}</p>
      <p className="mt-3">
        {t('terms.premium.withdrawalHow')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>
        {' · '}
        <Link href="/withdrawal" className="underline">{t('premium.withdrawalFormLink')}</Link>
      </p>
      <p className="mt-3">
        {t('terms.premium.linkChannel')}{' '}
        <a href={LINK_SUPPORT_URL} className="underline" target="_blank" rel="noopener noreferrer">
          {t('withdrawal.linkSupportLabel')}
        </a>
      </p>
      <p className="mt-3">{t('terms.premium.confirmation')}</p>
      <p className="mt-3">{t('terms.premium.minors')}</p>
    </section>
  )
}
