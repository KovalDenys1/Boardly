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

async function applyUnsubscribe(token: string): Promise<{ ok: true; type: string } | { ok: false }> {
  const payload = verifyNotificationUnsubscribeToken(token)
  if (!payload) {
    return { ok: false }
  }

  if (payload.type === 'all') {
    await upsertNotificationPreferences(payload.userId, { unsubscribedAll: true })
  } else {
    await upsertNotificationPreferences(payload.userId, {
      [payload.type]: false,
    })
  }

  return { ok: true, type: payload.type }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const result = await applyUnsubscribe(token)

  if (!result.ok) {
    return html('Invalid unsubscribe link', 'This unsubscribe link is invalid or expired.', 400)
  }

  if (result.type === 'all') {
    return html('Unsubscribed', 'You will no longer receive Boardly notification emails.')
  }

  return html(
    'Preference updated',
    `You have been unsubscribed from ${result.type} email notifications.`
  )
}

/**
 * RFC 8058 one-click unsubscribe: a mail client that sees both List-Unsubscribe and
 * List-Unsubscribe-Post (lib/notification-preferences.ts buildMarketingUnsubscribeHeaders)
 * POSTs `List-Unsubscribe=One-Click` straight to this same URL, with no page shown to the
 * person and no further click, so this must perform the exact same change as the GET
 * link above and answer with no human-facing content — a JSON body, never HTML.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const result = await applyUnsubscribe(token)

  if (!result.ok) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
