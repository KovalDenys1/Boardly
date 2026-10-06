import { Resend } from 'resend'
import { renderEmail, type EmailBlock, type EmailLayout } from './email-layout'
import { logger } from './logger'
import { BOARDLY_URL, SUPPORT_EMAIL } from './organization-json-ld'
import { majorUnitAmount, type PremiumPlan } from './premium-plans'
import { formatSellerAddress, getSellerIdentity } from './seller-identity'
import { LINK_SUPPORT_URL } from './sold-through-link'
import { maskEmail } from './redact'
import { TERMS_FIGURES } from './terms-version'

// Only initialize Resend if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.EMAIL_FROM || 'Boardly <onboarding@resend.dev>'

const EMAIL_FAILURE_EVENT_INTERVAL_MS = 60 * 1000
const lastEmailFailureEventAt = new Map<string, number>()

/**
 * A failed Resend call was a log line and nothing else, so a suspended key or a spent
 * quota surfaced as users unable to verify (#1150). It is now an `email_send_failed`
 * OperationalEvent, at most one per minute per mail kind per instance; the recipient's
 * address is never written.
 */
async function noteEmailSendFailure(kind: string, error: unknown): Promise<void> {
  const now = Date.now()
  const previous = lastEmailFailureEventAt.get(kind)
  if (previous !== undefined && now - previous < EMAIL_FAILURE_EVENT_INTERVAL_MS) return
  lastEmailFailureEventAt.set(kind, now)
  try {
    const { recordServerReliabilityEvent } = await import('./server-operational-events')
    await recordServerReliabilityEvent({
      eventName: 'email_send_failed',
      source: kind,
      reason: error instanceof Error ? error.message : String(error),
    })
  } catch {
    // Bookkeeping must never turn a failed send into a thrown one.
  }
}

// The seller's name and geographic address (#1227, decision 2026-09-27): only the
// Premium purchase confirmation carries them, because angrerettloven section 18 is
// the one place a Boardly email has to repeat the section 8 information on a
// durable medium. An empty string until both NEXT_PUBLIC_SELLER_* variables are
// set, so the confirmation never ends in a line with the name missing.
function sellerFooterText(): string {
  const seller = getSellerIdentity()
  if (!seller) {
    return ''
  }
  return `${seller.legalName}, ${formatSellerAddress(seller)}, Norway. Email: ${seller.email}`
}

const TEAM_SIGNATURE = 'The Boardly team'

// The sign-off under every other email (#1227): the company voice and the one
// support address, never a private person's name or home address. Unlike the
// seller footer this needs no configuration, so it never renders empty.
const COMPANY_SIGN_OFF = `${TEAM_SIGNATURE} · ${SUPPORT_EMAIL}`

export type EmailMessage = { subject: string; html: string; text: string }

function singleSheetEmail(mail: {
  subject: string
  title: string
  preheader: string
  blocks: EmailBlock[]
}): EmailMessage {
  return {
    subject: mail.subject,
    ...renderEmail({
      preheader: mail.preheader,
      sheets: [{ lang: 'en', title: mail.title, blocks: mail.blocks }],
      footer: [[COMPANY_SIGN_OFF]],
    }),
  }
}

function verificationEmail(token: string, username?: string): EmailMessage {
  const verifyUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`
  const intro =
    'Thanks for signing up for Boardly! Please click the button below to verify your email address and activate your account.'
  return singleSheetEmail({
    subject: 'Verify your email - Boardly',
    title: 'Verify your email',
    preheader: intro,
    blocks: [
      { type: 'paragraph', content: `Hi ${username || 'there'}!` },
      { type: 'paragraph', content: intro },
      { type: 'button', label: 'Verify Email', href: verifyUrl },
      {
        type: 'fallbackLink',
        text: "If the button doesn't work, copy and paste this link into your browser:",
        href: verifyUrl,
      },
      {
        type: 'note',
        content: "This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.",
      },
    ],
  })
}

export async function sendVerificationEmail(email: string, token: string, username?: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = verificationEmail(token, username)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendVerificationEmail', error)
    logger.error('Failed to send verification email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function unverifiedAccountWarningEmail(token: string, username: string, daysUntilDeletion: number): EmailMessage {
  const verifyUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`
  const deadline = `${daysUntilDeletion} ${daysUntilDeletion === 1 ? 'day' : 'days'}`
  const subject = `Action required: verify your Boardly account in ${deadline}`
  return singleSheetEmail({
    subject,
    title: subject,
    preheader: `Your account email is still not verified. To keep your account, please verify your email within ${deadline}.`,
    blocks: [
      { type: 'paragraph', content: `Hi ${username || 'there'}!` },
      { type: 'paragraph', content: 'Your account email is still not verified.' },
      { type: 'paragraph', content: ['To keep your account, please verify your email within ', { strong: deadline }, '.'] },
      { type: 'callout', tone: 'warning', text: 'Accounts that remain unverified will be automatically deleted.' },
      { type: 'button', label: 'Verify Email Now', href: verifyUrl },
      { type: 'fallbackLink', text: 'If the button does not work, open this link manually:', href: verifyUrl },
    ],
  })
}

export async function sendUnverifiedAccountWarningEmail(
  email: string,
  token: string,
  username: string,
  daysUntilDeletion: number
) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = unverifiedAccountWarningEmail(token, username, daysUntilDeletion)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendUnverifiedAccountWarningEmail', error)
    logger.error('Failed to send unverified warning email:', error as Error, {
      daysUntilDeletion,
    })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function passwordResetEmail(token: string): EmailMessage {
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`
  const intro = 'We received a request to reset your password. Click the button below to create a new password.'
  return singleSheetEmail({
    subject: 'Reset your password - Boardly',
    title: 'Reset your password',
    preheader: intro,
    blocks: [
      { type: 'paragraph', content: intro },
      { type: 'button', label: 'Reset Password', href: resetUrl },
      {
        type: 'fallbackLink',
        text: "If the button doesn't work, copy and paste this link into your browser:",
        href: resetUrl,
      },
      {
        type: 'note',
        content: "This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.",
      },
    ],
  })
}

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = passwordResetEmail(token)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendPasswordResetEmail', error)
    logger.error('Failed to send password reset email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function securityPasswordResetEmail(username?: string | null): EmailMessage {
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/forgot-password`
  const subject = 'Please set a new Boardly password'
  const intro =
    'For security reasons we have reset the password on your Boardly account. Your old password no longer works, and setting a new one takes a minute:'
  return singleSheetEmail({
    subject,
    title: subject,
    preheader: intro,
    blocks: [
      { type: 'paragraph', content: username ? `Hi ${username},` : 'Hi,' },
      { type: 'paragraph', content: intro },
      { type: 'button', label: 'Set a new password', href: resetUrl },
      {
        type: 'fallbackLink',
        text: "If the button doesn't work, open this link and enter the email address of your Boardly account:",
        href: resetUrl,
      },
      { type: 'paragraph', content: 'If you sign in with Google, GitHub or Discord, nothing changes for you.' },
      {
        type: 'paragraph',
        content:
          'Your games, friends and Premium are exactly as you left them. Sorry for the interruption, and thanks for playing.',
      },
      { type: 'note', content: 'Questions? Just reply to this email.' },
    ],
  })
}

