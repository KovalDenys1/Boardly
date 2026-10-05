import type { emailTemplates } from '../lib/email'

type Samples = { [Name in keyof typeof emailTemplates]: Parameters<(typeof emailTemplates)[Name]> }

const TOKEN = 'sample'.padEnd(64, '0')

/** One realistic set of arguments per mail, for the preview and for the layout tests. */
export const emailSamples: Samples = {
  sendVerificationEmail: [TOKEN, 'Ola'],
  sendUnverifiedAccountWarningEmail: [TOKEN, 'Ola', 3],
  sendPasswordResetEmail: [TOKEN],
  sendSecurityPasswordResetEmail: ['Ola'],
  sendEmailChangeNoticeEmail: ['kari.nordmann@example.com', 'Ola'],
  sendWelcomeEmail: ['Ola'],
  sendGameInviteEmail: ['Ola', 'Kari', 'Friday night', 'guess_the_spy', 'https://boardly.online/lobby/K7QX2M'],
  sendAccountDeletionEmail: [TOKEN, 'Ola'],
  sendPremiumConfirmationEmail: [
    {
      username: 'Ola',
      plan: 'yearly',
      amountTotal: 32900,
      currency: 'nok',
      convertedFrom: { amountTotal: 2999, currency: 'usd' },
      renewsAt: new Date('2027-10-05T14:02:00Z'),
      consentAt: new Date('2026-10-05T14:02:00Z'),
      termsVersion: '2026-10-05',
    },
  ],
  sendSubscriptionNoticeEmail: [
    { username: 'Ola', plan: 'yearly', unitAmount: 2999, currency: 'usd', renewsAt: new Date('2027-04-05T00:00:00Z') },
  ],
  sendInactiveAccountWarningEmail: [{ username: 'Ola', deleteOn: new Date('2027-11-04T03:00:00Z') }],
  sendTermsChangeNoticeEmail: [{ username: 'Ola', appliesFrom: new Date('2027-01-01T00:00:00Z') }],
  sendSuspensionNoticeEmail: [
    {
      username: 'Ola',
      reason: 'Repeated insults in lobby chat after a warning on 28 September.\nThree players reported it on the same evening.',
      expiresAt: new Date('2026-10-12T12:00:00Z'),
    },
  ],
  sendProviderLinkedNoticeEmail: [
    { username: 'Ola', provider: 'discord', linkedAt: new Date('2026-10-04T12:30:00Z') },
  ],
}
