/**
 * The 13-or-older confirmation (#1135).
 *
 * Accounts rest on contract (GDPR Art. 6(1)(b)), so the consent age of Art. 8 and
 * personopplysningsloven § 5 does not apply, and the person confirms being 13 or older.
 * An email sign-up does it on the register form and the route stores `ageConfirmedAt`.
 * An account created through Google, GitHub or Discord never sees that form, so it
 * confirms in the onboarding modal on its first visit, and the modal keeps coming back
 * until it has.
 *
 * Only accounts created from AGE_CONFIRMATION_SINCE are asked. Nothing was recorded
 * before, and the decision covered new accounts; whether to ask the older ones too is
 * a separate call. Guests are never asked.
 */
export const AGE_CONFIRMATION_SINCE = new Date('2026-09-27T00:00:00.000Z')

export function needsAgeConfirmation(user: {
  ageConfirmedAt: Date | null
  createdAt: Date
  isGuest: boolean
}): boolean {
  return !user.isGuest && user.ageConfirmedAt === null && user.createdAt >= AGE_CONFIRMATION_SINCE
}