/**
 * Sent once to accounts whose password hash had been readable through a misconfigured
 * database grant (security incident 2026-09-24). The hash has already been cleared by the
 * caller; this mail tells the person, in plain words, that the password was reset for
 * security reasons and how to set a new one. Company voice, replies go to support@.
 */
export async function sendSecurityPasswordResetEmail(email: string, username?: string | null) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = securityPasswordResetEmail(username)

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: 'support@boardly.online',
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true, id: data?.id }
  } catch (error) {
    await noteEmailSendFailure('sendSecurityPasswordResetEmail', error)
    logger.error('Failed to send security password reset email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// "jane.doe@example.com" -> "ja***@example.com". Enough for the owner to tell
// their own new address from a stranger's without spelling it out in full. The one
// masking rule lives in lib/redact.ts, which the logger uses too (#1132).
export const maskEmailAddress = maskEmail

function emailChangeNoticeEmail(newEmail: string, username?: string | null): EmailMessage {
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/forgot-password`
  const maskedNewEmail = maskEmailAddress(newEmail)
  const subject = 'Your Boardly email address is being changed'
  return singleSheetEmail({
    subject,
    title: subject,
    preheader: `We received a request to change the email address on your Boardly account to ${maskedNewEmail}. The change takes effect once the new address is confirmed.`,
    blocks: [
      { type: 'paragraph', content: username ? `Hi ${username},` : 'Hi,' },
      {
        type: 'paragraph',
        content: [
          'We received a request to change the email address on your Boardly account to ',
          { strong: maskedNewEmail },
          '. The change takes effect once the new address is confirmed.',
        ],
      },
      { type: 'paragraph', content: 'If this was you, there is nothing more to do.' },
      {
        type: 'paragraph',
        content:
          'If it was not you, please reset your password now, even if you usually sign in with Google, GitHub or Discord. A reset signs out every other session on your account and cancels the pending change:',
      },
      { type: 'button', label: 'Reset my password', href: resetUrl },
      {
        type: 'fallbackLink',
        text: "If the button doesn't work, open this link and enter this email address:",
        href: resetUrl,
      },
      { type: 'paragraph', content: 'Then reply to this email and we will help you check your account.' },
      { type: 'note', content: 'Questions? Just reply to this email.' },
    ],
  })
}

// Sent to the address being replaced when someone asks to change the account's
// email (#1136). Until this existed only the new address was mailed, so a
// session thief could move the account to their own mailbox without the owner
// ever hearing about it. A password reset from here ends every other session
// and cancels the pending change.
export async function sendEmailChangeNoticeEmail(
  previousEmail: string,
  newEmail: string,
  username?: string | null
) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = emailChangeNoticeEmail(newEmail, username)

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: previousEmail,
      replyTo: 'support@boardly.online',
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true, id: data?.id }
  } catch (error) {
    logger.error('Failed to send email change notice:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function welcomeEmail(name: string): EmailMessage {
  const intro = "Your email has been verified successfully. You're all set to start playing!"
  return singleSheetEmail({
    subject: 'Welcome to Boardly! 🎲',
    title: `Welcome, ${name}!`,
    preheader: intro,
    blocks: [
      { type: 'paragraph', content: intro },
      { type: 'heading', text: "What's next?" },
      {
        type: 'list',
        items: [
          'Create your first lobby and invite friends',
          'Join existing games with lobby codes',
          'Play board games with friends in real time',
          'Customize your profile',
        ],
      },
      { type: 'button', label: 'Start Playing', href: `${process.env.NEXTAUTH_URL}/games` },
      {
        type: 'note',
        content: [
          'Need help? Check out our ',
          { text: 'website', href: `${process.env.NEXTAUTH_URL}` },
          ' or reply to this email.',
        ],
      },
    ],
  })
}

export async function sendWelcomeEmail(email: string, name: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = welcomeEmail(name)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendWelcomeEmail', error)
    logger.error('Failed to send welcome email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function gameInviteEmail(
  recipientName: string,
  senderName: string,
  lobbyName: string,
  gameType: string,
  inviteUrl: string
): EmailMessage {
  const game = gameType.replace(/_/g, ' ')
  const subject = `${senderName} invited you to play ${game} on Boardly`
  return singleSheetEmail({
    subject,
    title: subject,
    preheader: `${senderName} has invited you to join a game of ${game}.`,
    blocks: [
      { type: 'paragraph', content: `Hey ${recipientName}!` },
      { type: 'paragraph', content: [{ strong: senderName }, ' has invited you to join a game of ', { strong: game }, '.'] },
      ...(lobbyName ? [{ type: 'paragraph' as const, content: ['Lobby: ', { strong: lobbyName }] }] : []),
      { type: 'button', label: 'Join Game', href: inviteUrl },
      {
        type: 'fallbackLink',
        text: "If the button doesn't work, copy and paste this link into your browser:",
        href: inviteUrl,
      },
      {
        type: 'note',
        content: `You received this email because ${senderName} invited you to a game. To stop receiving game invite emails, update your notification preferences in your Boardly profile.`,
      },
    ],
  })
}

export async function sendGameInviteEmail(
  recipientEmail: string,
  recipientName: string,
  senderName: string,
  lobbyName: string,
  gameType: string,
  inviteUrl: string
) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = gameInviteEmail(recipientName, senderName, lobbyName, gameType, inviteUrl)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendGameInviteEmail', error)
    logger.error('Failed to send game invite email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function accountDeletionEmail(token: string, username: string): EmailMessage {
  const deleteUrl = `${process.env.NEXTAUTH_URL}/auth/delete-account?token=${token}`
  const intro = 'We received a request to delete your Boardly account.'
  return singleSheetEmail({
    subject: 'Confirm Account Deletion - Boardly',
    title: 'Confirm Account Deletion',
    preheader: intro,
    blocks: [
      { type: 'paragraph', content: `Hi ${username},` },
      { type: 'paragraph', content: intro },
      { type: 'callout', tone: 'danger', text: 'This action is permanent and cannot be undone!' },
      { type: 'paragraph', content: [{ strong: 'What will be deleted:' }] },
      {
        type: 'list',
        items: [
          'Your profile and all personal information',
          'All game history and statistics',
          'Friend connections and requests',
          'Any unlocked achievements',
        ],
      },
      { type: 'paragraph', content: "If you're sure you want to proceed, click the button below:" },
      { type: 'button', label: 'Confirm Account Deletion', href: deleteUrl, tone: 'danger' },
      {
        type: 'fallbackLink',
        text: "If the button doesn't work, copy and paste this link into your browser:",
        href: deleteUrl,
      },
      {
        type: 'note',
        content:
          "This link will expire in 1 hour. If you didn't request account deletion, please ignore this email and your account will remain active. Consider changing your password if you're concerned about account security.",
      },
    ],
  })
}

export async function sendAccountDeletionEmail(email: string, token: string, username: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = accountDeletionEmail(token, username)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendAccountDeletionEmail', error)
    logger.error('Failed to send account deletion email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export type PremiumConfirmationDetails = {
  /** Resend idempotency key; one per checkout session so a retried send cannot double-deliver. */
  idempotencyKey?: string
  username?: string | null
  plan: PremiumPlan
  /** Stripe's `amount_total` for the Checkout Session: minor units of `currency`. */
  amountTotal: number
  /** Stripe's `currency`: lower-case ISO 4217. */
  currency: string
  /**
   * Stripe's `currency_conversion` when Adaptive Pricing converted the charge
   * (#919): the amount in the currency the price is defined in, so the buyer
   * can match the figure to the "from" price the site showed.
   */
  convertedFrom?: { amountTotal: number; currency: string } | null
  /** The end of the period just paid for, when Stripe reported one. */
  renewsAt: Date | null
  /** When the buyer asked us to start Premium, from the session metadata (#1162). */
  consentAt: Date
  /** TERMS_VERSION as it was at checkout, from the same metadata. */
  termsVersion: string
}

type ConfirmationSection = { heading: string; paragraphs: string[] }

type ConfirmationCopy = {
  greeting: string
  intro: string
  sections: ConfirmationSection[]
}

// ICU puts a narrow no-break space before "PM" and between a number and "kr".
// Mail clients render it unevenly, and it would make the plain-text part
// differ from what a person types when searching, so both become a space.
function plainSpaces(value: string): string {
  return value.replace(/[  ]/g, ' ')
}

function formatChargedAmount(amountMinor: number, currency: string, locale: string): string {
  const value = majorUnitAmount(amountMinor, currency)
  try {
    return plainSpaces(
      new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(value)
    )
  } catch {
    return `${value} ${currency.toUpperCase()}`
  }
}

// Always UTC and always labelled so: nothing here knows the buyer's time zone,
// and a bare local-looking time would be wrong for most of them.
function formatMoment(date: Date, locale: string): string {
  return `${plainSpaces(
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(date)
  )} UTC`
}

function formatDay(date: Date, locale: string): string {
  return plainSpaces(new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date))
}

type ConfirmationLinks = { profile: string; withdrawal: string; terms: string }

function englishConfirmationCopy(d: PremiumConfirmationDetails, links: ConfirmationLinks): ConfirmationCopy {
  const locale = 'en-US'
  const yearly = d.plan === 'yearly'
  const amount = formatChargedAmount(d.amountTotal, d.currency, locale)
  const converted = d.convertedFrom
    ? ` That is ${formatChargedAmount(d.convertedFrom.amountTotal, d.convertedFrom.currency, locale)} converted into your currency at checkout.`
    : ''
  const renewal = d.renewsAt ? ` Next renewal: ${formatDay(d.renewsAt, locale)}.` : ''
  // Link's Purchase Terms: for a subscription paid in local currency the rate
  // "is determined on every payment date of your subscription billing cycle".
  const renewalConversion = d.convertedFrom
    ? ' Because you pay in your own currency, each renewal is converted at the rate of the day it is charged, so the amount in your currency can vary.'
    : ''
  const when = formatMoment(d.consentAt, locale)

  return {
    greeting: d.username ? `Hi ${d.username},` : 'Hi,',
    intro:
      'Thanks for subscribing to Boardly Premium. This email confirms your purchase and repeats the information you were given before you paid, so please keep it.',
    sections: [
      {
        heading: 'What you bought',
        paragraphs: [
          `Boardly Premium, ${yearly ? 'yearly' : 'monthly'} plan, purchased on ${when}.`,
          `Amount charged: ${amount}.${converted}`,
          `The subscription renews automatically every ${yearly ? 'year' : 'month'} at the same price until you cancel.${renewal}${renewalConversion}`,
        ],
      },
      {
        heading: 'Receipt, invoice and payment',
        paragraphs: [
          'Boardly Premium is sold through Link: Stripe\'s affiliate Sold through Link, LLC is the merchant of record for this purchase. Link charged your payment method and collected any VAT or sales tax, and it sends your receipt and invoice in a separate email from a link.com address. Your card or bank statement shows the charge as "LINK.COM*" followed by our name.',
          `For a problem with the payment itself, such as a charge you do not recognise, you can also contact Link support at ${LINK_SUPPORT_URL}.`,
        ],
      },
      {
        heading: 'How to cancel',
        paragraphs: [
          `You can cancel at any time with one click from your profile at ${links.profile}. The cancellation takes effect at the end of the period you have paid for, and you keep Premium until then. If you cancel a yearly plan early, write to us and we refund the unused whole months.`,
          // What happens to access after a cancellation made in Link is Link's
          // to decide, so the end-of-period promise above covers the profile only.
          "You can also cancel the subscription, or delete your Link account, at link.com; that follows Link's terms, and deleting your Link account cancels the subscription.",
        ],
      },
      {
        heading: 'Right of withdrawal',
        paragraphs: [
          `You have 14 days from the purchase date to withdraw from this purchase, without giving a reason. To withdraw, send an email to ${SUPPORT_EMAIL} or use the withdrawal form at ${links.withdrawal}. We refund everything you have paid for the purchase within 14 days of receiving your notice, by the same payment method and with no fee.`,
          `The refund goes through Link, which emails you the refund notice. You can also ask Link support for the refund at ${LINK_SUPPORT_URL}: Link's terms give consumers in the EU and the UK a 14-day cooling-off period, for which you give "cooling off period" as the reason. If Link cannot help, write to us, and the refund above still applies.`,
        ],
      },
      {
        heading: 'Your request at checkout',
        paragraphs: [
          `At checkout on ${when} you asked us to start Premium immediately and confirmed you had read the withdrawal information; the right of withdrawal still applies for 14 days.`,
        ],
      },
      {
        heading: 'Terms',
        paragraphs: [
          `The Boardly Terms of Service, version ${d.termsVersion}, apply to this subscription: ${links.terms}.`,
        ],
      },
    ],
  }
}

