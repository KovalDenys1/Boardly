import { Resend } from 'resend'
import { logger } from './logger'
import { SUPPORT_EMAIL } from './organization-json-ld'
import { majorUnitAmount, type PremiumPlan } from './premium-plans'
import { formatSellerAddress, getSellerIdentity } from './seller-identity'
import { LINK_SUPPORT_URL } from './sold-through-link'

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// The operator's name, address and email under every email (#1163): the
// same imprint the footer and the Terms carry, because a purchase
// confirmation has to name the seller too. An empty string until both
// NEXT_PUBLIC_SELLER_* variables are set, so no template ever ends in a
// line with the name missing. Sits below each template's own closing note.
function emailFooterHtml(): string {
  const seller = getSellerIdentity()
  if (!seller) {
    return ''
  }
  const email = escapeHtml(seller.email)
  return `<p style="color: #999; font-size: 12px; margin: 20px 0 0;">${escapeHtml(seller.legalName)}, ${escapeHtml(formatSellerAddress(seller))}, Norway. Email: <a href="mailto:${email}" style="color: #999;">${email}</a></p>`
}

// The same imprint for a plain-text part. Only the purchase confirmation has
// one so far; it must name the seller there as well, since a text-only client
// never sees emailFooterHtml().
function emailFooterText(): string {
  const seller = getSellerIdentity()
  if (!seller) {
    return ''
  }
  return `${seller.legalName}, ${formatSellerAddress(seller)}, Norway. Email: ${seller.email}`
}

