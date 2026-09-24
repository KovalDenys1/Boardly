import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import {
  WITHDRAWAL_BLANK,
  WITHDRAWAL_RECIPIENT,
  buildWithdrawalEmailText,
  buildWithdrawalMailto,
  withdrawalFormFields,
  type WithdrawalFormStrings,
} from '@/lib/withdrawal-form'

const premiumKeys = [
  'withdrawalTitle',
  'withdrawalBody',
  'withdrawalHow',
  'withdrawalFormLink',
  'withdrawalStartNow',
  'consentLabel',
  'priceNoteTax',
  'priceNoteConversion',
  'yearlyRefundNote',
] as const

// Structural, because `typeof en` is literal-typed and the other three bundles
// are (correctly) not assignable to it.
type Bundle = {
  withdrawal: Record<keyof typeof en.withdrawal, string>
  premium: Record<(typeof premiumKeys)[number], string>
}

function stringsOf(locale: Bundle): WithdrawalFormStrings {
  return {
    toLabel: locale.withdrawal.formToLabel,
    statement: locale.withdrawal.formStatement,
    ordered: locale.withdrawal.formOrdered,
    name: locale.withdrawal.formName,
    address: locale.withdrawal.formAddress,
    date: locale.withdrawal.formDate,
    signature: locale.withdrawal.formSignature,
  }
}

const bundles: Record<string, Bundle> = { en, no, ru, uk }

describe('withdrawal form text (#1162)', () => {
  it.each(Object.keys(bundles))('carries every field of the standard form in %s', (name) => {
    const strings = stringsOf(bundles[name])
    const text = buildWithdrawalEmailText(strings)

    expect(text.startsWith(`${strings.toLabel}: ${WITHDRAWAL_RECIPIENT}`)).toBe(true)
    expect(text).toContain(strings.statement)
    for (const field of withdrawalFormFields(strings)) {
      expect(text).toContain(`${field.label}: ${WITHDRAWAL_BLANK}`)
    }
    // the five fields of Annex I(B): ordered on, name, address, date, signature
    expect(withdrawalFormFields(strings).map((field) => field.key)).toEqual([
      'ordered',
      'name',
      'address',
      'date',
      'signature',
    ])
  })

  it('addresses the notice to the support mailbox, never a person', () => {
    expect(WITHDRAWAL_RECIPIENT).toBe(`Boardly, ${SUPPORT_EMAIL}`)
    expect(WITHDRAWAL_RECIPIENT).not.toMatch(/denys/i)
  })

  it('builds a mailto link with the subject and the form text prefilled', () => {
    const text = buildWithdrawalEmailText(stringsOf(en))
    const href = buildWithdrawalMailto(en.withdrawal.emailSubject, text)
    const url = new URL(href)

    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe(SUPPORT_EMAIL)
    expect(url.searchParams.get('subject')).toBe(en.withdrawal.emailSubject)
    expect(url.searchParams.get('body')).toBe(text)
    // newlines and the "&" of the query survive the round trip
    expect(href).not.toContain('\n')
  })

  it('names the Norwegian form the wording follows, in Norwegian', () => {
    // Q-0319B: "Fyll ut og returner dette skjemaet dersom du ønsker å gå fra
    // avtalen", "Avtalen ble inngått den (dato)", "Forbrukerens ... underskrift
    // (dersom papirskjema benyttes)".
    expect(no.withdrawal.formHint).toBe('Fyll ut og returner dette skjemaet dersom du ønsker å gå fra avtalen.')
    expect(no.withdrawal.formOrdered).toBe('Avtalen ble inngått den (dato)')
    expect(no.withdrawal.formSignature).toContain('dersom papirskjema benyttes')
    expect(no.withdrawal.formSource).toContain('Q-0319B')
  })
})

describe('withdrawal copy in the locale bundles (#1162)', () => {
  it.each(Object.keys(bundles))('states the 14-day right and the full refund in %s', (name) => {
    const locale = bundles[name]
    for (const key of premiumKeys) {
      expect(typeof locale.premium[key]).toBe('string')
      expect(locale.premium[key].length).toBeGreaterThan(0)
    }
    expect(locale.premium.withdrawalBody).toContain('14')
    expect(locale.premium.withdrawalStartNow).toContain('14')
    expect(locale.premium.consentLabel).toContain('14')
    expect(locale.withdrawal.intro).toContain('14')
    expect(locale.withdrawal.refund).toContain('14')
    expect(locale.premium.withdrawalHow).toContain(SUPPORT_EMAIL)
  })

  it('uses no em dash anywhere in the new copy', () => {
    for (const locale of Object.values(bundles)) {
      const text = JSON.stringify(locale.withdrawal) + premiumKeys.map((key) => locale.premium[key]).join(' ')
      expect(text).not.toContain('—')
    }
  })

  it('translates the withdrawal page rather than echoing English', () => {
    for (const name of ['no', 'ru', 'uk'] as const) {
      const other = bundles[name].withdrawal as Record<string, string>
      const english = en.withdrawal as Record<string, string>
      for (const key of Object.keys(english)) {
        expect({ locale: name, key, same: other[key] === english[key] }).toEqual({ locale: name, key, same: false })
      }
    }
  })
})
