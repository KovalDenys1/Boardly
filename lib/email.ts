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
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verify your email - Boardly',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify your email</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎮 Boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Hi ${displayName}! 👋</h2>
              <p>Thanks for signing up for Boardly! Please click the button below to verify your email address and activate your account.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" style="background: #667eea; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  ✓ Verify Email
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #667eea; word-break: break-all; font-size: 12px;">${verifyUrl}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </div>
          </body>
        </html>
      `,
    })
    return { success: true }
  } catch (error) {
    logger.error('Failed to send verification email:', error as Error)
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
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your password - Boardly',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset your password</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎲 Boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
              <p>We received a request to reset your password. Click the button below to create a new password.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: #667eea; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Reset Password
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #667eea; word-break: break-all; font-size: 12px;">${resetUrl}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
            </div>
          </body>
        </html>
      `,
    })
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
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to Boardly! 🎲',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Boardly</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎲 Boardly</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Welcome, ${name}! 🎉</h2>
              <p>Your email has been verified successfully. You're all set to start playing!</p>
              <h3 style="color: #667eea;">What's next?</h3>
              <ul style="color: #666;">
                <li>Create your first lobby and invite friends</li>
                <li>Join existing games with lobby codes</li>
                <li>Play Yahtzee in real-time</li>
                <li>Customize your profile</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXTAUTH_URL}/games" style="background: #667eea; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Start Playing
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Need help? Check out our <a href="${process.env.NEXTAUTH_URL}" style="color: #667eea;">website</a> or reply to this email.
              </p>
            </div>
          </body>
        </html>
      `,
    })
    return { success: true }
  } catch (error) {
    logger.error('Failed to send welcome email:', error as Error)
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
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Confirm Account Deletion - Boardly',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Confirm Account Deletion</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ Account Deletion</h1>
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
                <a href="${deleteUrl}" style="background: #dc2626; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
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
    return { success: true }
  } catch (error) {
    logger.error('Failed to send account deletion email:', error as Error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
