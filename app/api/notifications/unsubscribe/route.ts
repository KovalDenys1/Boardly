import { NextRequest, NextResponse } from 'next/server'
import {
  upsertNotificationPreferences,
  verifyNotificationUnsubscribeToken,
} from '@/lib/notification-preferences'

function html(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="font-family: Arial, sans-serif; background:#f8fafc; color:#111827; padding:24px;"><div style="max-width:640px;margin:0 auto;background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;"><h1 style="margin-top:0;">${title}</h1><p>${message}</p></div></body></html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  )
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const payload = verifyNotificationUnsubscribeToken(token)

  if (!payload) {
    return html('Invalid unsubscribe link', 'This unsubscribe link is invalid or expired.', 400)
  }

  if (payload.type === 'all') {
    await upsertNotificationPreferences(payload.userId, { unsubscribedAll: true })
    return html('Unsubscribed', 'You will no longer receive Boardly notification emails.')
  }

  await upsertNotificationPreferences(payload.userId, {
    [payload.type]: false,
  })

  return html(
    'Preference updated',
    `You have been unsubscribed from ${payload.type} email notifications.`
  )
}