function norwegianConfirmationCopy(d: PremiumConfirmationDetails, links: ConfirmationLinks): ConfirmationCopy {
  const locale = 'nb-NO'
  const yearly = d.plan === 'yearly'
  const amount = formatChargedAmount(d.amountTotal, d.currency, locale)
  const converted = d.convertedFrom
    ? ` Det tilsvarer ${formatChargedAmount(d.convertedFrom.amountTotal, d.convertedFrom.currency, locale)} omregnet til din valuta i kassen.`
    : ''
  const renewal = d.renewsAt ? ` Neste fornyelse: ${formatDay(d.renewsAt, locale)}.` : ''
  const renewalConversion = d.convertedFrom
    ? ' Fordi du betaler i din egen valuta, regnes hver fornyelse om etter kursen den dagen beløpet trekkes, så beløpet i din valuta kan variere.'
    : ''
  const when = formatMoment(d.consentAt, locale)

  return {
    greeting: d.username ? `Hei ${d.username},` : 'Hei,',
    intro:
      'Takk for at du abonnerer på Boardly Premium. Denne e-posten bekrefter kjøpet og gjentar opplysningene du fikk før du betalte, så ta vare på den.',
    sections: [
      {
        heading: 'Hva du kjøpte',
        paragraphs: [
          `Boardly Premium, ${yearly ? 'årsabonnement' : 'månedsabonnement'}, kjøpt ${when}.`,
          `Belastet beløp: ${amount}.${converted}`,
          `Abonnementet fornyes automatisk ${yearly ? 'hvert år' : 'hver måned'} til samme pris til du sier det opp.${renewal}${renewalConversion}`,
        ],
      },
      {
        heading: 'Kvittering, faktura og betaling',
        paragraphs: [
          'Boardly Premium selges gjennom Link: Sold through Link, LLC, et selskap i Stripe-konsernet, er «merchant of record» for dette kjøpet. Link belastet betalingsmåten din og krevde inn eventuell merverdiavgift eller salgsskatt, og sender kvittering og faktura i en egen e-post fra en link.com-adresse. På kort- eller kontoutskriften står belastningen som «LINK.COM*» etterfulgt av navnet vårt.',
          `Har du et problem med selve betalingen, for eksempel en belastning du ikke kjenner igjen, kan du også kontakte Links kundestøtte på ${LINK_SUPPORT_URL}.`,
        ],
      },
      {
        heading: 'Slik sier du opp',
        paragraphs: [
          `Du kan si opp når som helst med ett klikk fra profilen din på ${links.profile}. Oppsigelsen gjelder fra utløpet av perioden du har betalt for, og du beholder Premium til da. Sier du opp et årsabonnement før tiden, kan du skrive til oss, så betaler vi tilbake de ubrukte hele månedene.`,
          'Du kan også si opp abonnementet eller slette Link-kontoen din på link.com; da gjelder Links vilkår, og sletter du Link-kontoen, sies abonnementet opp.',
        ],
      },
      {
        heading: 'Angrerett',
        paragraphs: [
          `Du har 14 dagers angrerett fra kjøpsdatoen, uten å oppgi noen grunn. For å angre sender du en e-post til ${SUPPORT_EMAIL} eller bruker angreskjemaet på ${links.withdrawal}. Vi betaler tilbake alt du har betalt for kjøpet innen 14 dager etter at vi fikk beskjeden, med samme betalingsmåte og uten gebyr.`,
          `Refusjonen går gjennom Link, som sender deg varselet om den på e-post. Du kan også be Links kundestøtte om refusjonen på ${LINK_SUPPORT_URL}: Links vilkår gir forbrukere i EU og Storbritannia 14 dagers angrefrist, og da oppgir du «cooling off period» som grunn. Kan ikke Link hjelpe deg, skriver du til oss, og refusjonen over gjelder fortsatt.`,
        ],
      },
      {
        heading: 'Det du ba om i kassen',
        paragraphs: [
          `I kassen ${when} ba du oss om å starte Premium med en gang og bekreftet at du hadde lest informasjonen om angrerett. Angreretten gjelder likevel i 14 dager.`,
        ],
      },
      {
        heading: 'Vilkår',
        paragraphs: [
          `Boardlys vilkår for bruk, versjon ${d.termsVersion}, gjelder for abonnementet: ${links.terms}.`,
        ],
      },
    ],
  }
}

