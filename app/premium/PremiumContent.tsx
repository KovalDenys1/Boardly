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
  const [failed, setFailed] = useState(false)

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
      trackPremiumCta(source, selectedPlan)
      setFailed(false)
      setLoading(true)
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: selectedPlan }),
        })
        const data: { url?: string } = await res.json()
        if (data.url) {
          window.location.href = data.url
          return
        }
        setFailed(true)
      } catch {
        setFailed(true)
      } finally {
        setLoading(false)
      }
    },
    [selectedPlan]
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
    return (
      <button
        type="button"
        onClick={() => void startCheckout(source)}
        disabled={loading || status === 'loading'}
        className={`${CTA_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Icon name="crown" size={18} />
        {loading ? t('premium.ctaLoading') : t('premium.cta')}
      </button>
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

            <div className="mt-6 flex flex-wrap items-center gap-4">
              {cta(HERO_CTA)}
              <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                {t('premium.ctaNote')}
              </span>
            </div>
            {failed && (
              <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--bd-coral-deep)' }} role="alert">
                {t('premium.ctaError')}
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
            <div className="mt-5">{cta(CLOSING_CTA)}</div>
          </section>
        </article>
      </div>
      <Footer />
    </div>
  )
}
