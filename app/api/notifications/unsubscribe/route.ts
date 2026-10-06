import { NextRequest, NextResponse } from 'next/server'
import {
  upsertNotificationPreferences,
  verifyNotificationUnsubscribeToken,
} from '@/lib/notification-preferences'
import { emailLanguageFromRequest } from '@/lib/email-language'
import { escapeHtml, type EmailLanguage } from '@/lib/email-layout'

type TokenType = NonNullable<ReturnType<typeof verifyNotificationUnsubscribeToken>>['type']

const KIND: Record<TokenType, Record<EmailLanguage, string>> = {
  gameInvites: { en: 'game invite emails', nb: 'e-post om spillinvitasjoner' },
  turnReminders: { en: 'turn reminder emails', nb: 'e-post om påminnelser om tur' },
  friendRequests: { en: 'friend request emails', nb: 'e-post om venneforespørsler' },
  friendAccepted: { en: 'emails about accepted friend requests', nb: 'e-post om godtatte venneforespørsler' },
  marketingConsent: { en: 'news and offers from Boardly', nb: 'nyheter og tilbud fra Boardly' },
  all: { en: 'all notification emails', nb: 'all e-post om varsler' },
}

const COPY = {
  en: {
    confirmTitle: 'Turn off these emails?',
    confirm: (kind: string) => `Press the button to stop ${kind}. Mails about your account's security, legal notices and payments still arrive.`,
    button: 'Turn them off',
    doneTitle: 'Done',
    done: (kind: string) => `You will no longer get ${kind}. You can turn them back on in your email settings.`,
    invalidTitle: 'This link no longer works',
    invalid: 'The link is invalid or has expired. You can choose which emails you get in your email settings.',
    settings: 'Email settings',
  },
  nb: {
    confirmTitle: 'Slå av denne e-posten?',
    confirm: (kind: string) => `Trykk på knappen for å stoppe ${kind}. E-post om sikkerheten til kontoen, juridiske varsler og betalinger kommer fortsatt.`,
    button: 'Slå av',
    doneTitle: 'Ferdig',
    done: (kind: string) => `Du får ikke lenger ${kind}. Du kan slå dem på igjen i e-postinnstillingene.`,
    invalidTitle: 'Denne lenken virker ikke lenger',
    invalid: 'Lenken er ugyldig eller har utløpt. Du kan velge hvilken e-post du får i e-postinnstillingene.',
    settings: 'E-postinnstillinger',
  },
} as const

function page(lang: EmailLanguage, title: string, body: string, action = '', status = 200) {
  const settings = `${process.env.NEXTAUTH_URL || 'https://boardly.online'}/profile?tab=settings#notifications`
  return new NextResponse(
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>` +
      `<style>body{margin:0;padding:32px 16px;background:#FBF6EE;color:#1F1B16;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}main{max-width:520px;margin:0 auto;background:#fff;border:2px solid #1F1B16;border-bottom-width:6px;border-radius:24px;padding:24px 28px}h1{margin:0 0 10px;font-size:26px;line-height:1.2}button{font:inherit;font-weight:700;padding:12px 24px;border-radius:16px;border:2px solid #FF6B5B;border-bottom:4px solid #E04B3B;background:#FF6B5B;color:#1F1B16;cursor:pointer}button:focus-visible{outline:3px solid #1F1B16;outline-offset:-6px}a{color:#1F1B16;text-decoration-color:#FF6B5B;text-decoration-thickness:2px}@media (prefers-color-scheme:dark){body{background:#1E1B17;color:#F0E8DB}main{background:#2B2720;border-color:#F0E8DB}a{color:#F0E8DB}button:focus-visible{outline-color:#F0E8DB}}</style>` +
      `</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>${action}<p><a href="${escapeHtml(settings)}">${COPY[lang].settings}</a></p></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

async function applyUnsubscribe(token: string): Promise<{ ok: true; type: TokenType } | { ok: false }> {
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

/**
 * The link in a mail's footer. It only asks: link scanners and mail security gateways open
 * every link they see, so a GET that changed a preference would turn mail off for people who
 * never clicked. The button POSTs back here with `confirm=1`.
 */
export async function GET(request: NextRequest) {
  const lang = emailLanguageFromRequest(request) ?? 'en'
  const token = request.nextUrl.searchParams.get('token') || ''
  const payload = verifyNotificationUnsubscribeToken(token)

  if (!payload) {
    return page(lang, COPY[lang].invalidTitle, COPY[lang].invalid, '', 400)
  }

  const form =
    `<form method="post" action="?token=${encodeURIComponent(token)}">` +
    `<input type="hidden" name="confirm" value="1"><button type="submit">${COPY[lang].button}</button></form>`
  return page(lang, COPY[lang].confirmTitle, COPY[lang].confirm(KIND[payload.type][lang]), form)
}

async function confirmedFromPage(request: NextRequest): Promise<boolean> {
  if (!(request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded')) return false
  try {
    return new URLSearchParams(await request.text()).get('confirm') === '1'
  } catch {
    return false
  }
}

/**
 * Two callers. RFC 8058 one-click: a mail client that sees List-Unsubscribe and
 * List-Unsubscribe-Post POSTs `List-Unsubscribe=One-Click` straight here with no page shown,
 * so it gets JSON, never HTML. And the button on the GET page, which sends `confirm=1` and
 * gets the page that says it is done. Both make the same change.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const fromPage = await confirmedFromPage(request)
  const result = await applyUnsubscribe(token)

  if (fromPage) {
    const lang = emailLanguageFromRequest(request) ?? 'en'
    return result.ok
      ? page(lang, COPY[lang].doneTitle, COPY[lang].done(KIND[result.type][lang]))
      : page(lang, COPY[lang].invalidTitle, COPY[lang].invalid, '', 400)
  }

  if (!result.ok) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