const NOTICE_CLOSING = [
  `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`,
  `Spørsmål? Svar på denne e-posten eller skriv til ${SUPPORT_EMAIL}.`,
]

function copyBlocks(copy: ConfirmationCopy): EmailBlock[] {
  return [
    { type: 'paragraph', content: copy.greeting },
    { type: 'paragraph', content: copy.intro },
    ...copy.sections.flatMap((section): EmailBlock[] => [
      { type: 'heading', text: section.heading },
      ...section.paragraphs.map((text): EmailBlock => ({ type: 'paragraph', content: text })),
    ]),
  ]
}

function noticeEmail(notice: {
  titles: [english: string, norwegian: string]
  english: ConfirmationCopy
  norwegian: ConfirmationCopy
  links: Readonly<Record<string, string>>
  footer: EmailLayout['footer']
}): EmailMessage {
  const [englishTitle, norwegianTitle] = notice.titles
  return {
    subject: `${englishTitle} / ${norwegianTitle}`,
    ...renderEmail({
      preheader: notice.english.intro,
      sheets: [
        { lang: 'en', title: englishTitle, blocks: copyBlocks(notice.english) },
        { lang: 'nb', title: norwegianTitle, blocks: copyBlocks(notice.norwegian) },
      ],
      footer: notice.footer,
      links: [...Object.values(notice.links), LINK_SUPPORT_URL],
    }),
  }
}

