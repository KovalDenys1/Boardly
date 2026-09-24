import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'

/**
 * The standard withdrawal form for Boardly Premium (#1162, angrerettloven § 8
 * first paragraph h, which requires the trader to hand over the standard
 * angreskjema). The wording follows the Norwegian state form Q-0319B, the
 * bokmål implementation of Annex I(B) to Directive 2011/83/EU; the localized
 * labels live under `withdrawal.form*` in the locale files and reach here as
 * an already translated `WithdrawalFormStrings`.
 *
 * Kept as plain functions with no React so the copied email text and the
 * mailto link can be unit-tested against the real bundles.
 */

/** What the consumer fills in. Underscores rather than a table cell so the text survives a paste into any mail client. */
export const WITHDRAWAL_BLANK = '____________'

/**
 * The seller line of the form. The postal address is rendered by the seller
 * identity component (step 4c of #1162), so this is the plain name and email
 * line only.
 */
export const WITHDRAWAL_RECIPIENT = `Boardly, ${SUPPORT_EMAIL}`

export type WithdrawalFormStrings = {
  toLabel: string
  statement: string
  ordered: string
  name: string
  address: string
  date: string
  signature: string
}

export type WithdrawalFormField = { key: keyof WithdrawalFormStrings; label: string }

/** The fields the consumer fills in, in the order the standard form lists them. */
export function withdrawalFormFields(strings: WithdrawalFormStrings): WithdrawalFormField[] {
  return [
    { key: 'ordered', label: strings.ordered },
    { key: 'name', label: strings.name },
    { key: 'address', label: strings.address },
    { key: 'date', label: strings.date },
    { key: 'signature', label: strings.signature },
  ]
}

/** The plain-text version the "Copy email text" button puts on the clipboard. */
export function buildWithdrawalEmailText(strings: WithdrawalFormStrings): string {
  const fields = withdrawalFormFields(strings).map(
    (field) => `${field.label}: ${WITHDRAWAL_BLANK}`
  )
  return [`${strings.toLabel}: ${WITHDRAWAL_RECIPIENT}`, '', strings.statement, '', ...fields].join('\n')
}

/** A mailto link with the subject and the form text prefilled. */
export function buildWithdrawalMailto(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
