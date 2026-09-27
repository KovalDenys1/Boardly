import { createHash } from 'node:crypto'
import en from '@/locales/en'
import { TERMS_FIGURES, TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'

/**
 * TERMS_VERSION and WITHDRAWAL_INFO_VERSION are bumped by hand, and the
 * checkout refuses a consent recorded against any other version (#1162). That
 * only protects a buyer if the constant actually moves when the text does. On
 * 2026-09-24 the text changed twice in one day under the same version (#1179),
 * so a tab opened in the morning could still consent to the old "no VAT is
 * added" wording. This test ties each version to a digest of the English text
 * it stands for.
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

/**
 * Everything /terms says, the tax note under the price on /premium, and the
 * community rules, which the Terms render in sections 4 and 5 and which /rules
 * repeats (#1166, #1173). The figures the Terms interpolate are text too: a
 * changed retention period changes what the Terms promise. Only the rules
 * page's breadcrumb is left out, being page chrome.
 *
 * Before 2026-09-27 this covered section 3 and the tax note only, while the
 * rest of /terms was hardcoded English; the 2026-09-25 digest below is that one.
 */
function termsText() {
  const rules = Object.fromEntries(Object.entries(en.rules).filter(([key]) => key !== 'breadcrumb'))
  return {
    terms: en.terms,
    rules,
    figures: TERMS_FIGURES,
    priceNoteTax: en.premium.priceNoteTax,
  }
}

/**
 * /withdrawal, minus the page chrome that says nothing about the right, and
 * the withdrawal block and consent box on /premium.
 */
const WITHDRAWAL_CHROME = new Set(['breadcrumb', 'copyButton', 'copied', 'copyFailed', 'emailButton', 'backToPremium'])

function withdrawalText() {
  const page = Object.fromEntries(Object.entries(en.withdrawal).filter(([key]) => !WITHDRAWAL_CHROME.has(key)))
  return {
    withdrawal: page,
    premium: {
      withdrawalTitle: en.premium.withdrawalTitle,
      withdrawalBody: en.premium.withdrawalBody,
      withdrawalHow: en.premium.withdrawalHow,
      withdrawalStartNow: en.premium.withdrawalStartNow,
      consentLabel: en.premium.consentLabel,
    },
  }
}

// Versions before 2026-09-25 predate this test; their text is in git history.
const TERMS_DIGESTS: Record<string, string> = {
  // Tax-inclusive price copy (needs the Stripe "Include tax in prices:
  // Inclusive" setting). Without that commit this version's digest was
  // 4440445ca75004c5, the tax-added-at-checkout wording.
  '2026-09-25': '680e4906ad82f7c3',
  // The whole of /terms translated and rewritten (#1166), the community rules and
  // moderation (#1173), the content-notice address (#1172).
  '2026-09-27': '916b5ebe941a7fd5',
}

const WITHDRAWAL_DIGESTS: Record<string, string> = {
  '2026-09-25': '25e83182503ef98f',
  // The consent box gains the age and capacity rule of Terms section 3 (#1169).
  '2026-09-27': '7787163e81ddc1a4',
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
