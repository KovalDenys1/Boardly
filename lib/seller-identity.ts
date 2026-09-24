// Who operates Boardly, for the imprint (#1163).
//
// ehandelsloven section 8, angrerettloven section 8 d and GDPR Art. 13(1)(a)
// all require the operator's name, geographic address and email on the site:
// in the footer, in the Terms, in the privacy notice and in the emails. The
// values are a private individual's, so they are set in Vercel's Production
// environment and never committed. They are NEXT_PUBLIC_ because the footer
// is a client component and, once published, the values are public by law.
//
// Nothing renders while they are unset: every reader checks for `null` and
// draws no heading, no label and no half-filled line. The email is the one
// support address the whole site already names.

import { SUPPORT_EMAIL } from './organization-json-ld'

export type SellerIdentity = {
  legalName: string
  addressLines: string[]
  email: string
}

/**
 * One address, several lines. `|` is the separator that survives a
 * single-line env editor; a real newline works too for editors that keep it.
 * Every line is trimmed and empty lines are dropped, so a trailing separator
 * or a blank line in the dashboard does not become an empty line on the page.
 */
export function parseSellerAddress(raw: string | undefined | null): string[] {
  if (!raw) {
    return []
  }
  return raw
    .split(/\r?\n|\|/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * The operator, or `null` until both the name and at least one address line
 * are set. A name without an address (or the reverse) is treated as unset:
 * the law wants both, and half an imprint reads as a mistake.
 *
 * The two reads stay literal `process.env.NEXT_PUBLIC_*` accesses: that is
 * the form Next.js inlines into the client bundle, and the footer runs there.
 */
export function getSellerIdentity(): SellerIdentity | null {
  const legalName = (process.env.NEXT_PUBLIC_SELLER_LEGAL_NAME ?? '').trim()
  const addressLines = parseSellerAddress(process.env.NEXT_PUBLIC_SELLER_ADDRESS)

  if (!legalName || addressLines.length === 0) {
    return null
  }

  return { legalName, addressLines, email: SUPPORT_EMAIL }
}

/** The address on one line, the way the footer and the emails print it. */
export function formatSellerAddress(identity: SellerIdentity): string {
  return identity.addressLines.join(', ')
}