function premiumConfirmationEmail(details: PremiumConfirmationDetails): EmailMessage {
  const base = process.env.NEXTAUTH_URL ?? ''
  const links: ConfirmationLinks = {
    profile: `${base}/profile`,
    withdrawal: `${base}/withdrawal`,
    terms: `${base}/terms`,
  }
  const seller = sellerFooterText()
  return noticeEmail({
    titles: ['Your Boardly Premium confirmation', 'Bekreftelse på Boardly Premium'],
    english: englishConfirmationCopy(details, links),
    norwegian: norwegianConfirmationCopy(details, links),
    links,
    footer: [[...NOTICE_CLOSING, TEAM_SIGNATURE], seller ? [seller] : []],
  })
}

/**
 * The confirmation a Premium buyer gets once the Checkout Session completes
 * (#1164). angrerettloven section 18 wants, on a durable medium, the section 8
 * information repeated and a statement that the buyer asked for the service
 * to start at once; ehandelsloven section 12 wants an order confirmation.
 * English first, then Norwegian bokmal, in one message: no language is stored
 * per user. Sent once per session, which the caller guarantees through
 * PurchaseConsents.confirmationSentAt, not this function.
 *
 * Not the receipt. Premium is sold through Stripe Managed Payments (#1179),
 * and Link sends the receipt, the invoice and any refund notice itself; this
 * message says so, so the buyer knows to expect a second email from link.com.
 */
export async function sendPremiumConfirmationEmail(email: string, details: PremiumConfirmationDetails) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = premiumConfirmationEmail(details)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      ...message,
    }, details.idempotencyKey ? { idempotencyKey: details.idempotencyKey } : undefined)
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendPremiumConfirmationEmail', error)
    logger.error('Failed to send premium confirmation email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export type SubscriptionNoticeDetails = {
  /** Resend idempotency key; one per notice, so a retried send cannot double-deliver. */
  idempotencyKey?: string
  username?: string | null
  plan: PremiumPlan
  /** The Stripe Price's `unit_amount`: minor units of `currency`. Null when Stripe gave none. */
  unitAmount: number | null
  /** The Stripe Price's `currency`: lower-case ISO 4217. */
  currency: string | null
  /** The end of the current period, when the next renewal is charged. */
  renewsAt: Date | null
}

function englishNoticeCopy(d: SubscriptionNoticeDetails, links: ConfirmationLinks): ConfirmationCopy {
  const locale = 'en-US'
  const yearly = d.plan === 'yearly'
  const period = yearly ? 'year' : 'month'
  const price =
    d.unitAmount !== null && d.currency
      ? ` Price: ${formatChargedAmount(d.unitAmount, d.currency, locale)} per ${period}. If you pay in another currency, Link converts the price at the rate of the day each renewal is charged.`
      : ''
  const renewal = d.renewsAt
    ? `It renews automatically on ${formatDay(d.renewsAt, locale)}, and every ${period} after that, until you cancel.`
    : `It renews automatically every ${period} until you cancel.`

  return {
    greeting: d.username ? `Hi ${d.username},` : 'Hi,',
    intro:
      'Your Boardly Premium subscription is still running. While it runs, we send you this reminder at least every six months, so you always know what you are paying for and how to stop it.',
    sections: [
      {
        heading: 'Your subscription',
        paragraphs: [`Boardly Premium, ${yearly ? 'yearly' : 'monthly'} plan.${price}`, renewal],
      },
      {
        heading: 'How to cancel',
        paragraphs: [
          `You can cancel at any time: open ${links.profile}, go to the Premium tab and press Cancel. The cancellation takes effect at the end of the period you have paid for; you keep Premium until then, and nothing more is charged. If you cancel a yearly plan early, write to us and we refund the unused whole months.`,
          `You can also write to ${SUPPORT_EMAIL} and we cancel it for you, or cancel it in your Link account at link.com, which follows Link's terms.`,
        ],
      },
      {
        heading: 'Terms',
        paragraphs: [`The Boardly Terms of Service apply to the subscription: ${links.terms}.`],
      },
    ],
  }
}

function norwegianNoticeCopy(d: SubscriptionNoticeDetails, links: ConfirmationLinks): ConfirmationCopy {
  const locale = 'nb-NO'
  const yearly = d.plan === 'yearly'
  const price =
    d.unitAmount !== null && d.currency
      ? ` Pris: ${formatChargedAmount(d.unitAmount, d.currency, locale)} per ${yearly ? 'år' : 'måned'}. Betaler du i en annen valuta, regner Link om prisen etter kursen den dagen hver fornyelse trekkes.`
      : ''
  const every = yearly ? 'hvert år' : 'hver måned'
  const renewal = d.renewsAt
    ? `Abonnementet fornyes automatisk ${formatDay(d.renewsAt, locale)} og deretter ${every}, til du sier det opp.`
    : `Abonnementet fornyes automatisk ${every} til du sier det opp.`

  return {
    greeting: d.username ? `Hei ${d.username},` : 'Hei,',
    intro:
      'Boardly Premium-abonnementet ditt løper fortsatt. Så lenge det løper, sender vi deg denne påminnelsen minst hver sjette måned, slik at du alltid vet hva du betaler for, og hvordan du stopper det.',
    sections: [
      {
        heading: 'Abonnementet ditt',
        paragraphs: [`Boardly Premium, ${yearly ? 'årsabonnement' : 'månedsabonnement'}.${price}`, renewal],
      },
      {
        heading: 'Slik sier du opp',
        paragraphs: [
          `Du kan si opp når som helst: åpne ${links.profile}, gå til Premium-fanen og trykk på Avbryt. Oppsigelsen gjelder fra utløpet av perioden du har betalt for; du beholder Premium til da, og ingenting mer blir trukket. Sier du opp et årsabonnement før tiden, kan du skrive til oss, så betaler vi tilbake de ubrukte hele månedene.`,
          `Du kan også skrive til ${SUPPORT_EMAIL}, så sier vi opp abonnementet for deg, eller si det opp i Link-kontoen din på link.com; da gjelder Links vilkår.`,
        ],
      },
      {
        heading: 'Vilkår',
        paragraphs: [`Boardlys vilkår for bruk gjelder for abonnementet: ${links.terms}.`],
      },
    ],
  }
}

function subscriptionNoticeEmail(details: SubscriptionNoticeDetails): EmailMessage {
  const base = process.env.NEXTAUTH_URL ?? ''
  const links: ConfirmationLinks = {
    profile: `${base}/profile?tab=premium`,
    withdrawal: `${base}/withdrawal`,
    terms: `${base}/terms`,
  }
  return noticeEmail({
    titles: [
      'Your Boardly Premium subscription is still running',
      'Boardly Premium-abonnementet ditt løper fortsatt',
    ],
    english: englishNoticeCopy(details, links),
    norwegian: norwegianNoticeCopy(details, links),
    links,
    footer: [[...NOTICE_CLOSING, TEAM_SIGNATURE]],
  })
}

