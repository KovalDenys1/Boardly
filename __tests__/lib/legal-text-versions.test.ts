import { createHash } from 'node:crypto'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'
import { TERMS_FIGURES, TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'

/**
 * TERMS_VERSION and WITHDRAWAL_INFO_VERSION are bumped by hand, and the
 * checkout refuses a consent recorded against any other version (#1162). That
 * only protects a buyer if the constant actually moves when the text does. On
 * 2026-09-24 the text changed twice in one day under the same version (#1179),
 * so a tab opened in the morning could still consent to the old "no VAT is
 * added" wording. This test ties each version to a digest of the text it
 * stands for, in all four locales: a buyer agrees in the language the site is
 * shown in, and a Norwegian consumer is owed the information in Norwegian
 * (angrerettloven § 8 second paragraph), so a Norwegian-only edit is a change
 * of terms too.
 *
 * When it fails, you changed text a buyer agrees to:
 *   1. set the constant in lib/terms-version.ts to the day the change ships;
 *   2. add a new line to the map below for that version with the digest the
 *      failure prints.
 * Never edit the digest of a version that has already shipped: that is the
 * change this test exists to stop. Only an unreleased version's digest may be
 * rewritten, while its text is still being worked on.
 */

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

const LOCALES = { en, no, ru, uk }
type Locale = typeof en

/** The same slice of every locale, keyed by locale code. */
function everyLocale<T>(pick: (locale: Locale) => T): Record<keyof typeof LOCALES, T> {
  return {
    en: pick(LOCALES.en),
    no: pick(LOCALES.no as unknown as Locale),
    ru: pick(LOCALES.ru as unknown as Locale),
    uk: pick(LOCALES.uk as unknown as Locale),
  }
}

/**
 * Everything /terms says, the tax note under the price on /premium, and the
 * community rules, which the Terms render in sections 4 and 5 and which /rules
 * repeats (#1166, #1173). The figures the Terms interpolate are text too: a
 * changed retention period changes what the Terms promise. Only the rules
 * page's breadcrumb is left out, being page chrome.
 *
 * Before 2026-09-27 this covered section 3 and the tax note only, in English
 * only, while the rest of /terms was hardcoded English; the 2026-09-25 digest
 * below is that one.
 */
function termsText() {
  return {
    locales: everyLocale((locale) => ({
      terms: locale.terms,
      rules: Object.fromEntries(Object.entries(locale.rules).filter(([key]) => key !== 'breadcrumb')),
      priceNoteTax: locale.premium.priceNoteTax,
    })),
    figures: TERMS_FIGURES,
  }
}

/**
 * /withdrawal, minus the page chrome that says nothing about the right, and
 * the withdrawal block and consent box on /premium.
 */
const WITHDRAWAL_CHROME = new Set(['breadcrumb', 'copyButton', 'copied', 'copyFailed', 'emailButton', 'backToPremium'])

function withdrawalText() {
  return everyLocale((locale) => ({
    withdrawal: Object.fromEntries(Object.entries(locale.withdrawal).filter(([key]) => !WITHDRAWAL_CHROME.has(key))),
    premium: {
      withdrawalTitle: locale.premium.withdrawalTitle,
      withdrawalBody: locale.premium.withdrawalBody,
      withdrawalHow: locale.premium.withdrawalHow,
      withdrawalStartNow: locale.premium.withdrawalStartNow,
      consentLabel: locale.premium.consentLabel,
    },
  }))
}

// Versions before 2026-09-25 predate this test; their text is in git history.
const TERMS_DIGESTS: Record<string, string> = {
  // Tax-inclusive price copy (needs the Stripe "Include tax in prices:
  // Inclusive" setting). Without that commit this version's digest was
  // 4440445ca75004c5, the tax-added-at-checkout wording.
  '2026-09-25': '680e4906ad82f7c3',
  // The whole of /terms translated and rewritten (#1166), the community rules and
  // moderation (#1173), the content-notice address (#1172). The first digest over
  // all four locales.
  '2026-09-27': '0653967b2bfde28a',
}

const WITHDRAWAL_DIGESTS: Record<string, string> = {
  '2026-09-25': '25e83182503ef98f',
  // The consent box gains the age and capacity rule of Terms section 3 (#1169).
  // Shipped in v1.46.0 with an English-only digest, 7787163e81ddc1a4. Recomputed
  // over all four locales when the coverage widened (#1166 review): origin/main's
  // four locale files give the same value, so no withdrawal or consent text has
  // changed in any locale since it shipped.
  '2026-09-27': '3a405553ea3088b9',
}

describe('legal text versions move with the text (#1179)', () => {
  it('TERMS_VERSION matches /terms, the community rules and premium.priceNoteTax', () => {
    expect({ version: TERMS_VERSION, digest: digest(termsText()) }).toEqual({
      version: TERMS_VERSION,
      digest: TERMS_DIGESTS[TERMS_VERSION],
    })
  })

  it('WITHDRAWAL_INFO_VERSION matches /withdrawal and the withdrawal block on /premium', () => {
    expect({ version: WITHDRAWAL_INFO_VERSION, digest: digest(withdrawalText()) }).toEqual({
      version: WITHDRAWAL_INFO_VERSION,
      digest: WITHDRAWAL_DIGESTS[WITHDRAWAL_INFO_VERSION],
    })
  })

  it('gives every version its own digest, so a text change cannot hide under an old version', () => {
    for (const digests of [TERMS_DIGESTS, WITHDRAWAL_DIGESTS]) {
      const values = Object.values(digests)
      expect(new Set(values).size).toBe(values.length)
    }
  })
})
