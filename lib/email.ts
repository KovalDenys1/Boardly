import { Resend } from 'resend'
import { logger } from './logger'

// Only initialize Resend if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.EMAIL_FROM || 'Boardly <onboarding@resend.dev>'

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
    logger.error('Failed to send password reset email:', error as Error)
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

  const displayGameType = gameType.replace(/_/g, ' ')

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `${senderName} invited you to play ${displayGameType} on Boardly`,
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
              <h2 style="color: #333; margin-top: 0;">Hey ${recipientName}! 🎲</h2>
              <p><strong>${senderName}</strong> has invited you to join a game of <strong>${displayGameType}</strong>.</p>
              ${lobbyName ? `<p style="color: #666;">Lobby: <strong>${lobbyName}</strong></p>` : ''}
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer" style="background: #FF6B5B; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Join Game
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #FF6B5B; word-break: break-all; font-size: 12px;">${inviteUrl}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                You received this email because ${senderName} invited you to a game. To stop receiving game invite emails, update your notification preferences in your Boardly profile.
              </p>
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
    logger.error('Failed to send account deletion email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