/**
 * The running-subscription notice (#1165). digitalytelsesloven § 33 fourth
 * paragraph: "Ved løpende levering av digitale ytelser skal leverandøren minst en
 * gang hver sjette måned sende forbrukeren et varsel om at avtalen løper, og
 * opplyse forbrukeren om adgangen til å si opp avtalen etter første til tredje
 * ledd." So it says the subscription runs and how to end it: on the channel it
 * was bought through (the profile), simply, with effect from the end of the
 * paid period (§ 33 first and third paragraphs).
 *
 * Link's own renewal emails do not cover it: outside Australia and the UK they
 * come only before the 12-month anniversary unless "Upcoming renewals" is on, and
 * even then a yearly plan hears once a year (docs/OPERATIONS.md, "Runbook:
 * running-subscription notice"). English first, then Norwegian bokmål, in one
 * message, like the purchase confirmation: no language is stored per user.
 * lib/subscription-notice.ts decides who is due and guarantees one send per
 * notice; this only renders and sends.
 */
export async function sendSubscriptionNoticeEmail(email: string, details: SubscriptionNoticeDetails) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = subscriptionNoticeEmail(details)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      ...message,
    }, details.idempotencyKey ? { idempotencyKey: details.idempotencyKey } : undefined)
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendSubscriptionNoticeEmail', error)
    logger.error('Failed to send subscription notice email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export type InactiveAccountWarningDetails = {
  /** Resend idempotency key; one per warning, so a retried send cannot double-deliver. */
  idempotencyKey?: string
  username?: string | null
  /** The day the account will be deleted unless its owner signs in first. */
  deleteOn: Date
}

type InactiveWarningLinks = { login: string; profile: string; privacy: string }

function englishInactiveWarningCopy(d: InactiveAccountWarningDetails, links: InactiveWarningLinks): ConfirmationCopy {
  const day = formatDay(d.deleteOn, 'en-US')
  return {
    greeting: d.username ? `Hi ${d.username},` : 'Hi,',
    intro: `Nobody has signed in to your Boardly account for almost two years. We do not keep accounts that are no longer used, so we will delete yours on ${day} or shortly after, unless you sign in before then.`,
    sections: [
      {
        heading: 'Keeping your account',
        paragraphs: [`Sign in at ${links.login} before ${day} and we keep the account. That is all it takes, and nothing else changes.`],
      },
      {
        heading: 'What deletion removes',
        paragraphs: [
          'Your profile, username, profile picture, friends, achievements and settings are deleted, and so are your game history and statistics. In other players\' game records your name is replaced with "Deleted player". Feedback you sent stays, without your email address and account.',
        ],
      },
      {
        heading: 'Your data',
        paragraphs: [
          `If you want a copy first, sign in and use "Download my data" on your profile page: ${links.profile}. Our privacy policy says how long we keep what: ${links.privacy}.`,
        ],
      },
    ],
  }
}

function norwegianInactiveWarningCopy(d: InactiveAccountWarningDetails, links: InactiveWarningLinks): ConfirmationCopy {
  const day = formatDay(d.deleteOn, 'nb-NO')
  return {
    greeting: d.username ? `Hei ${d.username},` : 'Hei,',
    intro: `Ingen har logget inn på Boardly-kontoen din på nesten to år. Vi tar ikke vare på kontoer som ikke lenger brukes, så vi sletter din ${day} eller kort tid etter, hvis du ikke logger inn før det.`,
    sections: [
      {
        heading: 'Slik beholder du kontoen',
        paragraphs: [`Logg inn på ${links.login} før ${day}, så beholder vi kontoen. Mer skal ikke til, og ingenting annet endres.`],
      },
      {
        heading: 'Dette slettes',
        paragraphs: [
          'Profilen, brukernavnet, profilbildet, vennene, prestasjonene og innstillingene dine slettes, og det samme gjør spillhistorikken og statistikken din. I andre spilleres spillhistorikk erstattes navnet ditt med «Deleted player». Tilbakemeldinger du har sendt, blir værende, uten e-postadressen og kontoen din.',
        ],
      },
      {
        heading: 'Dataene dine',
        paragraphs: [
          `Vil du ha en kopi først, kan du logge inn og bruke «Last ned dataene mine» på profilsiden: ${links.profile}. I personvernerklæringen står det hvor lenge vi lagrer hva: ${links.privacy}.`,
        ],
      },
    ],
  }
}

function inactiveAccountWarningEmail(details: InactiveAccountWarningDetails): EmailMessage {
  const base = process.env.NEXTAUTH_URL ?? ''
  const links: InactiveWarningLinks = {
    login: `${base}/auth/login`,
    profile: `${base}/profile`,
    privacy: `${base}/privacy`,
  }
  return noticeEmail({
    titles: ['Your Boardly account will be deleted', 'Boardly-kontoen din blir slettet'],
    english: englishInactiveWarningCopy(details, links),
    norwegian: norwegianInactiveWarningCopy(details, links),
    links,
    footer: [[...NOTICE_CLOSING, TEAM_SIGNATURE]],
  })
}

/**
 * The warning before an inactive account is deleted (#1130, decision 2026-09-27): a
 * registered account nobody has signed in to for 24 months is deleted, and its owner hears
 * about it 30 days before. English first, then Norwegian bokmål, in one message, like the
 * other notices: no language is stored per user. lib/inactive-accounts.ts decides who is
 * due and guarantees one send per warning; this only renders and sends.
 */
export async function sendInactiveAccountWarningEmail(email: string, details: InactiveAccountWarningDetails) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = inactiveAccountWarningEmail(details)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      ...message,
    }, details.idempotencyKey ? { idempotencyKey: details.idempotencyKey } : undefined)
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendInactiveAccountWarningEmail', error)
    logger.error('Failed to send inactive account warning email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export type TermsChangeNoticeDetails = {
  idempotencyKey?: string
  username?: string | null
  appliesFrom: Date
}

type TermsChangeNoticeLinks = { terms: string; privacy: string; profile: string }

