import { createHash } from 'node:crypto'
import en from '@/locales/en'
import { TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'

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

/** /terms section 3 and the tax note under the price on /premium. */
function termsText() {
  return {
    terms: en.terms.premium,
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
  '2026-09-25': '4440445ca75004c5',
}

const WITHDRAWAL_DIGESTS: Record<string, string> = {
  '2026-09-25': '25e83182503ef98f',
}

describe('legal text versions move with the text (#1179)', () => {
  it('TERMS_VERSION matches /terms section 3 and premium.priceNoteTax', () => {
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