export async function sendVerificationEmail(email: string, token: string, username?: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const verifyUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`
  const displayName = username || 'there'

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verify your email - Boardly',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1F1B16; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #FFC44D; margin: 0; font-size: 28px; font-weight: 900;">boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Hi ${displayName}! 👋</h2>
              <p>Thanks for signing up for Boardly! Please click the button below to verify your email address and activate your account.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="background: #FF6B5B; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  ✓ Verify Email
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #FF6B5B; word-break: break-all; font-size: 12px;">${verifyUrl}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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

  const verifyUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`
  const pluralizedDays = daysUntilDeletion === 1 ? 'day' : 'days'

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Action required: verify your Boardly account in ${daysUntilDeletion} ${pluralizedDays}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #FFC44D; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #1F1B16; margin: 0; font-size: 28px; font-weight: 900;">⚠️ boardly</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #111827; margin-top: 0;">Hi ${username || 'there'}!</h2>
              <p>Your account email is still not verified.</p>
              <p>
                To keep your account, please verify your email within
                <strong>${daysUntilDeletion} ${pluralizedDays}</strong>.
              </p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 14px; margin: 18px 0;">
                <p style="margin: 0; color: #92400e;">
                  Accounts that remain unverified will be automatically deleted.
                </p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="background: #dc2626; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                  Verify Email Now
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">If the button does not work, open this link manually:</p>
              <p style="color: #dc2626; word-break: break-all; font-size: 12px;">${verifyUrl}</p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your password - Boardly',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1F1B16; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #FFC44D; margin: 0; font-size: 28px; font-weight: 900;">boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="margin-top: 0;">We received a request to reset your password. Click the button below to create a new password.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background: #FF6B5B; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Reset Password
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #FF6B5B; word-break: break-all; font-size: 12px;">${resetUrl}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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

  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/forgot-password`
  const greeting = username ? `Hi ${escapeHtml(username)},` : 'Hi,'

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: 'support@boardly.online',
      subject: 'Please set a new Boardly password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1F1B16; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #FFC44D; margin: 0; font-size: 28px; font-weight: 900;">boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="margin-top: 0;">${greeting}</p>
              <p>For security reasons we have reset the password on your Boardly account. Your old password no longer works, and setting a new one takes a minute:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background: #FF6B5B; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Set a new password
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, open this link and enter the email address of your Boardly account:</p>
              <p style="color: #FF6B5B; word-break: break-all; font-size: 12px;">${resetUrl}</p>
              <p>If you sign in with Google, GitHub or Discord, nothing changes for you.</p>
              <p>Your games, friends and Premium are exactly as you left them. Sorry for the interruption, and thanks for playing.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Questions? Just reply to this email.<br>
                The Boardly team
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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
// their own new address from a stranger's without spelling it out in full.
export function maskEmailAddress(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) {
    return '***'
  }
  const local = email.slice(0, at)
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1)
  return `${visible}***${email.slice(at)}`
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

  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/forgot-password`
  const greeting = username ? `Hi ${escapeHtml(username)},` : 'Hi,'
  const maskedNewEmail = escapeHtml(maskEmailAddress(newEmail))

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: previousEmail,
      replyTo: 'support@boardly.online',
      subject: 'Your Boardly email address is being changed',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1F1B16; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #FFC44D; margin: 0; font-size: 28px; font-weight: 900;">boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="margin-top: 0;">${greeting}</p>
              <p>We received a request to change the email address on your Boardly account to <strong>${maskedNewEmail}</strong>. The change takes effect once the new address is confirmed.</p>
              <p>If this was you, there is nothing more to do.</p>
              <p>If it was not you, please reset your password now, even if you usually sign in with Google, GitHub or Discord. A reset signs out every other session on your account and cancels the pending change:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background: #FF6B5B; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Reset my password
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, open this link and enter this email address:</p>
              <p style="color: #FF6B5B; word-break: break-all; font-size: 12px;">${resetUrl}</p>
              <p>Then reply to this email and we will help you check your account.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Questions? Just reply to this email.<br>
                The Boardly team
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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

export async function sendWelcomeEmail(email: string, name: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to Boardly! 🎲',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1F1B16; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #FFC44D; margin: 0; font-size: 28px; font-weight: 900;">boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Welcome, ${name}! 🎉</h2>
              <p>Your email has been verified successfully. You're all set to start playing!</p>
              <h3 style="color: #FF6B5B;">What's next?</h3>
              <ul style="color: #666;">
                <li>Create your first lobby and invite friends</li>
                <li>Join existing games with lobby codes</li>
                <li>Play Yahtzee in real-time</li>
                <li>Customize your profile</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXTAUTH_URL}/games" target="_blank" rel="noopener noreferrer" style="background: #FF6B5B; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Start Playing
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Need help? Check out our <a href="${process.env.NEXTAUTH_URL}" style="color: #FF6B5B;">website</a> or reply to this email.
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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

  const displayGameType = escapeHtml(gameType.replace(/_/g, ' '))
  const safeRecipient = escapeHtml(recipientName)
  const safeSender = escapeHtml(senderName)
  const safeLobby = lobbyName ? escapeHtml(lobbyName) : ''

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `${senderName} invited you to play ${gameType.replace(/_/g, ' ')} on Boardly`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1F1B16; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #FFC44D; margin: 0; font-size: 28px; font-weight: 900;">boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Hey ${safeRecipient}! 🎲</h2>
              <p><strong>${safeSender}</strong> has invited you to join a game of <strong>${displayGameType}</strong>.</p>
              ${safeLobby ? `<p style="color: #666;">Lobby: <strong>${safeLobby}</strong></p>` : ''}
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer" style="background: #FF6B5B; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Join Game
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #FF6B5B; word-break: break-all; font-size: 12px;">${inviteUrl}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                You received this email because ${safeSender} invited you to a game. To stop receiving game invite emails, update your notification preferences in your Boardly profile.
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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

export async function sendAccountDeletionEmail(email: string, token: string, username: string) {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured. Skipping email send.')
    return { success: false, error: 'Email service not configured' }
  }

  const deleteUrl = `${process.env.NEXTAUTH_URL}/auth/delete-account?token=${token}`

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Confirm Account Deletion - Boardly',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #FF6B5B; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 900;">⚠️ boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Hi ${username},</h2>
              <p>We received a request to delete your Boardly account.</p>

              <div style="background: #fee; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #991b1b; font-weight: bold;">⚠️ This action is permanent and cannot be undone!</p>
              </div>

              <p><strong>What will be deleted:</strong></p>
              <ul style="color: #666;">
                <li>Your profile and all personal information</li>
                <li>All game history and statistics</li>
                <li>Friend connections and requests</li>
                <li>Any unlocked achievements</li>
              </ul>

              <p>If you're sure you want to proceed, click the button below:</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${deleteUrl}" target="_blank" rel="noopener noreferrer" style="background: #dc2626; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  ⚠️ Confirm Account Deletion
                </a>
              </div>

              <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #dc2626; word-break: break-all; font-size: 12px;">${deleteUrl}</p>

              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

              <p style="color: #999; font-size: 12px; margin: 0;">
                This link will expire in 1 hour. If you didn't request account deletion, please ignore this email and your account will remain active. Consider changing your password if you're concerned about account security.
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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
          `You can cancel at any time with one click from your profile at ${links.profile}. The cancellation takes effect at the end of the period you have paid for, and you keep Premium until then. If you cancel a yearly plan early, we refund the unused whole months.`,
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
          `Du kan si opp når som helst med ett klikk fra profilen din på ${links.profile}. Oppsigelsen gjelder fra utløpet av perioden du har betalt for, og du beholder Premium til da. Sier du opp et årsabonnement før tiden, betaler vi tilbake de ubrukte hele månedene.`,
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

// Every paragraph is escaped whole, then the three site links, Link's support
// page and the support address are turned back into anchors by exact match.
// Copy therefore never carries markup, and the username cannot smuggle any in.
function linkify(escaped: string, links: ConfirmationLinks): string {
  let html = escaped
  for (const url of [links.profile, links.withdrawal, links.terms, LINK_SUPPORT_URL]) {
    const safe = escapeHtml(url)
    html = html.split(safe).join(`<a href="${safe}" style="color: #FF6B5B;">${safe}</a>`)
  }
  return html
    .split(SUPPORT_EMAIL)
    .join(`<a href="mailto:${SUPPORT_EMAIL}" style="color: #FF6B5B;">${SUPPORT_EMAIL}</a>`)
}

function confirmationCopyHtml(copy: ConfirmationCopy, links: ConfirmationLinks): string {
  const paragraph = (text: string) => `<p>${linkify(escapeHtml(text), links)}</p>`
  const sections = copy.sections
    .map(
      (section) =>
        `<h3 style="color: #FF6B5B; font-size: 16px; margin: 24px 0 6px;">${escapeHtml(section.heading)}</h3>` +
        section.paragraphs.map(paragraph).join('')
    )
    .join('')
  return `<p style="margin-top: 0;">${escapeHtml(copy.greeting)}</p>${paragraph(copy.intro)}${sections}`
}

function confirmationCopyText(copy: ConfirmationCopy): string {
  const sections = copy.sections.map((section) => [section.heading.toUpperCase(), ...section.paragraphs].join('\n'))
  return [copy.greeting, copy.intro, ...sections].join('\n\n')
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

  const base = process.env.NEXTAUTH_URL ?? ''
  const links: ConfirmationLinks = {
    profile: `${base}/profile`,
    withdrawal: `${base}/withdrawal`,
    terms: `${base}/terms`,
  }
  const english = englishConfirmationCopy(details, links)
  const norwegian = norwegianConfirmationCopy(details, links)
  const closingEn = `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`
  const closingNo = `Spørsmål? Svar på denne e-posten eller skriv til ${SUPPORT_EMAIL}.`
  const signature = 'The Boardly team'
  const footerText = emailFooterText()

  const text = [
    confirmationCopyText(english),
    '----',
    confirmationCopyText(norwegian),
    '----',
    `${closingEn}\n${closingNo}\n${signature}`,
    footerText,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n')

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: SUPPORT_EMAIL,
      subject: 'Your Boardly Premium confirmation / Bekreftelse på Boardly Premium',
      text,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1F1B16; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #FFC44D; margin: 0; font-size: 28px; font-weight: 900;">boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <div lang="en">${confirmationCopyHtml(english, links)}</div>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <div lang="nb">${confirmationCopyHtml(norwegian, links)}</div>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                ${linkify(escapeHtml(closingEn), links)}<br>
                ${linkify(escapeHtml(closingNo), links)}<br>
                ${signature}
              </p>
              ${emailFooterHtml()}
            </div>
          </body>
        </html>
      `,
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