function englishTermsChangeCopy(d: TermsChangeNoticeDetails, links: TermsChangeNoticeLinks): ConfirmationCopy {
  const day = formatDay(d.appliesFrom, 'en-US')
  return {
    greeting: d.username ? `Hi ${d.username},` : 'Hi,',
    intro: `We have updated the Boardly Terms of Service. One thing changes, and it applies from ${day}.`,
    sections: [
      {
        heading: 'What changes',
        paragraphs: [
          `From ${day}, an account that has not been used for ${TERMS_FIGURES.inactiveMonths} months is deleted. We email the address on the account ${TERMS_FIGURES.inactiveWarningDays} days before, and signing in once before that day keeps the account. Nothing else in the Terms has changed.`,
          'The rule does not apply to an account that has or has had Premium or has ever started a Premium purchase, or to an account that is suspended.',
        ],
      },
      {
        heading: 'What you need to do',
        paragraphs: [
          'Nothing, if you want to keep playing: an account you sign in to is never affected.',
          `If you do not accept the change, you can delete your account from your profile page before ${day}: ${links.profile}. If you have Premium, you can also end the subscription free of charge before that day, and we refund the part of the period you have paid for that falls after it.`,
        ],
      },
      {
        heading: 'Where to read it',
        paragraphs: [
          `The rule is in section 2 of the Terms: ${links.terms}. Our privacy policy says how long we keep what: ${links.privacy}.`,
        ],
      },
    ],
  }
}

function norwegianTermsChangeCopy(d: TermsChangeNoticeDetails, links: TermsChangeNoticeLinks): ConfirmationCopy {
  const day = formatDay(d.appliesFrom, 'nb-NO')
  return {
    greeting: d.username ? `Hei ${d.username},` : 'Hei,',
    intro: `Vi har oppdatert Boardlys vilkår for bruk. Én ting endres, og den gjelder fra ${day}.`,
    sections: [
      {
        heading: 'Hva som endres',
        paragraphs: [
          `Fra ${day} slettes en konto som ikke har vært brukt på ${TERMS_FIGURES.inactiveMonths} måneder. Vi sender en e-post til adressen på kontoen ${TERMS_FIGURES.inactiveWarningDays} dager før, og logger du inn én gang før den dagen, beholder du kontoen. Ingenting annet i vilkårene er endret.`,
          'Regelen gjelder ikke for en konto som har eller har hatt Premium eller noen gang har startet et Premium-kjøp, og heller ikke for en konto som er suspendert.',
        ],
      },
      {
        heading: 'Hva du må gjøre',
        paragraphs: [
          'Ingenting, hvis du vil fortsette å spille: en konto du logger inn på, blir aldri berørt.',
          `Godtar du ikke endringen, kan du slette kontoen fra profilsiden din før ${day}: ${links.profile}. Har du Premium, kan du også si opp abonnementet kostnadsfritt før den dagen, og vi betaler tilbake den delen av perioden du har betalt for, som faller etter den.`,
        ],
      },
      {
        heading: 'Hvor du kan lese det',
        paragraphs: [
          `Regelen står i punkt 2 i vilkårene: ${links.terms}. I personvernerklæringen står det hvor lenge vi lagrer hva: ${links.privacy}.`,
        ],
      },
    ],
  }
}

function termsChangeNoticeEmail(details: TermsChangeNoticeDetails): EmailMessage {
  const links: TermsChangeNoticeLinks = {
    terms: `${BOARDLY_URL}/terms`,
    privacy: `${BOARDLY_URL}/privacy`,
    profile: `${BOARDLY_URL}/profile`,
  }
  return noticeEmail({
    titles: ['An update to the Boardly Terms of Service', 'Boardlys vilkår er oppdatert'],
    english: englishTermsChangeCopy(details, links),
    norwegian: norwegianTermsChangeCopy(details, links),
    links,
    footer: [[...NOTICE_CLOSING, TEAM_SIGNATURE]],
  })
}

export async function sendTermsChangeNoticeEmail(email: string, details: TermsChangeNoticeDetails) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = termsChangeNoticeEmail(details)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      ...message,
    }, details.idempotencyKey ? { idempotencyKey: details.idempotencyKey } : undefined)
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendTermsChangeNoticeEmail', error)
    logger.error('Failed to send Terms change notice email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export type SuspensionNoticeDetails = {
  /** Resend idempotency key, so a retried request cannot deliver the same notice twice. */
  idempotencyKey?: string
  username?: string | null
  /** Why the account was suspended, as staff wrote it in the Control Panel. */
  reason: string
  /** When a temporary suspension ends; null for one until further notice. */
  expiresAt: Date | null
}

/**
 * The production appeal form, whatever deployment sends the mail: the address the Terms
 * name (section 5, "boardly.online/suspended") and the one that works while signed out.
 */
export const SUSPENSION_APPEAL_URL = `${BOARDLY_URL}/suspended`

type SuspensionNoticeLinks = { appeal: string }

// One paragraph per line staff wrote, so a reason set out in lines keeps them.
function reasonParagraphs(reason: string): string[] {
  const lines = reason.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  return lines.length > 0 ? lines : [reason.trim()]
}

function englishSuspensionCopy(d: SuspensionNoticeDetails, links: SuspensionNoticeLinks): ConfirmationCopy {
  return {
    greeting: d.username ? `Hi ${d.username},` : 'Hi,',
    intro: 'We have suspended your Boardly account. While it is suspended, you cannot sign in to it.',
    sections: [
      { heading: 'Reason', paragraphs: reasonParagraphs(d.reason) },
      {
        heading: 'How long',
        paragraphs: [
          d.expiresAt
            ? `The suspension ends on ${formatMoment(d.expiresAt, 'en-US')}. After that you can sign in again.`
            : 'The suspension lasts until further notice.',
        ],
      },
      {
        heading: 'Appeal',
        paragraphs: [
          `If you think we got this wrong, appeal with the form at ${links.appeal} or reply to this email. We answer every appeal in writing.`,
        ],
      },
    ],
  }
}

function norwegianSuspensionCopy(d: SuspensionNoticeDetails, links: SuspensionNoticeLinks): ConfirmationCopy {
  return {
    greeting: d.username ? `Hei ${d.username},` : 'Hei,',
    intro: 'Vi har suspendert Boardly-kontoen din. Så lenge den er suspendert, kan du ikke logge inn på den.',
    sections: [
      { heading: 'Begrunnelse', paragraphs: reasonParagraphs(d.reason) },
      {
        heading: 'Varighet',
        paragraphs: [
          d.expiresAt
            ? `Suspensjonen varer til ${formatMoment(d.expiresAt, 'nb-NO')}. Etter det kan du logge inn igjen.`
            : 'Suspensjonen gjelder inntil videre.',
        ],
      },
      {
        heading: 'Klage',
        paragraphs: [
          `Mener du at vi har tatt feil, kan du klage med skjemaet på ${links.appeal} eller svare på denne e-posten. Vi svarer skriftlig på alle klager.`,
        ],
      },
    ],
  }
}

