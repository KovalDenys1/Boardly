'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useSession } from 'next-auth/react'
import Footer from '@/components/Footer'
import { Icon, type IconName } from '@/components/icons'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { trackPremiumCta } from '@/lib/analytics'
import { buildAuthUrl } from '@/lib/auth-redirect'
import { PREMIUM_BASE_PRICE } from '@/lib/stripe'
import {
  yearlyPerMonthLabel,
  yearlySavingsPercent,
  type PremiumPlan,
  type PremiumPricing,
} from '@/lib/premium-plans'
import { TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'
import { CONSENT_REQUIRED_CODE } from '@/lib/validation/stripe-checkout'

/**
 * The two CTAs this page fires, named so the funnel can tell the button beside
 * the price from the one at the end of the page.
 */
const HERO_CTA = 'premium_page_hero'
const CLOSING_CTA = 'premium_page_closing'

const PREMIUM_FEATURES: { key: string; icon: IconName }[] = [
  { key: 'upload', icon: 'camera' },
  { key: 'badge', icon: 'crown' },
  { key: 'cardStyle', icon: 'palette' },
  { key: 'accent', icon: 'drop' },
  { key: 'featuredGame', icon: 'trophy' },
  { key: 'themes', icon: 'sparkle' },
  { key: 'spectators', icon: 'eye' },
]

const FREE_FEATURES: { key: string; icon: IconName }[] = [
  { key: 'games', icon: 'gamepad' },
  { key: 'avatars', icon: 'mask' },
  { key: 'bio', icon: 'pencil' },
  { key: 'profile', icon: 'link' },
]

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const

/**
 * `.bd-btn` is `white-space: nowrap`, and the longest label ("Sign in to get
 * Premium") is wider than a 320 px card, so the button takes the full width and
 * wraps there instead of pushing the page sideways.
 */
const CTA_CLASS =
  'bd-btn bd-btn-primary bd-btn-lg w-full justify-center whitespace-normal text-center sm:w-auto'

export default function PremiumContent({ pricing }: { pricing: PremiumPricing }) {
  const { t } = useTranslation()
  const { data: session, status } = useSession()

  // The yearly plan exists only when Stripe answered for it, so it also decides
  // whether there is anything to toggle between.
  const yearly = pricing.yearly
  const [plan, setPlan] = useState<PremiumPlan>(yearly ? 'yearly' : 'monthly')
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<'none' | 'consent' | 'checkout'>('none')
  // The express request angrerettloven § 19 asks for before a digital service
  // starts inside the withdrawal period (#1162). Unticked on every visit: it is
  // a decision about this purchase, not a preference to remember.
  const [consented, setConsented] = useState(false)

  const selectedPlan: PremiumPlan = yearly ? plan : 'monthly'
  const savings = yearlySavingsPercent(pricing)

  // Stripe is the price of record. `PREMIUM_BASE_PRICE` is the only written-down
  // amount in the codebase and stands in for the monthly plan if Stripe could
  // not be reached; the yearly plan has no such constant, which is exactly why
  // it is hidden rather than guessed.
  const monthlyLabel = pricing.monthly?.label ?? PREMIUM_BASE_PRICE
  const amount = selectedPlan === 'yearly' && yearly ? yearly.label : monthlyLabel
  const period = selectedPlan === 'yearly' ? t('premium.perYear') : t('premium.perMonth')
  const billingNote =
    selectedPlan === 'yearly' && yearly
      ? t('premium.billedYearly', { perMonth: yearlyPerMonthLabel(yearly) })
      : t('premium.billedMonthly')

  const startCheckout = useCallback(
    async (source: string) => {
      // The buttons are disabled until the box is ticked; this covers any path
      // that reaches here without it, and the route refuses independently.
      if (!consented) {
        setFailure('consent')
        return
      }
      trackPremiumCta(source, selectedPlan)
      setFailure('none')
      setLoading(true)
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: selectedPlan,
            // Which text was on screen when the box was ticked, and when. The
            // route checks the versions against its own and the time against
            // its clock, then writes all three onto the Stripe session.
            consent: {
              termsVersion: TERMS_VERSION,
              withdrawalInfoVersion: WITHDRAWAL_INFO_VERSION,
              acceptedAt: new Date().toISOString(),
            },
          }),
        })
        const data: { url?: string; code?: string } = await res.json()
        if (data.url) {
          window.location.href = data.url
          return
        }
        setFailure(data.code === CONSENT_REQUIRED_CODE ? 'consent' : 'checkout')
      } catch {
        setFailure('checkout')
      } finally {
        setLoading(false)
      }
    },
    [consented, selectedPlan]
  )

  const signedOut = status === 'unauthenticated' || !session?.user

  function cta(source: string) {
    if (signedOut) {
      return (
        <Link
          href={buildAuthUrl('login', '/premium')}
          onClick={() => trackPremiumCta(source, selectedPlan)}
          className={CTA_CLASS}
        >
          <Icon name="crown" size={18} />
          {t('premium.ctaSignedOut')}
        </Link>
      )
    }
    const blocked = loading || status === 'loading' || !consented
    return (
      <button
        type="button"
        onClick={() => void startCheckout(source)}
        disabled={blocked}
        aria-disabled={blocked}
        className={`${CTA_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Icon name="crown" size={18} />
        {loading ? t('premium.ctaLoading') : t('premium.cta')}
      </button>
    )
  }

  /**
   * The consent box, rendered beside each checkout button so the closing CTA at
   * the foot of the page is never a disabled button whose reason is two screens
   * up. Both boxes drive the one `consented` state: ticking either enables both
   * buttons. A native checkbox with a real label: the label is the accessible
   * name and the whole sentence is the tap target.
   */
  function consentBox(id: string) {
    if (signedOut) return null
    return (
      <div className="mt-4 flex max-w-xl items-start gap-3">
        <input
          type="checkbox"
          id={id}
          checked={consented}
          onChange={(event) => {
            setConsented(event.target.checked)
            if (event.target.checked && failure === 'consent') setFailure('none')
          }}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bd-coral"
          style={{ accentColor: 'var(--bd-coral)' }}
        />
        <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed" style={{ color: 'var(--bd-ink)' }}>
          {t('premium.consentLabel')}
        </label>
      </div>
    )
  }

  return (
    <div className="bd-page flex min-h-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <nav
          className="mb-6 flex items-center gap-2 text-sm"
          style={{ color: 'var(--bd-ink-muted)' }}
          aria-label={t('breadcrumbs.label')}
        >
          <Link href="/" className="transition-colors hover:text-bd-ink">
            {t('breadcrumbs.home')}
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--bd-ink)' }}>{t('premium.breadcrumb')}</span>
        </nav>

        <article className="bd-card p-6 sm:p-8 md:p-12">
          <h1
            className="text-3xl font-extrabold leading-tight tracking-tight"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {t('premium.title')}
          </h1>
          <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            {t('premium.lead')}
          </p>

          {/* Plan picker and the first CTA */}
          <section className="mt-8">
            {yearly && (
              <div
                role="radiogroup"
                aria-label={t('premium.planLegend')}
                className="inline-flex rounded-2xl p-1"
                style={{ background: 'var(--bd-bg2)', border: '1px solid var(--bd-line)' }}
              >
                {(['monthly', 'yearly'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={plan === option}
                    onClick={() => setPlan(option)}
                    className="rounded-xl px-4 py-2 text-sm font-bold transition-colors"
                    style={
                      plan === option
                        ? { background: 'var(--bd-ink)', color: 'var(--bd-bg)' }
                        : { color: 'var(--bd-ink-muted)' }
                    }
                  >
                    {option === 'yearly' ? t('premium.planYearly') : t('premium.planMonthly')}
                    {option === 'yearly' && savings !== null && (
                      <span className="bd-chip bd-chip-mint ml-2">{t('premium.save', { percent: savings })}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-5 flex flex-wrap items-baseline gap-2">
              <span
                className="text-4xl font-extrabold"
                style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
                data-testid="premium-amount"
              >
                {amount}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--bd-ink-muted)' }}>
                {period}
              </span>
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
              {billingNote}
            </p>
            <p className="mt-2 max-w-xl text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>
              {yearly ? t('premium.currencyNote') : `${t('premium.monthlyOnlyNote')} ${t('premium.currencyNote')}`}
            </p>
            <p className="mt-1 max-w-xl text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>
              {t('premium.priceNoteTax')} {t('premium.priceNoteConversion')}
            </p>
            {selectedPlan === 'yearly' && (
              <p className="mt-1 max-w-xl text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>
                {t('premium.yearlyRefundNote')}
              </p>
            )}

            {/* The pre-contract withdrawal information (angrerettloven § 8),
                given above the button that starts the purchase. Prose on the
                card behind a hairline, not a card of its own: at 320 px a nested
                card would leave each line a few words wide. */}
            <div
              className="mt-5 max-w-xl pt-4"
              style={{ borderTop: '1px solid var(--bd-line)' }}
              data-testid="premium-withdrawal"
            >
              <h2 className="text-sm font-bold" style={{ color: 'var(--bd-ink)' }}>
                {t('premium.withdrawalTitle')}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
                {t('premium.withdrawalBody')}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
                {t('premium.withdrawalStartNow')}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
                {t('premium.withdrawalHow')}{' '}
                <Link
                  href="/withdrawal"
                  style={{ color: 'var(--bd-coral-deep)', textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  {t('premium.withdrawalFormLink')}
                </Link>
              </p>
            </div>

            {consentBox('premium-consent-hero')}

            <div className="mt-6 flex flex-wrap items-center gap-4">
              {cta(HERO_CTA)}
              <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                {t('premium.ctaNote')}
              </span>
            </div>
            {failure !== 'none' && (
              <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--bd-coral-deep)' }} role="alert">
                {failure === 'consent' ? t('premium.consentRequired') : t('premium.ctaError')}
              </p>
            )}
            {!signedOut && (
              <p className="mt-3 text-xs">
                <Link
                  href="/profile"
                  style={{ color: 'var(--bd-coral-deep)', textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  {t('premium.ctaManage')}
                </Link>
              </p>
            )}
          </section>

          {/* What Premium unlocks */}
          <section className="mt-12">
            <h2 className="text-lg font-bold" style={{ color: 'var(--bd-ink)' }}>
              {t('premium.includedTitle')}
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PREMIUM_FEATURES.map(({ key, icon }, index) => (
                <li
                  key={key}
                  // An odd count would leave the two-column grid with a hole in
                  // its last row, so the odd one out takes the whole row.
                  className={`flex items-start gap-3 rounded-2xl p-4${
                    index === PREMIUM_FEATURES.length - 1 && PREMIUM_FEATURES.length % 2 === 1
                      ? ' sm:col-span-2'
                      : ''
                  }`}
                  style={{ background: 'var(--bd-bg2)', border: '1px solid var(--bd-line)' }}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: 'var(--bd-sun-deep)' }}>
                    <Icon name={icon} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: 'var(--bd-ink)' }}>
                      {t(`premium.features.${key}.label` as TranslationKeys)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>
                      {t(`premium.features.${key}.desc` as TranslationKeys)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Free forever */}
          <section className="mt-10">
            <h2 className="text-lg font-bold" style={{ color: 'var(--bd-ink)' }}>
              {t('premium.freeTitle')}
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FREE_FEATURES.map(({ key, icon }) => (
                <li key={key} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0" style={{ color: 'var(--bd-mint-deep)' }}>
                    <Icon name={icon} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: 'var(--bd-ink)' }}>
                      {t(`premium.free.${key}.label` as TranslationKeys)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>
                      {t(`premium.free.${key}.desc` as TranslationKeys)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* FAQ */}
          <section className="mt-10">
            <h2 className="text-lg font-bold" style={{ color: 'var(--bd-ink)' }}>
              {t('premium.faqTitle')}
            </h2>
            <dl className="mt-4 space-y-5">
              {FAQ_KEYS.map((key) => (
                <div key={key}>
                  <dt className="text-sm font-bold" style={{ color: 'var(--bd-ink)' }}>
                    {t(`premium.faq.${key}.question` as TranslationKeys)}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
                    {t(`premium.faq.${key}.answer` as TranslationKeys)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Closing CTA */}
          <section
            className="mt-10 rounded-2xl p-6 sm:p-8"
            style={{ background: 'var(--bd-bg2)', border: '1px solid var(--bd-line)' }}
          >
            <h2 className="text-lg font-bold" style={{ color: 'var(--bd-ink)' }}>
              {t('premium.closingTitle')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
              {t('premium.closingBody')}
            </p>
            {consentBox('premium-consent-closing')}
            <div className="mt-5">{cta(CLOSING_CTA)}</div>
          </section>
        </article>
      </div>
      <Footer />
    </div>
  )
}