function suspensionNoticeEmail(details: SuspensionNoticeDetails): EmailMessage {
  const links: SuspensionNoticeLinks = { appeal: SUSPENSION_APPEAL_URL }
  return noticeEmail({
    titles: ['Your Boardly account has been suspended', 'Boardly-kontoen din er suspendert'],
    english: englishSuspensionCopy(details, links),
    norwegian: norwegianSuspensionCopy(details, links),
    links,
    footer: [NOTICE_CLOSING, [COMPANY_SIGN_OFF]],
  })
}

/**
 * The email a suspended account's owner gets (Control Panel #120). The Terms promise it
 * (section 5): "When we suspend or close an account, we email the owner the reason and, for
 * a temporary suspension, the end date." English first, then Norwegian bokmål, like the
 * other notices: no language is stored per user. The reason is staff's own text and is
 * shown as written, escaped, in both halves. POST /api/internal/admin/suspension-notice
 * sends it; this only renders and sends.
 */
export async function sendSuspensionNoticeEmail(email: string, details: SuspensionNoticeDetails) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = suspensionNoticeEmail(details)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      ...message,
    }, details.idempotencyKey ? { idempotencyKey: details.idempotencyKey } : undefined)
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendSuspensionNoticeEmail', error)
    logger.error('Failed to send suspension notice email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

const LINKABLE_PROVIDER_NAMES = { discord: 'Discord', google: 'Google', github: 'GitHub' } as const

export type ProviderLinkedNoticeDetails = {
  username?: string | null
  provider: keyof typeof LINKABLE_PROVIDER_NAMES
  linkedAt: Date
}

type ProviderLinkedLinks = { profile: string; reset: string }

function englishProviderLinkedCopy(d: ProviderLinkedNoticeDetails, links: ProviderLinkedLinks): ConfirmationCopy {
  const provider = LINKABLE_PROVIDER_NAMES[d.provider]
  return {
    greeting: d.username ? `Hi ${d.username},` : 'Hi,',
    intro: `A ${provider} account was linked to your Boardly account on ${formatMoment(d.linkedAt, 'en-US')}. Whoever holds that ${provider} account can now sign in to your Boardly account with it.`,
    sections: [
      { heading: 'If this was you', paragraphs: ['There is nothing more to do.'] },
      {
        heading: 'If this was not you',
        paragraphs: [
          `Sign in at ${links.profile}, find ${provider} under "Connected Accounts" and choose "Unlink".`,
          `Then set a new password at ${links.reset}, even if you usually sign in with Google, GitHub or Discord. That signs out every other session on your account.`,
          'After that, reply to this email and we will help you check your account.',
        ],
      },
    ],
  }
}

function norwegianProviderLinkedCopy(d: ProviderLinkedNoticeDetails, links: ProviderLinkedLinks): ConfirmationCopy {
  const provider = LINKABLE_PROVIDER_NAMES[d.provider]
  return {
    greeting: d.username ? `Hei ${d.username},` : 'Hei,',
    intro: `En ${provider}-konto ble koblet til Boardly-kontoen din ${formatMoment(d.linkedAt, 'nb-NO')}. Den som har den ${provider}-kontoen, kan nå logge inn på Boardly-kontoen din med den.`,
    sections: [
      { heading: 'Hvis dette var deg', paragraphs: ['Da trenger du ikke å gjøre noe mer.'] },
      {
        heading: 'Hvis dette ikke var deg',
        paragraphs: [
          `Logg inn på ${links.profile}, finn ${provider} under «Tilkoblede kontoer» og velg «Koble fra».`,
          `Lag deretter et nytt passord på ${links.reset}, også hvis du vanligvis logger inn med Google, GitHub eller Discord. Da logges alle andre økter på kontoen din ut.`,
          'Svar så på denne e-posten, så hjelper vi deg med å sjekke kontoen.',
        ],
      },
    ],
  }
}

function providerLinkedNoticeEmail(details: ProviderLinkedNoticeDetails): EmailMessage {
  const base = process.env.NEXTAUTH_URL ?? ''
  const links: ProviderLinkedLinks = {
    profile: `${base}/profile`,
    reset: `${base}/auth/forgot-password`,
  }
  const provider = LINKABLE_PROVIDER_NAMES[details.provider]
  return noticeEmail({
    titles: [
      `A ${provider} account was linked to your Boardly account`,
      `En ${provider}-konto ble koblet til Boardly-kontoen din`,
    ],
    english: englishProviderLinkedCopy(details, links),
    norwegian: norwegianProviderLinkedCopy(details, links),
    links,
    footer: [NOTICE_CLOSING, [COMPANY_SIGN_OFF]],
  })
}

/**
 * The notice an account's owner gets when a sign-in provider is linked to the account
 * (#1223): a linked provider is a way to sign in, so the owner hears about a new one.
 * English first, then Norwegian bokmål, like the other notices: no language is stored
 * per user. The caller decides who is told; this only renders and sends.
 */
export async function sendProviderLinkedNoticeEmail(email: string, details: ProviderLinkedNoticeDetails) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const message = providerLinkedNoticeEmail(details)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      ...message,
    })
    if (error) {
      throw new Error((error as { message?: string }).message || 'Unknown error')
    }
    return { success: true }
  } catch (error) {
    await noteEmailSendFailure('sendProviderLinkedNoticeEmail', error)
    logger.error('Failed to send provider linked notice email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/** Every mail as subject, HTML and text without sending it, keyed by the function that sends it. */
export const emailTemplates = {
  sendVerificationEmail: verificationEmail,
  sendUnverifiedAccountWarningEmail: unverifiedAccountWarningEmail,
  sendPasswordResetEmail: passwordResetEmail,
  sendSecurityPasswordResetEmail: securityPasswordResetEmail,
  sendEmailChangeNoticeEmail: emailChangeNoticeEmail,
  sendWelcomeEmail: welcomeEmail,
  sendGameInviteEmail: gameInviteEmail,
  sendAccountDeletionEmail: accountDeletionEmail,
  sendPremiumConfirmationEmail: premiumConfirmationEmail,
  sendSubscriptionNoticeEmail: subscriptionNoticeEmail,
  sendInactiveAccountWarningEmail: inactiveAccountWarningEmail,
  sendTermsChangeNoticeEmail: termsChangeNoticeEmail,
  sendSuspensionNoticeEmail: suspensionNoticeEmail,
  sendProviderLinkedNoticeEmail: providerLinkedNoticeEmail,
}
